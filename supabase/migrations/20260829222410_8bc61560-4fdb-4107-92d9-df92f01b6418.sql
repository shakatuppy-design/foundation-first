-- 1. Identity columns (non-destructive)
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.agents
  ADD CONSTRAINT agents_description_check CHECK (char_length(description) <= 2000);

-- 2. Kind taxonomy migration (preserve rows)
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_kind_check;
UPDATE public.agents SET kind = CASE
  WHEN kind = 'assistant' THEN 'personal'
  WHEN kind IN ('generic', 'workflow', 'integration') THEN 'service'
  ELSE kind END
WHERE kind NOT IN ('personal', 'organization', 'service', 'specialized');
ALTER TABLE public.agents
  ADD CONSTRAINT agents_kind_check CHECK (kind = ANY (ARRAY['personal','organization','service','specialized']));
ALTER TABLE public.agents ALTER COLUMN kind SET DEFAULT 'service';

-- 3. Lifecycle states (legacy 'inactive' retained so no row is invalidated)
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_status_check;
ALTER TABLE public.agents
  ADD CONSTRAINT agents_status_check CHECK (status = ANY (ARRAY['active','inactive','suspended','revoked','archived']));

CREATE INDEX IF NOT EXISTS agents_org_status_idx ON public.agents (organization_id, status);
CREATE INDEX IF NOT EXISTS agents_created_by_idx ON public.agents (created_by);

-- 4. Immutable tenant + creator, and revoked is terminal
CREATE OR REPLACE FUNCTION public.agents_guard_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'An agent cannot be moved to another organization';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'An agent creator cannot be changed';
  END IF;
  IF OLD.status = 'revoked' AND NEW.status NOT IN ('revoked', 'archived') THEN
    RAISE EXCEPTION 'A revoked agent cannot be reactivated';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS agents_guard_immutable ON public.agents;
CREATE TRIGGER agents_guard_immutable BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.agents_guard_immutable();

-- 5. Creator defaults to the authenticated caller and cannot be forged
CREATE OR REPLACE FUNCTION public.agents_set_creator()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.created_by := auth.uid();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS agents_set_creator ON public.agents;
CREATE TRIGGER agents_set_creator BEFORE INSERT ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.agents_set_creator();

-- 6. Audit into the existing activity log
CREATE OR REPLACE FUNCTION public.log_agent_registry_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event := 'agent.created';
  ELSIF TG_OP = 'DELETE' THEN
    _event := 'agent.deleted';
  ELSIF NEW.status <> OLD.status THEN
    _event := CASE NEW.status
      WHEN 'suspended' THEN 'agent.suspended'
      WHEN 'revoked' THEN 'agent.revoked'
      WHEN 'archived' THEN 'agent.archived'
      ELSE 'agent.updated' END;
  ELSE
    _event := 'agent.updated';
  END IF;

  INSERT INTO public.agent_activity_logs (agent_id, organization_id, actor_id, event, payload)
  VALUES (
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.organization_id, OLD.organization_id),
    auth.uid(),
    _event,
    jsonb_build_object(
      'agent_id', COALESCE(NEW.id, OLD.id),
      'name', COALESCE(NEW.name, OLD.name),
      'kind', COALESCE(NEW.kind, OLD.kind),
      'status', COALESCE(NEW.status, OLD.status),
      'previous_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      'created_by', COALESCE(NEW.created_by, OLD.created_by),
      'occurred_at', now()
    )
  );
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS agents_registry_audit ON public.agents;
CREATE TRIGGER agents_registry_audit AFTER INSERT OR UPDATE OR DELETE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.log_agent_registry_event();

-- 7. Eligibility: registry membership alone is never authority
CREATE OR REPLACE FUNCTION public.agent_is_eligible(_agent uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.agents a WHERE a.id = _agent AND a.status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.agent_has_authority(_agent uuid, _profile uuid, _capability digital_capability)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.agent_is_eligible(_agent) AND EXISTS (
    SELECT 1 FROM public.digital_authority_rules r
    WHERE r.agent_id = _agent
      AND r.digital_profile_id = _profile
      AND r.capability = _capability
      AND r.allowed = true
      AND r.status = 'active'
      AND (r.expires_at IS NULL OR r.expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.agent_is_eligible(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agent_has_authority(uuid, uuid, digital_capability) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_is_eligible(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agent_has_authority(uuid, uuid, digital_capability) TO authenticated, service_role;
