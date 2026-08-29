-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.digital_visibility AS ENUM ('private', 'shared', 'public');
CREATE TYPE public.digital_profile_status AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE public.digital_goal_priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE public.digital_goal_status AS ENUM ('draft', 'active', 'paused', 'achieved', 'abandoned');
CREATE TYPE public.digital_authority_status AS ENUM ('active', 'revoked', 'expired');
CREATE TYPE public.digital_capability AS ENUM (
  'read_profile',
  'read_preference',
  'read_goal',
  'read_memory',
  'create_intent',
  'request_capability',
  'request_quote',
  'request_action'
);

-- =========================
-- DIGITAL PROFILES: identity + control layer
-- =========================
ALTER TABLE public.digital_profiles RENAME COLUMN owner_id TO user_id;
ALTER TABLE public.digital_profiles
  ADD COLUMN status public.digital_profile_status NOT NULL DEFAULT 'active',
  ADD COLUMN visibility public.digital_visibility NOT NULL DEFAULT 'private';

ALTER TABLE public.digital_profiles DROP CONSTRAINT IF EXISTS digital_profiles_profile_type_check;

UPDATE public.digital_profiles
SET profile_type = CASE WHEN user_id IS NOT NULL THEN 'person' ELSE 'organization' END
WHERE profile_type NOT IN ('person', 'organization', 'business');

ALTER TABLE public.digital_profiles
  ADD CONSTRAINT digital_profiles_profile_type_check
  CHECK (profile_type IN ('person', 'organization', 'business'));

