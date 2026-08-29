CREATE OR REPLACE FUNCTION public.log_agent_registry_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event := 'agent.created';
  ELSIF TG_OP = 'UPDATE' THEN
    _event := CASE
      WHEN NEW.status <> OLD.status AND NEW.status = 'suspended' THEN 'agent.suspended'
      WHEN NEW.status <> OLD.status AND NEW.status = 'revoked' THEN 'agent.revoked'
      WHEN NEW.status <> OLD.status AND NEW.status = 'archived' THEN 'agent.archived'
      ELSE 'agent.updated'
    END;
  ELSE
    _event := 'agent.deleted';
  END IF;

  INSERT INTO public.agent_activity_logs (agent_id, organization_id, actor_id, event, payload)
  VALUES (
    -- On DELETE the agent row no longer exists, so the composite reference must be NULL.
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.id END,
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
END;
$function$;

REVOKE ALL ON FUNCTION public.log_agent_registry_event() FROM PUBLIC, anon, authenticated;