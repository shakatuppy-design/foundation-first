-- SESSION 3G-F — CONTROLLED LEARNING / LESSON BOUNDARY
-- Data-only human review capture. No authority, capability, policy or prompt
-- mutation anywhere in this migration.

CREATE TYPE public.lesson_human_verdict AS ENUM (
  'CORRECT', 'INCORRECT', 'PARTIALLY_CORRECT', 'NEEDS_MORE_DATA', 'UNKNOWN'
);

CREATE TYPE public.lesson_state AS ENUM (
  'CANDIDATE', 'REVIEWED', 'APPROVED', 'REJECTED'
);

CREATE TABLE public.pilot_lesson_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pilot_key text NOT NULL DEFAULT 'management-intelligence-pilot',
  -- Immutable snapshot reference to the reasoning output being reviewed.
  agent_output_reference jsonb NOT NULL,
  human_verdict public.lesson_human_verdict NOT NULL,
  correction text NOT NULL DEFAULT '',
  supporting_evidence text[] NOT NULL DEFAULT '{}',
  lesson_candidate text NOT NULL DEFAULT '',
  state public.lesson_state NOT NULL DEFAULT 'CANDIDATE',
  reviewer uuid NOT NULL REFERENCES auth.users(id),
  decided_by uuid REFERENCES auth.users(id),
  decision_note text NOT NULL DEFAULT '',
  reviewed_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pilot_lesson_reviews_pilot_key_chk
    CHECK (pilot_key = 'management-intelligence-pilot'),
  CONSTRAINT pilot_lesson_reviews_output_ref_chk CHECK (
    jsonb_typeof(agent_output_reference) = 'object'
    AND agent_output_reference ? 'model'
    AND agent_output_reference ? 'timestamp'
    AND agent_output_reference ? 'reasoning_status'
    AND length(coalesce(agent_output_reference->>'model', '')) > 0
    AND length(coalesce(agent_output_reference->>'timestamp', '')) > 0
    AND (agent_output_reference->>'reasoning_status')
        IN ('COMPLETE', 'NEEDS_DATA', 'UNCERTAIN', 'BLOCKED')
  ),
  CONSTRAINT pilot_lesson_reviews_correction_chk CHECK (
    human_verdict <> 'INCORRECT' OR length(btrim(correction)) > 0
  )
);

CREATE INDEX pilot_lesson_reviews_org_created_idx
  ON public.pilot_lesson_reviews (organization_id, created_at DESC);
CREATE INDEX pilot_lesson_reviews_org_state_idx
  ON public.pilot_lesson_reviews (organization_id, state);
CREATE INDEX pilot_lesson_reviews_reviewer_idx
  ON public.pilot_lesson_reviews (reviewer);

CREATE TABLE public.pilot_lesson_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_review_id uuid NOT NULL REFERENCES public.pilot_lesson_reviews(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event text NOT NULL,
  previous_state public.lesson_state,
  new_state public.lesson_state NOT NULL,
  actor_id uuid,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  seq bigserial NOT NULL
);

CREATE INDEX pilot_lesson_review_events_review_idx
  ON public.pilot_lesson_review_events (lesson_review_id, seq);
CREATE INDEX pilot_lesson_review_events_org_idx
  ON public.pilot_lesson_review_events (organization_id, seq DESC);

GRANT SELECT, INSERT, UPDATE ON public.pilot_lesson_reviews TO authenticated;
GRANT ALL ON public.pilot_lesson_reviews TO service_role;
GRANT SELECT ON public.pilot_lesson_review_events TO authenticated;
GRANT ALL ON public.pilot_lesson_review_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.pilot_lesson_review_events_seq_seq TO service_role;
REVOKE ALL ON public.pilot_lesson_reviews FROM PUBLIC, anon;
REVOKE ALL ON public.pilot_lesson_review_events FROM PUBLIC, anon;

ALTER TABLE public.pilot_lesson_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_lesson_review_events ENABLE ROW LEVEL SECURITY;

-- Confidentiality + control: owner/admin of the SAME organization only.
CREATE POLICY "org owners and admins read lesson reviews"
  ON public.pilot_lesson_reviews FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner'::app_role, 'admin'::app_role]));

