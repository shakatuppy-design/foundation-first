-- Session 3B: Intent & Discovery foundation.
-- Discovery is NOT authority. Advertised capability != verified capability != authority.

CREATE TYPE public.digital_intent_type AS ENUM ('general','discovery','procurement','logistics','service','research');
CREATE TYPE public.digital_intent_status AS ENUM ('draft','active','paused','fulfilled','cancelled','expired');
CREATE TYPE public.digital_intent_priority AS ENUM ('low','medium','high','critical');
CREATE TYPE public.discovery_visibility AS ENUM ('private','unlisted','public');
CREATE TYPE public.discovery_status AS ENUM ('draft','listed','delisted');

-- 1. INTENTS -----------------------------------------------------------------
CREATE TABLE public.digital_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digital_profile_id uuid NOT NULL REFERENCES public.digital_profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 160),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  intent_type public.digital_intent_type NOT NULL DEFAULT 'general',
  status public.digital_intent_status NOT NULL DEFAULT 'draft',
  priority public.digital_intent_priority NOT NULL DEFAULT 'medium',
  discovery_requirement jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.digital_intents FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_intents TO authenticated;
GRANT ALL ON public.digital_intents TO service_role;

ALTER TABLE public.digital_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Controllers read own intents" ON public.digital_intents
  FOR SELECT TO authenticated USING (public.controls_digital_profile(digital_profile_id));
CREATE POLICY "Controllers create own intents" ON public.digital_intents
  FOR INSERT TO authenticated WITH CHECK (public.controls_digital_profile(digital_profile_id));
CREATE POLICY "Controllers update own intents" ON public.digital_intents
  FOR UPDATE TO authenticated USING (public.controls_digital_profile(digital_profile_id))
  WITH CHECK (public.controls_digital_profile(digital_profile_id));
CREATE POLICY "Controllers delete own intents" ON public.digital_intents
  FOR DELETE TO authenticated USING (public.controls_digital_profile(digital_profile_id));

CREATE INDEX idx_digital_intents_profile_status ON public.digital_intents (digital_profile_id, status);
CREATE INDEX idx_digital_intents_created_at ON public.digital_intents (created_at DESC);

CREATE TRIGGER digital_intents_set_updated_at
  BEFORE UPDATE ON public.digital_intents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. DISCOVERY IDENTIFIER ----------------------------------------------------
-- Experimental, non-sensitive lookup handle only. NOT an address, NOT a phone
-- replacement, NOT a universal identity, NOT a communication endpoint.
CREATE OR REPLACE FUNCTION public.generate_discovery_id()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'lg_' || replace(gen_random_uuid()::text, '-', '');
$$;

-- 3. DISCOVERY PROFILES ------------------------------------------------------
CREATE TABLE public.agent_discovery_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL UNIQUE REFERENCES public.agents(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  discovery_id text NOT NULL UNIQUE DEFAULT public.generate_discovery_id()
    CHECK (char_length(discovery_id) BETWEEN 8 AND 64),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  categories text[] NOT NULL DEFAULT '{}'::text[] CHECK (array_length(categories, 1) IS NULL OR array_length(categories, 1) <= 12),
  capabilities text[] NOT NULL DEFAULT '{}'::text[] CHECK (array_length(capabilities, 1) IS NULL OR array_length(capabilities, 1) <= 24),
  visibility public.discovery_visibility NOT NULL DEFAULT 'private',
  status public.discovery_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_discovery_profiles_agent_org_fkey
    FOREIGN KEY (agent_id, organization_id) REFERENCES public.agents(id, organization_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.agent_discovery_profiles IS
  'Advertised, self-declared discovery metadata for an agent. Discovery does not grant authority; advertised capability != verified capability != authority (see digital_authority_rules).';
COMMENT ON COLUMN public.agent_discovery_profiles.discovery_id IS
  'Experimental non-sensitive lookup handle. Not an AI address, phone replacement, universal identity, or communication endpoint.';
COMMENT ON COLUMN public.agent_discovery_profiles.capabilities IS
  'Self-declared, unverified advertising tags. Never used for any access or authority decision.';

REVOKE ALL ON public.agent_discovery_profiles FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_discovery_profiles TO authenticated;
GRANT ALL ON public.agent_discovery_profiles TO service_role;

ALTER TABLE public.agent_discovery_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage-view discovery profiles" ON public.agent_discovery_profiles
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

CREATE POLICY "Discoverable profiles of active agents are readable" ON public.agent_discovery_profiles
  FOR SELECT TO authenticated USING (
    visibility IN ('public','unlisted')
    AND status = 'listed'
    AND public.agent_is_eligible(agent_id)
  );

CREATE POLICY "Org owners and admins create discovery profiles" ON public.agent_discovery_profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner'::app_role,'admin'::app_role]));
CREATE POLICY "Org owners and admins update discovery profiles" ON public.agent_discovery_profiles
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner'::app_role,'admin'::app_role]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner'::app_role,'admin'::app_role]));
CREATE POLICY "Org owners and admins delete discovery profiles" ON public.agent_discovery_profiles
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner'::app_role,'admin'::app_role]));

