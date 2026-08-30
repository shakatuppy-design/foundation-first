-- =====================================================================
-- SESSION 3D-1 — CAPABILITY VERIFICATION & CONTRACT FOUNDATION
-- New objects only. No protected Session 1-3C object is modified.
-- Verification != Authority. Contract != Authority. No execution.
-- =====================================================================

-- 1. ENUMS -------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                 WHERE n.nspname='public' AND t.typname='capability_verification_status') THEN
    CREATE TYPE public.capability_verification_status AS ENUM ('pending','verified','rejected','revoked','expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                 WHERE n.nspname='public' AND t.typname='capability_contract_status') THEN
    CREATE TYPE public.capability_contract_status AS ENUM ('draft','proposed','accepted','rejected','revoked','expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                 WHERE n.nspname='public' AND t.typname='verification_method') THEN
    -- platform_verified / external_verified are RESERVED for future sessions and
    -- are blocked at database level by a CHECK constraint in this migration.
    CREATE TYPE public.verification_method AS ENUM ('org_self_attested','platform_verified','external_verified');
  END IF;
END $$;

-- 2. TABLE: agent_capability_verifications -----------------------------
CREATE TABLE public.agent_capability_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id text NOT NULL UNIQUE DEFAULT ('cv_' || replace(gen_random_uuid()::text,'-','')),
  agent_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  capability_key text NOT NULL,
  verification_method public.verification_method NOT NULL DEFAULT 'org_self_attested',
  status public.capability_verification_status NOT NULL DEFAULT 'pending',
  attestation_note text NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NULL,
  verified_by uuid NULL,
  verified_at timestamptz NULL,
  rejected_at timestamptz NULL,
  revoked_at timestamptz NULL,
  expired_at timestamptz NULL,
  decision_note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT acv_agent_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE,
  CONSTRAINT acv_agent_org_fkey FOREIGN KEY (agent_id, organization_id)
    REFERENCES public.agents(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT acv_organization_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT acv_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT acv_verification_id_format CHECK (verification_id ~ '^cv_[0-9a-f]{32}$'),
  CONSTRAINT acv_capability_key_format CHECK (capability_key ~ '^[a-z0-9][a-z0-9._-]{0,59}$'),
  CONSTRAINT acv_method_allowed CHECK (verification_method = 'org_self_attested'::public.verification_method),
  CONSTRAINT acv_notes_len CHECK (
    char_length(COALESCE(attestation_note,'')) <= 1000
    AND char_length(COALESCE(decision_note,'')) <= 1000
  ),
  CONSTRAINT acv_evidence_object CHECK (jsonb_typeof(evidence) = 'object'),
  CONSTRAINT acv_evidence_size CHECK (octet_length(evidence::text) <= 2048),
  CONSTRAINT acv_evidence_keys CHECK (
    (evidence - ARRAY['method_description','internal_reference','reviewed_scope']) = '{}'::jsonb
  ),
  CONSTRAINT acv_expiry_order CHECK (expires_at IS NULL OR expires_at > created_at),
  CONSTRAINT acv_status_timestamps CHECK (
    (status = 'pending'  AND verified_at IS NULL AND verified_by IS NULL AND rejected_at IS NULL AND revoked_at IS NULL AND expired_at IS NULL)
    OR (status = 'verified' AND verified_at IS NOT NULL AND rejected_at IS NULL AND revoked_at IS NULL AND expired_at IS NULL)
    OR (status = 'rejected' AND rejected_at IS NOT NULL AND verified_at IS NULL AND revoked_at IS NULL AND expired_at IS NULL)
    OR (status = 'revoked'  AND verified_at IS NOT NULL AND revoked_at IS NOT NULL AND expired_at IS NULL)
    OR (status = 'expired'  AND verified_at IS NOT NULL AND expired_at IS NOT NULL AND revoked_at IS NULL)
  )
);

CREATE INDEX acv_agent_idx ON public.agent_capability_verifications (agent_id);
CREATE INDEX acv_org_idx ON public.agent_capability_verifications (organization_id);
CREATE INDEX acv_status_idx ON public.agent_capability_verifications (status);
CREATE INDEX acv_capability_idx ON public.agent_capability_verifications (capability_key);
-- Race protection: at most one simultaneously verified row per agent+capability.
CREATE UNIQUE INDEX acv_one_verified_per_capability
  ON public.agent_capability_verifications (agent_id, capability_key)
  WHERE status = 'verified';

GRANT SELECT, INSERT, UPDATE ON public.agent_capability_verifications TO authenticated;
GRANT ALL ON public.agent_capability_verifications TO service_role;

ALTER TABLE public.agent_capability_verifications ENABLE ROW LEVEL SECURITY;

-- 3. TABLE: agent_capability_contracts ---------------------------------
CREATE TABLE public.agent_capability_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id text NOT NULL UNIQUE DEFAULT ('cc_' || replace(gen_random_uuid()::text,'-','')),
  agent_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  capability_key text NOT NULL,
  requester_digital_profile_id uuid NOT NULL,
  verification_id uuid NOT NULL,
  capability_request_id uuid NULL,
  version integer NOT NULL DEFAULT 1,
  supersedes_contract_id uuid NULL,
  status public.capability_contract_status NOT NULL DEFAULT 'draft',
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  allowed_data text[] NOT NULL DEFAULT '{}'::text[],
  prohibited_data text[] NOT NULL DEFAULT '{}'::text[],
  requester_note text NULL,
  decision_note text NULL,
  effective_from timestamptz NULL,
  expires_at timestamptz NULL,
  proposed_at timestamptz NULL,
  accepted_at timestamptz NULL,
  rejected_at timestamptz NULL,
  revoked_at timestamptz NULL,
  expired_at timestamptz NULL,
  decided_by uuid NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT acc_agent_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE,
  CONSTRAINT acc_agent_org_fkey FOREIGN KEY (agent_id, organization_id)
    REFERENCES public.agents(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT acc_organization_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT acc_requester_profile_fkey FOREIGN KEY (requester_digital_profile_id)
    REFERENCES public.digital_profiles(id) ON DELETE CASCADE,
  CONSTRAINT acc_verification_fkey FOREIGN KEY (verification_id)
    REFERENCES public.agent_capability_verifications(id),
  CONSTRAINT acc_capability_request_fkey FOREIGN KEY (capability_request_id)
    REFERENCES public.agent_capability_requests(id),
  CONSTRAINT acc_supersedes_fkey FOREIGN KEY (supersedes_contract_id)
    REFERENCES public.agent_capability_contracts(id),
  CONSTRAINT acc_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT acc_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT acc_contract_id_format CHECK (contract_id ~ '^cc_[0-9a-f]{32}$'),
  CONSTRAINT acc_capability_key_format CHECK (capability_key ~ '^[a-z0-9][a-z0-9._-]{0,59}$'),
  CONSTRAINT acc_version_positive CHECK (version >= 1),
  CONSTRAINT acc_version_chain CHECK (
    (supersedes_contract_id IS NULL AND version = 1)
    OR (supersedes_contract_id IS NOT NULL AND version > 1)
  ),
  CONSTRAINT acc_no_self_supersede CHECK (supersedes_contract_id IS NULL OR supersedes_contract_id <> id),
  CONSTRAINT acc_notes_len CHECK (
    char_length(COALESCE(requester_note,'')) <= 1000
    AND char_length(COALESCE(decision_note,'')) <= 1000
  ),
  CONSTRAINT acc_terms_objects CHECK (
    jsonb_typeof(scope) = 'object' AND jsonb_typeof(constraints) = 'object' AND jsonb_typeof(limits) = 'object'
  ),
  CONSTRAINT acc_terms_size CHECK (
    octet_length(scope::text) <= 4096
    AND octet_length(constraints::text) <= 4096
    AND octet_length(limits::text) <= 2048
  ),
  CONSTRAINT acc_scope_keys CHECK (
    (scope - ARRAY['purpose','description','data_categories','region','retention']) = '{}'::jsonb
  ),
  CONSTRAINT acc_constraints_keys CHECK (
    (constraints - ARRAY['usage','prohibited_use','review_required','human_in_the_loop','notes']) = '{}'::jsonb
  ),
  CONSTRAINT acc_limits_keys CHECK (
    (limits - ARRAY['max_requests_per_day','max_records','max_duration_days','max_concurrent']) = '{}'::jsonb
  ),
  CONSTRAINT acc_data_arrays_len CHECK (
    COALESCE(array_length(allowed_data,1),0) <= 24
    AND COALESCE(array_length(prohibited_data,1),0) <= 24
  ),
  CONSTRAINT acc_expiry_order CHECK (
    expires_at IS NULL OR expires_at > COALESCE(effective_from, created_at)
  ),
  CONSTRAINT acc_status_timestamps CHECK (
    (status = 'draft'    AND proposed_at IS NULL AND accepted_at IS NULL AND rejected_at IS NULL AND revoked_at IS NULL AND expired_at IS NULL AND decided_by IS NULL)
    OR (status = 'proposed' AND proposed_at IS NOT NULL AND accepted_at IS NULL AND rejected_at IS NULL AND revoked_at IS NULL AND expired_at IS NULL AND decided_by IS NULL)
    OR (status = 'accepted' AND proposed_at IS NOT NULL AND accepted_at IS NOT NULL AND rejected_at IS NULL AND revoked_at IS NULL AND expired_at IS NULL)
    OR (status = 'rejected' AND proposed_at IS NOT NULL AND rejected_at IS NOT NULL AND accepted_at IS NULL AND revoked_at IS NULL AND expired_at IS NULL)
    OR (status = 'revoked'  AND accepted_at IS NOT NULL AND revoked_at IS NOT NULL AND expired_at IS NULL)
    OR (status = 'expired'  AND accepted_at IS NOT NULL AND expired_at IS NOT NULL AND revoked_at IS NULL)
  )
);

CREATE INDEX acc_agent_idx ON public.agent_capability_contracts (agent_id);
CREATE INDEX acc_org_idx ON public.agent_capability_contracts (organization_id);
CREATE INDEX acc_requester_idx ON public.agent_capability_contracts (requester_digital_profile_id);
CREATE INDEX acc_verification_idx ON public.agent_capability_contracts (verification_id);
CREATE INDEX acc_status_idx ON public.agent_capability_contracts (status);
CREATE UNIQUE INDEX acc_version_unique
  ON public.agent_capability_contracts (agent_id, capability_key, requester_digital_profile_id, version);
CREATE UNIQUE INDEX acc_supersedes_unique
  ON public.agent_capability_contracts (supersedes_contract_id)
  WHERE supersedes_contract_id IS NOT NULL;
-- Race protection: at most one accepted contract per agent+capability+requester.
CREATE UNIQUE INDEX acc_one_accepted
  ON public.agent_capability_contracts (agent_id, capability_key, requester_digital_profile_id)
  WHERE status = 'accepted';

GRANT SELECT, INSERT, UPDATE ON public.agent_capability_contracts TO authenticated;
GRANT ALL ON public.agent_capability_contracts TO service_role;

ALTER TABLE public.agent_capability_contracts ENABLE ROW LEVEL SECURITY;

-- 4. GUARD TRIGGER: verifications --------------------------------------
CREATE OR REPLACE FUNCTION public.capability_verifications_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _k text; _v jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Server-derived identity. A client-provided identifier is never trusted.
    NEW.verification_id := 'cv_' || replace(gen_random_uuid()::text,'-','');
    NEW.verification_method := 'org_self_attested';
    NEW.status := 'pending';
    NEW.verified_by := NULL; NEW.verified_at := NULL;
    NEW.rejected_at := NULL; NEW.revoked_at := NULL; NEW.expired_at := NULL;
    NEW.decision_note := NULL;
    NEW.created_at := now(); NEW.updated_at := now();

    IF NOT public.agent_is_eligible(NEW.agent_id) THEN
      RAISE EXCEPTION 'This agent is not eligible for capability verification';
    END IF;

    -- Advertised capability validation, canonical comparison, no data rewriting.
    IF NOT EXISTS (
      SELECT 1 FROM public.agent_discovery_profiles d, unnest(d.capabilities) AS c(elem)
      WHERE d.agent_id = NEW.agent_id
        AND d.organization_id = NEW.organization_id
        AND lower(btrim(c.elem)) = NEW.capability_key
    ) THEN
      RAISE EXCEPTION 'This capability is not advertised by the agent discovery profile';
    END IF;
  ELSE
    IF NEW.id <> OLD.id
       OR NEW.verification_id <> OLD.verification_id
       OR NEW.agent_id <> OLD.agent_id
       OR NEW.organization_id <> OLD.organization_id
       OR NEW.capability_key <> OLD.capability_key
       OR NEW.verification_method <> OLD.verification_method
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'Verification identity fields are immutable';
    END IF;

    IF OLD.status IN ('rejected','revoked','expired') AND NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'A % verification is terminal', OLD.status;
    END IF;

    IF NEW.status <> OLD.status THEN
      IF NOT ((OLD.status = 'pending'  AND NEW.status IN ('verified','rejected'))
           OR (OLD.status = 'verified' AND NEW.status IN ('revoked','expired'))) THEN
        RAISE EXCEPTION 'Transition % -> % is not allowed', OLD.status, NEW.status;
      END IF;
    END IF;

    -- Expiry becomes immutable once verified. Renewal requires a new row.
    IF OLD.status <> 'pending' AND NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
      RAISE EXCEPTION 'Verification expiry cannot be changed after verification';
    END IF;

    -- Decision metadata is database-derived only.
    IF NEW.status = OLD.status THEN
      NEW.verified_by := OLD.verified_by; NEW.verified_at := OLD.verified_at;
      NEW.rejected_at := OLD.rejected_at; NEW.revoked_at := OLD.revoked_at;
      NEW.expired_at := OLD.expired_at;
    ELSIF NEW.status = 'verified' THEN
      NEW.verified_by := auth.uid(); NEW.verified_at := now();
      NEW.rejected_at := NULL; NEW.revoked_at := NULL; NEW.expired_at := NULL;
    ELSIF NEW.status = 'rejected' THEN
      NEW.verified_by := NULL; NEW.verified_at := NULL;
      NEW.rejected_at := now(); NEW.revoked_at := NULL; NEW.expired_at := NULL;
    ELSIF NEW.status = 'revoked' THEN
      NEW.verified_by := OLD.verified_by; NEW.verified_at := OLD.verified_at;
      NEW.revoked_at := now(); NEW.rejected_at := NULL; NEW.expired_at := NULL;
    ELSE -- expired
      NEW.verified_by := OLD.verified_by; NEW.verified_at := OLD.verified_at;
      NEW.expired_at := now(); NEW.revoked_at := NULL; NEW.rejected_at := NULL;
    END IF;
  END IF;

  -- Evidence is bounded descriptive metadata, never proof: flat string map only.
  FOR _k, _v IN SELECT key, value FROM jsonb_each(NEW.evidence) LOOP
    IF jsonb_typeof(_v) <> 'string' THEN
      RAISE EXCEPTION 'Evidence values must be plain strings (key %)', _k;
    END IF;
    IF char_length(_v #>> '{}') > 500 THEN
      RAISE EXCEPTION 'Evidence value for % is too long', _k;
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.capability_verifications_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER capability_verifications_guard
  BEFORE INSERT OR UPDATE ON public.agent_capability_verifications
  FOR EACH ROW EXECUTE FUNCTION public.capability_verifications_guard();

CREATE TRIGGER capability_verifications_set_updated_at
  BEFORE UPDATE ON public.agent_capability_verifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. GUARD TRIGGER: contracts ------------------------------------------
CREATE OR REPLACE FUNCTION public.capability_contracts_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _k text; _v jsonb; _e text; _ver record; _parent record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.contract_id := 'cc_' || replace(gen_random_uuid()::text,'-','');
    NEW.status := 'draft';
    NEW.created_by := auth.uid();
    NEW.decided_by := NULL;
    NEW.proposed_at := NULL; NEW.accepted_at := NULL; NEW.rejected_at := NULL;
    NEW.revoked_at := NULL; NEW.expired_at := NULL; NEW.decision_note := NULL;
    NEW.created_at := now(); NEW.updated_at := now();

    IF NEW.created_by IS NULL THEN
      RAISE EXCEPTION 'A contract must be created by an authenticated user';
    END IF;

    -- Verification validity is validated inside the write path, under a row lock.
    SELECT * INTO _ver FROM public.agent_capability_verifications
      WHERE id = NEW.verification_id FOR SHARE;
    IF _ver IS NULL
       OR _ver.status <> 'verified'
       OR (_ver.expires_at IS NOT NULL AND _ver.expires_at <= now())
       OR _ver.agent_id <> NEW.agent_id
       OR _ver.organization_id <> NEW.organization_id
       OR _ver.capability_key <> NEW.capability_key THEN
      RAISE EXCEPTION 'A currently valid verification is required for this agent and capability';
    END IF;

    IF NOT public.agent_is_eligible(NEW.agent_id) THEN
      RAISE EXCEPTION 'This agent is not eligible for a capability contract';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.agent_discovery_profiles d, unnest(d.capabilities) AS c(elem)
      WHERE d.agent_id = NEW.agent_id
        AND d.organization_id = NEW.organization_id
        AND d.status = 'listed'
        AND d.visibility = 'public'
        AND lower(btrim(c.elem)) = NEW.capability_key
    ) THEN
      RAISE EXCEPTION 'This capability is no longer publicly advertised by the agent';
    END IF;

    IF NEW.capability_request_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.agent_capability_requests r
        WHERE r.id = NEW.capability_request_id
          AND r.status = 'approved'
          AND r.target_agent_id = NEW.agent_id
          AND r.target_organization_id = NEW.organization_id
          AND lower(btrim(r.requested_capability)) = NEW.capability_key
      ) THEN
        RAISE EXCEPTION 'The linked capability request does not match this contract';
      END IF;
    END IF;

    IF NEW.supersedes_contract_id IS NOT NULL THEN
      SELECT * INTO _parent FROM public.agent_capability_contracts
        WHERE id = NEW.supersedes_contract_id FOR UPDATE;
      IF _parent IS NULL
         OR _parent.agent_id <> NEW.agent_id
         OR _parent.organization_id <> NEW.organization_id
         OR _parent.capability_key <> NEW.capability_key
         OR _parent.requester_digital_profile_id <> NEW.requester_digital_profile_id THEN
        RAISE EXCEPTION 'A new contract version must keep the same parties and capability';
      END IF;
      IF NEW.version <> _parent.version + 1 THEN
        RAISE EXCEPTION 'A new contract version must increment the previous version';
      END IF;
    ELSIF NEW.version <> 1 THEN
      RAISE EXCEPTION 'A first contract version must be version 1';
    END IF;
  ELSE
    IF NEW.id <> OLD.id
       OR NEW.contract_id <> OLD.contract_id
       OR NEW.agent_id <> OLD.agent_id
       OR NEW.organization_id <> OLD.organization_id
       OR NEW.capability_key <> OLD.capability_key
       OR NEW.requester_digital_profile_id <> OLD.requester_digital_profile_id
       OR NEW.verification_id <> OLD.verification_id
       OR NEW.capability_request_id IS DISTINCT FROM OLD.capability_request_id
       OR NEW.version <> OLD.version
       OR NEW.supersedes_contract_id IS DISTINCT FROM OLD.supersedes_contract_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'Contract identity fields are immutable';
    END IF;

    IF OLD.status IN ('rejected','revoked','expired') AND NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'A % contract is terminal', OLD.status;
    END IF;

    IF NEW.status <> OLD.status THEN
      IF NOT ((OLD.status = 'draft'    AND NEW.status = 'proposed')
           OR (OLD.status = 'proposed' AND NEW.status IN ('accepted','rejected'))
           OR (OLD.status = 'accepted' AND NEW.status IN ('revoked','expired'))) THEN
        RAISE EXCEPTION 'Transition % -> % is not allowed', OLD.status, NEW.status;
      END IF;
    END IF;

    -- Material terms freeze at draft -> proposed and can never change afterwards.
    IF OLD.status <> 'draft' THEN
      IF NEW.scope <> OLD.scope
         OR NEW.constraints <> OLD.constraints
         OR NEW.limits <> OLD.limits
         OR NEW.allowed_data <> OLD.allowed_data
         OR NEW.prohibited_data <> OLD.prohibited_data
         OR NEW.requester_note IS DISTINCT FROM OLD.requester_note
         OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
         OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
        RAISE EXCEPTION 'Contract terms are frozen once the contract is proposed';
      END IF;
    END IF;

    IF NEW.status = OLD.status THEN
      NEW.proposed_at := OLD.proposed_at; NEW.accepted_at := OLD.accepted_at;
      NEW.rejected_at := OLD.rejected_at; NEW.revoked_at := OLD.revoked_at;
      NEW.expired_at := OLD.expired_at; NEW.decided_by := OLD.decided_by;
      NEW.decision_note := OLD.decision_note;
    ELSIF NEW.status = 'proposed' THEN
      NEW.proposed_at := now(); NEW.decided_by := NULL; NEW.decision_note := NULL;
    ELSIF NEW.status = 'accepted' THEN
      NEW.accepted_at := now(); NEW.decided_by := auth.uid();
    ELSIF NEW.status = 'rejected' THEN
      NEW.rejected_at := now(); NEW.decided_by := auth.uid();
    ELSIF NEW.status = 'revoked' THEN
      NEW.revoked_at := now(); NEW.decided_by := auth.uid();
    ELSE -- expired
      NEW.expired_at := now(); NEW.decided_by := auth.uid();
    END IF;
  END IF;

  -- Declarative terms only: flat, bounded, non-executable.
  FOR _k, _v IN SELECT key, value FROM jsonb_each(NEW.scope) LOOP
    IF jsonb_typeof(_v) NOT IN ('string','boolean') THEN
      RAISE EXCEPTION 'Scope values must be strings or booleans (key %)', _k;
    END IF;
    IF jsonb_typeof(_v) = 'string' AND char_length(_v #>> '{}') > 500 THEN
      RAISE EXCEPTION 'Scope value for % is too long', _k;
    END IF;
  END LOOP;

  FOR _k, _v IN SELECT key, value FROM jsonb_each(NEW.constraints) LOOP
    IF jsonb_typeof(_v) NOT IN ('string','boolean') THEN
      RAISE EXCEPTION 'Constraint values must be strings or booleans (key %)', _k;
    END IF;
    IF jsonb_typeof(_v) = 'string' AND char_length(_v #>> '{}') > 500 THEN
      RAISE EXCEPTION 'Constraint value for % is too long', _k;
    END IF;
  END LOOP;

  FOR _k, _v IN SELECT key, value FROM jsonb_each(NEW.limits) LOOP
    IF jsonb_typeof(_v) <> 'number' OR (_v #>> '{}') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Limit values must be non-negative integers (key %)', _k;
    END IF;
  END LOOP;

  FOREACH _e IN ARRAY (NEW.allowed_data || NEW.prohibited_data) LOOP
    IF _e !~ '^[a-z0-9][a-z0-9._-]{0,59}$' THEN
      RAISE EXCEPTION 'Data identifier % is not canonical', _e;
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.capability_contracts_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER capability_contracts_guard
  BEFORE INSERT OR UPDATE ON public.agent_capability_contracts
  FOR EACH ROW EXECUTE FUNCTION public.capability_contracts_guard();

CREATE TRIGGER capability_contracts_set_updated_at
  BEFORE UPDATE ON public.agent_capability_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. AUDIT (reuses agent_activity_logs, schema unchanged) --------------
CREATE OR REPLACE FUNCTION public.log_capability_verification_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event := 'capability_verification.created';
  ELSIF NEW.status <> OLD.status THEN
    _event := 'capability_verification.' || CASE NEW.status::text
      WHEN 'verified' THEN 'approved' ELSE NEW.status::text END;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.agent_activity_logs (agent_id, organization_id, actor_id, event, payload)
  VALUES (NEW.agent_id, NEW.organization_id, auth.uid(), _event, jsonb_build_object(
    'verification_id', NEW.verification_id,
    'agent_id', NEW.agent_id,
    'organization_id', NEW.organization_id,
    'capability_key', NEW.capability_key,
    'status', NEW.status,
    'verification_method', NEW.verification_method,
    'created_at', NEW.created_at,
    'verified_at', NEW.verified_at,
    'rejected_at', NEW.rejected_at,
    'revoked_at', NEW.revoked_at,
    'expired_at', NEW.expired_at,
    'expires_at', NEW.expires_at,
    'occurred_at', now()
  ));
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.log_capability_verification_event() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER capability_verifications_audit
  AFTER INSERT OR UPDATE ON public.agent_capability_verifications
  FOR EACH ROW EXECUTE FUNCTION public.log_capability_verification_event();

CREATE OR REPLACE FUNCTION public.log_capability_contract_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _event text; _term_keys text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event := CASE WHEN NEW.supersedes_contract_id IS NOT NULL
                   THEN 'capability_contract.version_created'
                   ELSE 'capability_contract.created' END;
  ELSIF NEW.status <> OLD.status THEN
    _event := 'capability_contract.' || NEW.status::text;
  ELSE
    RETURN NEW;
  END IF;

  -- Key names only. Term VALUES are never logged.
  SELECT array_agg(k) INTO _term_keys FROM (
    SELECT jsonb_object_keys(NEW.scope) AS k
    UNION SELECT jsonb_object_keys(NEW.constraints)
    UNION SELECT jsonb_object_keys(NEW.limits)
  ) s;

  INSERT INTO public.agent_activity_logs (agent_id, organization_id, actor_id, event, payload)
  VALUES (NEW.agent_id, NEW.organization_id, auth.uid(), _event, jsonb_build_object(
    'contract_id', NEW.contract_id,
    'agent_id', NEW.agent_id,
    'organization_id', NEW.organization_id,
    'capability_key', NEW.capability_key,
    'status', NEW.status,
    'version', NEW.version,
    'term_keys', COALESCE(to_jsonb(_term_keys), '[]'::jsonb),
    'created_at', NEW.created_at,
    'proposed_at', NEW.proposed_at,
    'accepted_at', NEW.accepted_at,
    'rejected_at', NEW.rejected_at,
    'revoked_at', NEW.revoked_at,
    'expired_at', NEW.expired_at,
    'effective_from', NEW.effective_from,
    'expires_at', NEW.expires_at,
    'occurred_at', now()
  ));
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.log_capability_contract_event() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER capability_contracts_audit
  AFTER INSERT OR UPDATE ON public.agent_capability_contracts
  FOR EACH ROW EXECUTE FUNCTION public.log_capability_contract_event();

-- 7. RLS: verifications (authenticated only, no DELETE policy) ---------
CREATE POLICY acv_select ON public.agent_capability_verifications
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    OR (
      public.agent_is_eligible(agent_id)
      AND EXISTS (
        SELECT 1 FROM public.agent_discovery_profiles d
        WHERE d.agent_id = agent_capability_verifications.agent_id
          AND d.organization_id = agent_capability_verifications.organization_id
          AND d.status = 'listed'
          AND d.visibility = 'public'
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.agent_capability_contracts c
      WHERE c.verification_id = agent_capability_verifications.id
        AND public.controls_digital_profile(c.requester_digital_profile_id)
    )
  );

CREATE POLICY acv_insert ON public.agent_capability_verifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(organization_id, ARRAY['owner'::app_role,'admin'::app_role])
    AND public.agent_is_eligible(agent_id)
    AND status = 'pending'
    AND verification_method = 'org_self_attested'
    AND verified_by IS NULL AND verified_at IS NULL AND decision_note IS NULL
    AND EXISTS (
      SELECT 1 FROM public.agent_discovery_profiles d, unnest(d.capabilities) AS c(elem)
      WHERE d.agent_id = agent_capability_verifications.agent_id
        AND d.organization_id = agent_capability_verifications.organization_id
        AND lower(btrim(c.elem)) = agent_capability_verifications.capability_key
    )
  );

CREATE POLICY acv_org_update ON public.agent_capability_verifications
  FOR UPDATE TO authenticated
  USING (
    public.has_org_role(organization_id, ARRAY['owner'::app_role,'admin'::app_role])
    AND status IN ('pending','verified')
  )
  WITH CHECK (
    public.has_org_role(organization_id, ARRAY['owner'::app_role,'admin'::app_role])
    AND status IN ('pending','verified','rejected','revoked','expired')
    AND verification_method = 'org_self_attested'
  );

-- 8. RLS: contracts (authenticated only, no DELETE policy) -------------
CREATE POLICY acc_select ON public.agent_capability_contracts
  FOR SELECT TO authenticated
  USING (
    public.controls_digital_profile(requester_digital_profile_id)
    OR public.is_org_member(organization_id)
  );

CREATE POLICY acc_requester_insert ON public.agent_capability_contracts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.controls_digital_profile(requester_digital_profile_id)
    AND status = 'draft'
    AND decided_by IS NULL AND decision_note IS NULL
  );

CREATE POLICY acc_requester_update ON public.agent_capability_contracts
  FOR UPDATE TO authenticated
  USING (
    public.controls_digital_profile(requester_digital_profile_id)
    AND status = 'draft'
  )
  WITH CHECK (
    public.controls_digital_profile(requester_digital_profile_id)
    AND status IN ('draft','proposed')
  );

CREATE POLICY acc_org_decide ON public.agent_capability_contracts
  FOR UPDATE TO authenticated
  USING (
    public.has_org_role(organization_id, ARRAY['owner'::app_role,'admin'::app_role])
    AND status IN ('proposed','accepted')
    AND NOT public.controls_digital_profile(requester_digital_profile_id)
  )
  WITH CHECK (
    public.has_org_role(organization_id, ARRAY['owner'::app_role,'admin'::app_role])
    AND status IN ('accepted','rejected','revoked','expired')
    AND NOT public.controls_digital_profile(requester_digital_profile_id)
  );
