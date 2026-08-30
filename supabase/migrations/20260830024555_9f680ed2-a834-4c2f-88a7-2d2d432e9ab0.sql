-- SESSION 3C PHASE 1 — controlled capability requests.
-- A capability request is ONLY a request. Approval grants NO authority and
-- executes NOTHING. Authority lives exclusively in digital_authority_rules.
-- Advertised capability != verified capability != authority.

CREATE TYPE public.capability_request_type AS ENUM ('capability_request');
CREATE TYPE public.capability_request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE public.capability_request_priority AS ENUM ('normal', 'high', 'urgent');

CREATE TABLE public.agent_capability_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id TEXT NOT NULL DEFAULT ('cr_' || replace(gen_random_uuid()::text, '-', '')),
  requester_digital_profile_id UUID NOT NULL REFERENCES public.digital_profiles(id) ON DELETE CASCADE,
  target_agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  target_organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_capability TEXT NOT NULL,
  request_type public.capability_request_type NOT NULL DEFAULT 'capability_request',
  status public.capability_request_status NOT NULL DEFAULT 'pending',
  priority public.capability_request_priority NOT NULL DEFAULT 'normal',
  request_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  requester_note TEXT,
  reviewer_note TEXT,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_capability_requests_request_id_key UNIQUE (request_id),
  -- tenant consistency: the target agent must really belong to the target org
  CONSTRAINT agent_capability_requests_agent_org_fkey
    FOREIGN KEY (target_agent_id, target_organization_id)
    REFERENCES public.agents(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT agent_capability_requests_capability_len
    CHECK (char_length(btrim(requested_capability)) BETWEEN 1 AND 80),
  CONSTRAINT agent_capability_requests_context_object
    CHECK (jsonb_typeof(request_context) = 'object'),
  CONSTRAINT agent_capability_requests_notes_len
    CHECK (char_length(coalesce(requester_note, '')) <= 2000
           AND char_length(coalesce(reviewer_note, '')) <= 2000),
  CONSTRAINT agent_capability_requests_decision_consistency
    CHECK (
      (status = 'pending'   AND decided_at IS NULL AND decided_by IS NULL AND cancelled_at IS NULL)
      OR (status IN ('approved', 'rejected') AND decided_at IS NOT NULL AND cancelled_at IS NULL)
      OR (status = 'cancelled' AND cancelled_at IS NOT NULL)
    )
);

COMMENT ON TABLE public.agent_capability_requests IS
  'Controlled capability requests. A request is only a request: approval records reviewer consent and grants NO authority, no permission, and no execution. Authority remains exclusively in digital_authority_rules.';
COMMENT ON COLUMN public.agent_capability_requests.requested_capability IS
  'Free-text capability advertised by the target agent discovery card. Advertised != verified != authorized.';
COMMENT ON COLUMN public.agent_capability_requests.request_context IS
  'Descriptive, non-sensitive context only. NEVER a secrets store: no passwords, tokens, API keys or credentials. Never exposed through discovery search.';

GRANT SELECT, INSERT, UPDATE ON public.agent_capability_requests TO authenticated;
GRANT ALL ON public.agent_capability_requests TO service_role;
REVOKE ALL ON public.agent_capability_requests FROM anon;

ALTER TABLE public.agent_capability_requests ENABLE ROW LEVEL SECURITY;

-- Requester side: the controller of the requesting Digital Self.
-- Reviewer side: owner/admin of the target agent's organization (existing agent authority).
CREATE POLICY "capability_requests_select"
  ON public.agent_capability_requests FOR SELECT TO authenticated
  USING (
    public.controls_digital_profile(requester_digital_profile_id)
    OR public.has_org_role(target_organization_id, ARRAY['owner'::app_role, 'admin'::app_role])
  );

-- Creation: requester identity derived from ownership, target must be an eligible
-- (active) agent, and the capability must already be advertised on a discovery card
-- the requester can actually see (the subquery is itself subject to discovery RLS,
-- so the discovery boundary cannot be bypassed).
CREATE POLICY "capability_requests_insert"
  ON public.agent_capability_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.controls_digital_profile(requester_digital_profile_id)
    AND public.agent_is_eligible(target_agent_id)
    AND status = 'pending'
    AND decided_by IS NULL AND decided_at IS NULL AND cancelled_at IS NULL
    AND reviewer_note IS NULL
    AND EXISTS (
      SELECT 1 FROM public.agent_discovery_profiles d
      WHERE d.agent_id = target_agent_id
        AND d.organization_id = target_organization_id
        AND btrim(lower(requested_capability)) = ANY (d.capabilities)
    )
  );