CREATE INDEX idx_discovery_visibility_status ON public.agent_discovery_profiles (visibility, status);
CREATE INDEX idx_discovery_categories ON public.agent_discovery_profiles USING GIN (categories);
CREATE INDEX idx_discovery_capabilities ON public.agent_discovery_profiles USING GIN (capabilities);
CREATE INDEX idx_discovery_org ON public.agent_discovery_profiles (organization_id);

CREATE TRIGGER agent_discovery_profiles_set_updated_at
  BEFORE UPDATE ON public.agent_discovery_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. AUDIT (reuses agent_activity_logs; no new audit system, no SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.log_intent_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _row jsonb;
  _org uuid;
  _event text;
BEGIN
  _row := to_jsonb(COALESCE(NEW, OLD));
  _org := public.digital_profile_org((_row->>'digital_profile_id')::uuid);
  IF _org IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    _event := 'intent.created';
  ELSIF TG_OP = 'UPDATE' THEN
    _event := CASE WHEN NEW.status = 'cancelled' AND OLD.status <> 'cancelled'
                   THEN 'intent.cancelled' ELSE 'intent.updated' END;
  ELSE
    _event := 'intent.deleted';
  END IF;

  INSERT INTO public.agent_activity_logs (agent_id, organization_id, actor_id, event, payload)
  VALUES (NULL, _org, auth.uid(), _event, jsonb_build_object(
    'intent_id', _row->>'id',
    'digital_profile_id', _row->>'digital_profile_id',
    'title', _row->>'title',
    'intent_type', _row->>'intent_type',
    'status', _row->>'status',
    'priority', _row->>'priority',
    'occurred_at', now()
  ));

  RETURN COALESCE(NEW, OLD);
END; $$;

REVOKE ALL ON FUNCTION public.log_intent_event() FROM PUBLIC, anon;

CREATE TRIGGER digital_intents_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.digital_intents
  FOR EACH ROW EXECUTE FUNCTION public.log_intent_event();

CREATE OR REPLACE FUNCTION public.log_discovery_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _row jsonb;
  _event text;
BEGIN
  _row := to_jsonb(COALESCE(NEW, OLD));

  IF TG_OP = 'INSERT' THEN
    _event := 'discovery.created';
  ELSIF TG_OP = 'UPDATE' THEN
    _event := CASE WHEN NEW.visibility IS DISTINCT FROM OLD.visibility
                   THEN 'discovery.visibility_changed' ELSE 'discovery.updated' END;
  ELSE
    _event := 'discovery.deleted';
  END IF;

  INSERT INTO public.agent_activity_logs (agent_id, organization_id, actor_id, event, payload)
  VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.agent_id END,
    COALESCE(NEW.organization_id, OLD.organization_id),
    auth.uid(),
    _event,
    jsonb_build_object(
      'discovery_profile_id', _row->>'id',
      'agent_id', _row->>'agent_id',
      'discovery_id', _row->>'discovery_id',
      'visibility', _row->>'visibility',
      'previous_visibility', CASE WHEN TG_OP = 'UPDATE' THEN OLD.visibility::text ELSE NULL END,
      'status', _row->>'status',
      'categories', _row->'categories',
      'occurred_at', now()
    )
  );

  RETURN COALESCE(NEW, OLD);
END; $$;

REVOKE ALL ON FUNCTION public.log_discovery_event() FROM PUBLIC, anon;

CREATE TRIGGER agent_discovery_profiles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.agent_discovery_profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_discovery_event();