ALTER TABLE public.digital_profiles
  ADD CONSTRAINT digital_profiles_owner_shape_check
  CHECK (
    (profile_type = 'person' AND user_id IS NOT NULL)
    OR (profile_type IN ('organization', 'business') AND user_id IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS digital_profiles_id_org_key
  ON public.digital_profiles (id, organization_id);

-- =========================
-- ACCESS HELPERS (security definer, no recursion)
-- =========================
CREATE OR REPLACE FUNCTION public.controls_digital_profile(_profile uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.digital_profiles p
    WHERE p.id = _profile
      AND (
        (p.profile_type = 'person' AND p.user_id = auth.uid())
        OR (
          p.profile_type IN ('organization', 'business')
          AND public.has_org_role(p.organization_id, ARRAY['owner'::app_role, 'admin'::app_role])
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_digital_profile(_profile uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.digital_profiles p
    WHERE p.id = _profile
      AND (
        public.controls_digital_profile(p.id)
        OR (
          p.visibility IN ('shared', 'public')
          AND public.is_org_member(p.organization_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.digital_profile_org(_profile uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.organization_id FROM public.digital_profiles p WHERE p.id = _profile;
$$;

-- =========================
-- AUDIT: reuse agent_activity_logs
-- =========================
CREATE OR REPLACE FUNCTION public.log_digital_self_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row jsonb;
  _org uuid;
  _profile uuid;
  _agent uuid := NULL;
  _event text;
BEGIN
  _row := to_jsonb(COALESCE(NEW, OLD));

  IF TG_TABLE_NAME = 'digital_profiles' THEN
    _profile := (_row->>'id')::uuid;
    _org := (_row->>'organization_id')::uuid;
  ELSE
    _profile := (_row->>'digital_profile_id')::uuid;
    _org := public.digital_profile_org(_profile);
  END IF;

  IF TG_TABLE_NAME = 'digital_authority_rules' THEN
    _agent := NULLIF(_row->>'agent_id', '')::uuid;
    IF TG_OP = 'INSERT' THEN
      _event := CASE WHEN (_row->>'allowed')::boolean THEN 'digital_authority.granted' ELSE 'digital_authority.denied' END;
    ELSIF TG_OP = 'UPDATE' THEN
      _event := CASE
        WHEN NEW.status = 'revoked' AND OLD.status <> 'revoked' THEN 'digital_authority.revoked'
        WHEN NEW.allowed AND NOT OLD.allowed THEN 'digital_authority.granted'
        WHEN OLD.allowed AND NOT NEW.allowed THEN 'digital_authority.denied'
        ELSE 'digital_authority.updated'
      END;
    ELSE
      _event := 'digital_authority.deleted';
    END IF;
  ELSE
    _event := TG_TABLE_NAME || '.' || lower(TG_OP);
  END IF;

  IF _org IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.agent_activity_logs (agent_id, organization_id, actor_id, event, payload)
  VALUES (
    _agent,
    _org,
    auth.uid(),
    _event,
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'digital_profile_id', _profile,
      'record_id', _row->>'id',
      'agent_id', _agent,
      'capability', _row->>'capability',
      'allowed', _row->>'allowed',
      'scope', _row->'scope',
      'expires_at', _row->>'expires_at',
      'status', _row->>'status',
      'granted_by', _row->>'granted_by',
      'occurred_at', now()
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- =========================
-- DIGITAL PREFERENCES
-- =========================
CREATE TABLE public.digital_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digital_profile_id uuid NOT NULL REFERENCES public.digital_profiles(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (char_length(btrim(key)) BETWEEN 1 AND 80),
  value text NOT NULL DEFAULT '' CHECK (char_length(value) <= 2000),
  visibility public.digital_visibility NOT NULL DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (digital_profile_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_preferences TO authenticated;
GRANT ALL ON public.digital_preferences TO service_role;
ALTER TABLE public.digital_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY digital_preferences_select ON public.digital_preferences
  FOR SELECT TO authenticated
  USING (
    public.can_read_digital_profile(digital_profile_id)
    AND (visibility <> 'private' OR public.controls_digital_profile(digital_profile_id))
  );
CREATE POLICY digital_preferences_insert ON public.digital_preferences
  FOR INSERT TO authenticated
  WITH CHECK (public.controls_digital_profile(digital_profile_id));
CREATE POLICY digital_preferences_update ON public.digital_preferences
  FOR UPDATE TO authenticated
  USING (public.controls_digital_profile(digital_profile_id))
  WITH CHECK (public.controls_digital_profile(digital_profile_id));
CREATE POLICY digital_preferences_delete ON public.digital_preferences
  FOR DELETE TO authenticated
  USING (public.controls_digital_profile(digital_profile_id));

CREATE INDEX digital_preferences_profile_idx ON public.digital_preferences (digital_profile_id);

-- =========================
-- DIGITAL GOALS
-- =========================
CREATE TABLE public.digital_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digital_profile_id uuid NOT NULL REFERENCES public.digital_profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 160),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  priority public.digital_goal_priority NOT NULL DEFAULT 'medium',
  status public.digital_goal_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_goals TO authenticated;
GRANT ALL ON public.digital_goals TO service_role;
ALTER TABLE public.digital_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY digital_goals_select ON public.digital_goals
  FOR SELECT TO authenticated
  USING (public.can_read_digital_profile(digital_profile_id));
CREATE POLICY digital_goals_insert ON public.digital_goals
  FOR INSERT TO authenticated
  WITH CHECK (public.controls_digital_profile(digital_profile_id));
CREATE POLICY digital_goals_update ON public.digital_goals
  FOR UPDATE TO authenticated
  USING (public.controls_digital_profile(digital_profile_id))
  WITH CHECK (public.controls_digital_profile(digital_profile_id));
CREATE POLICY digital_goals_delete ON public.digital_goals
  FOR DELETE TO authenticated
  USING (public.controls_digital_profile(digital_profile_id));

CREATE INDEX digital_goals_profile_idx ON public.digital_goals (digital_profile_id);

-- =========================
-- DIGITAL MEMORY ITEMS
-- =========================
CREATE TABLE public.digital_memory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digital_profile_id uuid NOT NULL REFERENCES public.digital_profiles(id) ON DELETE CASCADE,
  memory_type text NOT NULL DEFAULT 'note' CHECK (memory_type IN ('note', 'fact', 'preference_signal', 'context')),
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 4000),
  source text NOT NULL DEFAULT 'owner' CHECK (source IN ('owner', 'system')),
  confidence numeric(3,2) NOT NULL DEFAULT 1.00 CHECK (confidence >= 0 AND confidence <= 1),
  visibility public.digital_visibility NOT NULL DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_memory_items TO authenticated;
GRANT ALL ON public.digital_memory_items TO service_role;
ALTER TABLE public.digital_memory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY digital_memory_items_select ON public.digital_memory_items
  FOR SELECT TO authenticated
  USING (
    public.can_read_digital_profile(digital_profile_id)
    AND (visibility <> 'private' OR public.controls_digital_profile(digital_profile_id))
  );
CREATE POLICY digital_memory_items_insert ON public.digital_memory_items
  FOR INSERT TO authenticated
  WITH CHECK (public.controls_digital_profile(digital_profile_id));
CREATE POLICY digital_memory_items_update ON public.digital_memory_items
  FOR UPDATE TO authenticated
  USING (public.controls_digital_profile(digital_profile_id))
  WITH CHECK (public.controls_digital_profile(digital_profile_id));
CREATE POLICY digital_memory_items_delete ON public.digital_memory_items
  FOR DELETE TO authenticated
  USING (public.controls_digital_profile(digital_profile_id));

CREATE INDEX digital_memory_items_profile_idx ON public.digital_memory_items (digital_profile_id);

-- =========================
-- DIGITAL AUTHORITY RULES (permission granted BY the owner)
-- =========================
CREATE TABLE public.digital_authority_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digital_profile_id uuid NOT NULL REFERENCES public.digital_profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NULL,
  capability public.digital_capability NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NULL,
  status public.digital_authority_status NOT NULL DEFAULT 'active',
  granted_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT digital_authority_rules_agent_org_fkey
    FOREIGN KEY (agent_id, organization_id)
    REFERENCES public.agents (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT digital_authority_rules_profile_org_fkey
    FOREIGN KEY (digital_profile_id, organization_id)
    REFERENCES public.digital_profiles (id, organization_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX digital_authority_rules_unique_agent
  ON public.digital_authority_rules (digital_profile_id, capability, agent_id)
  WHERE agent_id IS NOT NULL;
CREATE UNIQUE INDEX digital_authority_rules_unique_default
  ON public.digital_authority_rules (digital_profile_id, capability)
  WHERE agent_id IS NULL;
CREATE INDEX digital_authority_rules_profile_idx ON public.digital_authority_rules (digital_profile_id);
CREATE INDEX digital_authority_rules_agent_idx ON public.digital_authority_rules (agent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_authority_rules TO authenticated;
GRANT ALL ON public.digital_authority_rules TO service_role;
ALTER TABLE public.digital_authority_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY digital_authority_rules_select ON public.digital_authority_rules
  FOR SELECT TO authenticated
  USING (public.controls_digital_profile(digital_profile_id));
CREATE POLICY digital_authority_rules_insert ON public.digital_authority_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.controls_digital_profile(digital_profile_id)
    AND organization_id = public.digital_profile_org(digital_profile_id)
    AND (granted_by IS NULL OR granted_by = auth.uid())
  );
CREATE POLICY digital_authority_rules_update ON public.digital_authority_rules
  FOR UPDATE TO authenticated
  USING (public.controls_digital_profile(digital_profile_id))
  WITH CHECK (
    public.controls_digital_profile(digital_profile_id)
    AND organization_id = public.digital_profile_org(digital_profile_id)
  );
CREATE POLICY digital_authority_rules_delete ON public.digital_authority_rules
  FOR DELETE TO authenticated
  USING (public.controls_digital_profile(digital_profile_id));

-- expiry lifecycle: an expired rule grants nothing
CREATE OR REPLACE FUNCTION public.digital_authority_apply_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() AND NEW.status = 'active' THEN
    NEW.status := 'expired';
  END IF;
  IF NEW.status <> 'active' THEN
    NEW.allowed := false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER digital_authority_rules_expiry
  BEFORE INSERT OR UPDATE ON public.digital_authority_rules
  FOR EACH ROW EXECUTE FUNCTION public.digital_authority_apply_expiry();

-- =========================
-- updated_at + audit triggers
-- =========================
CREATE TRIGGER digital_preferences_set_updated_at BEFORE UPDATE ON public.digital_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER digital_goals_set_updated_at BEFORE UPDATE ON public.digital_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER digital_memory_items_set_updated_at BEFORE UPDATE ON public.digital_memory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER digital_authority_rules_set_updated_at BEFORE UPDATE ON public.digital_authority_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER digital_profiles_audit AFTER INSERT OR UPDATE OR DELETE ON public.digital_profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_digital_self_event();
CREATE TRIGGER digital_preferences_audit AFTER INSERT OR UPDATE OR DELETE ON public.digital_preferences
  FOR EACH ROW EXECUTE FUNCTION public.log_digital_self_event();
CREATE TRIGGER digital_goals_audit AFTER INSERT OR UPDATE OR DELETE ON public.digital_goals
  FOR EACH ROW EXECUTE FUNCTION public.log_digital_self_event();
CREATE TRIGGER digital_memory_items_audit AFTER INSERT OR UPDATE OR DELETE ON public.digital_memory_items
  FOR EACH ROW EXECUTE FUNCTION public.log_digital_self_event();
CREATE TRIGGER digital_authority_rules_audit AFTER INSERT OR UPDATE OR DELETE ON public.digital_authority_rules
  FOR EACH ROW EXECUTE FUNCTION public.log_digital_self_event();

-- =========================
-- DIGITAL PROFILES: ownership-correct policies
-- =========================
DROP POLICY IF EXISTS digital_profiles_select ON public.digital_profiles;
DROP POLICY IF EXISTS digital_profiles_insert ON public.digital_profiles;
DROP POLICY IF EXISTS digital_profiles_update ON public.digital_profiles;
DROP POLICY IF EXISTS digital_profiles_delete ON public.digital_profiles;

CREATE POLICY digital_profiles_select ON public.digital_profiles
  FOR SELECT TO authenticated
  USING (public.can_read_digital_profile(id));

CREATE POLICY digital_profiles_insert ON public.digital_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      (profile_type = 'person' AND user_id = auth.uid())
      OR (
        profile_type IN ('organization', 'business')
        AND user_id IS NULL
        AND public.has_org_role(organization_id, ARRAY['owner'::app_role, 'admin'::app_role])
      )
    )
  );

CREATE POLICY digital_profiles_update ON public.digital_profiles
  FOR UPDATE TO authenticated
  USING (public.controls_digital_profile(id))
  WITH CHECK (
    public.controls_digital_profile(id)
    AND (profile_type <> 'person' OR user_id = auth.uid())
  );

CREATE POLICY digital_profiles_delete ON public.digital_profiles
  FOR DELETE TO authenticated
  USING (public.controls_digital_profile(id));

-- =========================
-- DEMO DATA (Owner A, all private)
-- =========================
INSERT INTO public.digital_profiles
  (id, organization_id, user_id, display_name, profile_type, status, visibility, metadata)
VALUES (
  'b1a10000-0000-4000-8000-000000000001',
  '169f46e3-d696-4041-8af5-7b608b424285',
  '4f46436f-195e-40bb-b3eb-14b5f0a5ca30',
  'Owner A',
  'person',
  'active',
  'private',
  '{"headline": "Logistics operator", "locale": "id-ID"}'::jsonb
);

INSERT INTO public.digital_preferences (digital_profile_id, key, value, visibility) VALUES
  ('b1a10000-0000-4000-8000-000000000001', 'communication_style', 'simple', 'private'),
  ('b1a10000-0000-4000-8000-000000000001', 'preferred_language', 'Indonesian', 'private');

INSERT INTO public.digital_goals (digital_profile_id, title, description, priority, status) VALUES
  ('b1a10000-0000-4000-8000-000000000001', 'Grow logistics business', 'Expand operational capacity and reach in the logistics business.', 'high', 'active');

INSERT INTO public.digital_memory_items (digital_profile_id, memory_type, content, source, confidence, visibility) VALUES
  ('b1a10000-0000-4000-8000-000000000001', 'preference_signal', 'Prefers concise operational information', 'owner', 0.90, 'private');

INSERT INTO public.digital_authority_rules
  (digital_profile_id, organization_id, agent_id, capability, allowed, scope, status, granted_by)
VALUES
  ('b1a10000-0000-4000-8000-000000000001', '169f46e3-d696-4041-8af5-7b608b424285', NULL, 'read_profile', true, '{}'::jsonb, 'active', '4f46436f-195e-40bb-b3eb-14b5f0a5ca30'),
  ('b1a10000-0000-4000-8000-000000000001', '169f46e3-d696-4041-8af5-7b608b424285', NULL, 'read_preference', true, '{}'::jsonb, 'active', '4f46436f-195e-40bb-b3eb-14b5f0a5ca30'),
  ('b1a10000-0000-4000-8000-000000000001', '169f46e3-d696-4041-8af5-7b608b424285', NULL, 'read_goal', true, '{}'::jsonb, 'active', '4f46436f-195e-40bb-b3eb-14b5f0a5ca30'),
  ('b1a10000-0000-4000-8000-000000000001', '169f46e3-d696-4041-8af5-7b608b424285', NULL, 'read_memory', false, '{}'::jsonb, 'active', '4f46436f-195e-40bb-b3eb-14b5f0a5ca30'),
  ('b1a10000-0000-4000-8000-000000000001', '169f46e3-d696-4041-8af5-7b608b424285', NULL, 'create_intent', false, '{}'::jsonb, 'active', '4f46436f-195e-40bb-b3eb-14b5f0a5ca30'),
  ('b1a10000-0000-4000-8000-000000000001', '169f46e3-d696-4041-8af5-7b608b424285', NULL, 'request_capability', false, '{}'::jsonb, 'active', '4f46436f-195e-40bb-b3eb-14b5f0a5ca30'),
  ('b1a10000-0000-4000-8000-000000000001', '169f46e3-d696-4041-8af5-7b608b424285', NULL, 'request_quote', false, '{}'::jsonb, 'active', '4f46436f-195e-40bb-b3eb-14b5f0a5ca30'),
  ('b1a10000-0000-4000-8000-000000000001', '169f46e3-d696-4041-8af5-7b608b424285', NULL, 'request_action', false, '{}'::jsonb, 'active', '4f46436f-195e-40bb-b3eb-14b5f0a5ca30');