-- Requester may only cancel their own pending request.
CREATE POLICY "capability_requests_requester_cancel"
  ON public.agent_capability_requests FOR UPDATE TO authenticated
  USING (public.controls_digital_profile(requester_digital_profile_id) AND status = 'pending')
  WITH CHECK (public.controls_digital_profile(requester_digital_profile_id) AND status = 'cancelled');

-- Reviewer may approve/reject a pending request, but never one they requested themselves.
CREATE POLICY "capability_requests_reviewer_decide"
  ON public.agent_capability_requests FOR UPDATE TO authenticated
  USING (
    public.has_org_role(target_organization_id, ARRAY['owner'::app_role, 'admin'::app_role])
    AND status = 'pending'
    AND NOT public.controls_digital_profile(requester_digital_profile_id)
  )
  WITH CHECK (
    public.has_org_role(target_organization_id, ARRAY['owner'::app_role, 'admin'::app_role])
    AND status IN ('approved', 'rejected')
    AND NOT public.controls_digital_profile(requester_digital_profile_id)
  );

-- No DELETE policy: capability requests are retained business/audit records.

-- Immutability + lifecycle guard.
CREATE OR REPLACE FUNCTION public.capability_requests_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.request_id <> OLD.request_id
     OR NEW.requester_digital_profile_id <> OLD.requester_digital_profile_id
     OR NEW.target_agent_id <> OLD.target_agent_id
     OR NEW.target_organization_id <> OLD.target_organization_id
     OR NEW.requested_capability <> OLD.requested_capability
     OR NEW.request_type <> OLD.request_type
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Capability request identity, target, capability, type and creation time are immutable';
  END IF;

  IF NEW.status <> OLD.status THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'A % capability request is terminal and cannot change status', OLD.status;
    END IF;
    IF NEW.status = 'pending' THEN
      RAISE EXCEPTION 'A capability request cannot return to pending';
    END IF;
  END IF;

  -- Decision metadata is set by the database, never by the client.
  IF NEW.status = OLD.status THEN
    NEW.decided_by := OLD.decided_by;
    NEW.decided_at := OLD.decided_at;
    NEW.cancelled_at := OLD.cancelled_at;
  ELSIF NEW.status IN ('approved', 'rejected') THEN
    NEW.decided_by := auth.uid();
    NEW.decided_at := now();
    NEW.cancelled_at := NULL;
  ELSE -- cancelled
    NEW.decided_by := OLD.decided_by;
    NEW.decided_at := OLD.decided_at;
    NEW.cancelled_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER capability_requests_guard
  BEFORE UPDATE ON public.agent_capability_requests
  FOR EACH ROW EXECUTE FUNCTION public.capability_requests_guard();

CREATE TRIGGER capability_requests_set_updated_at
  BEFORE UPDATE ON public.agent_capability_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Audit into the existing sink. SECURITY DEFINER is required because a requester
-- from another tenant is not a member of the target organization and therefore
-- cannot satisfy the agent_activity_logs insert policy. Payload is minimal:
-- never request_context, requester_note or reviewer_note.
CREATE OR REPLACE FUNCTION public.log_capability_request_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event := 'capability_request.created';
  ELSIF NEW.status <> OLD.status THEN
    _event := 'capability_request.' || NEW.status::text;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.agent_activity_logs (agent_id, organization_id, actor_id, event, payload)
  VALUES (
    NEW.target_agent_id,
    NEW.target_organization_id,
    auth.uid(),
    _event,
    jsonb_build_object(
      'request_id', NEW.request_id,
      'requester_digital_profile_id', NEW.requester_digital_profile_id,
      'target_agent_id', NEW.target_agent_id,
      'requested_capability', NEW.requested_capability,
      'request_type', NEW.request_type,
      'status', NEW.status,
      'priority', NEW.priority,
      'occurred_at', now()
    )
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_capability_request_event() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.capability_requests_guard() FROM PUBLIC, anon;

CREATE TRIGGER capability_requests_audit
  AFTER INSERT OR UPDATE ON public.agent_capability_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_capability_request_event();

CREATE INDEX idx_capability_requests_requester
  ON public.agent_capability_requests (requester_digital_profile_id, status);
CREATE INDEX idx_capability_requests_target_agent
  ON public.agent_capability_requests (target_agent_id, status);
CREATE INDEX idx_capability_requests_target_org_created
  ON public.agent_capability_requests (target_organization_id, created_at DESC);