CREATE POLICY "org owners and admins create lesson reviews as themselves"
  ON public.pilot_lesson_reviews FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(organization_id, ARRAY['owner'::app_role, 'admin'::app_role])
    AND reviewer = auth.uid()
  );

CREATE POLICY "org owners and admins progress lesson reviews"
  ON public.pilot_lesson_reviews FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner'::app_role, 'admin'::app_role]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner'::app_role, 'admin'::app_role]));

CREATE POLICY "org owners and admins read lesson review history"
  ON public.pilot_lesson_review_events FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner'::app_role, 'admin'::app_role]));

-- Immutability + explicit, human, one-step-at-a-time lifecycle.
CREATE OR REPLACE FUNCTION public.pilot_lesson_reviews_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- No auto-promotion: a lesson always starts as a CANDIDATE.
    IF NEW.state <> 'CANDIDATE' THEN
      RAISE EXCEPTION 'A lesson review must be created in state CANDIDATE (no automatic promotion)';
    END IF;
    NEW.decided_by := NULL;
    NEW.decided_at := NULL;
    NEW.reviewed_at := NULL;
    RETURN NEW;
  END IF;

  -- Identity is immutable.
  IF NEW.id <> OLD.id
     OR NEW.organization_id <> OLD.organization_id
     OR NEW.pilot_key <> OLD.pilot_key
     OR NEW.reviewer <> OLD.reviewer
     OR NEW.created_at <> OLD.created_at
     OR NEW.agent_output_reference <> OLD.agent_output_reference
     OR NEW.human_verdict <> OLD.human_verdict THEN
    RAISE EXCEPTION 'Lesson review identity, verdict and agent output reference are immutable';
  END IF;

  IF NEW.state <> OLD.state THEN
    IF OLD.state IN ('APPROVED', 'REJECTED') THEN
      RAISE EXCEPTION 'Lesson review is final and cannot change state';
    END IF;
    -- Human review is mandatory before any decision: no single-step promotion.
    IF OLD.state = 'CANDIDATE' AND NEW.state <> 'REVIEWED' THEN
      RAISE EXCEPTION 'A CANDIDATE lesson must be REVIEWED by a human before it can be approved or rejected';
    END IF;
    IF OLD.state = 'REVIEWED' AND NEW.state NOT IN ('APPROVED', 'REJECTED') THEN
      RAISE EXCEPTION 'Invalid lesson review transition';
    END IF;

    NEW.decided_by := auth.uid();
    IF NEW.state = 'REVIEWED' THEN
      NEW.reviewed_at := now();
    ELSE
      NEW.decided_at := now();
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER pilot_lesson_reviews_guard_trg
  BEFORE INSERT OR UPDATE ON public.pilot_lesson_reviews
  FOR EACH ROW EXECUTE FUNCTION public.pilot_lesson_reviews_guard();

-- Auditability: append-only history written by the database, not the client.
CREATE OR REPLACE FUNCTION public.log_pilot_lesson_review_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pilot_lesson_review_events
      (lesson_review_id, organization_id, event, previous_state, new_state, actor_id, note)
    VALUES (NEW.id, NEW.organization_id, 'lesson.captured', NULL, NEW.state, auth.uid(),
            NEW.human_verdict::text);
    RETURN NEW;
  END IF;

  IF NEW.state <> OLD.state THEN
    INSERT INTO public.pilot_lesson_review_events
      (lesson_review_id, organization_id, event, previous_state, new_state, actor_id, note)
    VALUES (NEW.id, NEW.organization_id, 'lesson.state_changed', OLD.state, NEW.state, auth.uid(),
            left(coalesce(NEW.decision_note, ''), 500));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER log_pilot_lesson_review_event_trg
  AFTER INSERT OR UPDATE ON public.pilot_lesson_reviews
  FOR EACH ROW EXECUTE FUNCTION public.log_pilot_lesson_review_event();

CREATE OR REPLACE FUNCTION public.pilot_lesson_review_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Lesson review history is append-only';
END;
$$;

CREATE TRIGGER pilot_lesson_review_events_append_only_trg
  BEFORE UPDATE OR DELETE ON public.pilot_lesson_review_events
  FOR EACH ROW EXECUTE FUNCTION public.pilot_lesson_review_events_append_only();

CREATE TRIGGER pilot_lesson_reviews_set_updated_at
  BEFORE UPDATE ON public.pilot_lesson_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
