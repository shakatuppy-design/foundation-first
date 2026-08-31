CREATE TYPE public.revenue_human_decision AS ENUM ('PENDING','ACTION_TAKEN','NO_ACTION','REJECTED','NEEDS_MORE_DATA');
CREATE TYPE public.revenue_value_kind AS ENUM ('NONE','REVENUE_INCREASE','COST_SAVING');

CREATE TABLE public.pilot_revenue_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pilot_key text NOT NULL,
  dataset_label text NOT NULL,
  opportunity text NOT NULL,
  evidence text[] NOT NULL DEFAULT '{}',
  expected_impact text NOT NULL DEFAULT '',
  estimated_value_idr numeric(18,2) NOT NULL DEFAULT 0 CHECK (estimated_value_idr >= 0),
  kind text NOT NULL CHECK (kind IN ('REVENUE_INCREASE','COST_SAVING')),
  confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  must_verify text[] NOT NULL DEFAULT '{}',
  reasoning_status text NOT NULL CHECK (reasoning_status IN ('COMPLETE','NEEDS_DATA','UNCERTAIN','BLOCKED')),
  model text NOT NULL,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer NOT NULL DEFAULT 0,
  ai_cost_idr numeric(18,4) NOT NULL DEFAULT 0 CHECK (ai_cost_idr >= 0),
  human_decision public.revenue_human_decision NOT NULL DEFAULT 'PENDING',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pilot_opportunity_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL UNIQUE REFERENCES public.pilot_revenue_opportunities(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  decision public.revenue_human_decision NOT NULL CHECK (decision <> 'PENDING'),
  action_description text NOT NULL DEFAULT '',
  baseline_metric text NOT NULL DEFAULT '',
  post_action_metric text NOT NULL DEFAULT '',
  value_kind public.revenue_value_kind NOT NULL DEFAULT 'NONE',
  actual_value_idr numeric(18,2) NOT NULL DEFAULT 0 CHECK (actual_value_idr >= 0),
  human_review_cost_idr numeric(18,2) NOT NULL DEFAULT 0 CHECK (human_review_cost_idr >= 0),
  evidence_reference text[] NOT NULL DEFAULT '{}',
  note text NOT NULL DEFAULT '',
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pilot_rev_opp_org ON public.pilot_revenue_opportunities(organization_id, created_at DESC);
CREATE INDEX idx_pilot_rev_opp_decision ON public.pilot_revenue_opportunities(organization_id, human_decision);
CREATE INDEX idx_pilot_opp_outcome_org ON public.pilot_opportunity_outcomes(organization_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.pilot_revenue_opportunities TO authenticated;
GRANT ALL ON public.pilot_revenue_opportunities TO service_role;
GRANT SELECT, INSERT ON public.pilot_opportunity_outcomes TO authenticated;
GRANT ALL ON public.pilot_opportunity_outcomes TO service_role;

ALTER TABLE public.pilot_revenue_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_opportunity_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read organization opportunities"
  ON public.pilot_revenue_opportunities FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Owners and admins record opportunities"
  ON public.pilot_revenue_opportunities FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner'::app_role,'admin'::app_role]) AND created_by = auth.uid());

CREATE POLICY "Owners and admins update opportunity decision"
  ON public.pilot_revenue_opportunities FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner'::app_role,'admin'::app_role]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner'::app_role,'admin'::app_role]));

CREATE POLICY "Members read organization outcomes"
  ON public.pilot_opportunity_outcomes FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Owners and admins record outcomes"
  ON public.pilot_opportunity_outcomes FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner'::app_role,'admin'::app_role]) AND recorded_by = auth.uid());

CREATE OR REPLACE FUNCTION public.pilot_opportunities_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
       OR NEW.organization_id <> OLD.organization_id
       OR NEW.pilot_key <> OLD.pilot_key
       OR NEW.dataset_label <> OLD.dataset_label
       OR NEW.opportunity <> OLD.opportunity
       OR NEW.evidence IS DISTINCT FROM OLD.evidence
       OR NEW.expected_impact <> OLD.expected_impact
       OR NEW.estimated_value_idr <> OLD.estimated_value_idr
       OR NEW.kind <> OLD.kind
       OR NEW.confidence <> OLD.confidence
       OR NEW.must_verify IS DISTINCT FROM OLD.must_verify
       OR NEW.reasoning_status <> OLD.reasoning_status
       OR NEW.model <> OLD.model
       OR NEW.input_tokens IS DISTINCT FROM OLD.input_tokens
       OR NEW.output_tokens IS DISTINCT FROM OLD.output_tokens
       OR NEW.latency_ms <> OLD.latency_ms
       OR NEW.ai_cost_idr <> OLD.ai_cost_idr
       OR NEW.created_by <> OLD.created_by
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'Recorded agent output is immutable; only the human decision may change.';
    END IF;
    IF NEW.human_decision <> OLD.human_decision AND OLD.human_decision <> 'PENDING' THEN
      RAISE EXCEPTION 'A recorded human decision is final.';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  NEW.human_decision := 'PENDING';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pilot_opportunities_guard
BEFORE INSERT OR UPDATE ON public.pilot_revenue_opportunities
FOR EACH ROW EXECUTE FUNCTION public.pilot_opportunities_guard();

CREATE OR REPLACE FUNCTION public.pilot_outcomes_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  opp_org uuid;
  opp_decision public.revenue_human_decision;
BEGIN
  SELECT organization_id, human_decision INTO opp_org, opp_decision
  FROM public.pilot_revenue_opportunities WHERE id = NEW.opportunity_id;

  IF opp_org IS NULL THEN
    RAISE EXCEPTION 'Unknown opportunity.';
  END IF;
  IF opp_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'An outcome must belong to the same organization as its opportunity.';
  END IF;
  IF opp_decision <> 'PENDING' THEN
    RAISE EXCEPTION 'This opportunity already has a recorded human decision.';
  END IF;
  IF NEW.recorded_by <> auth.uid() THEN
    RAISE EXCEPTION 'An outcome must be recorded by the acting human.';
  END IF;

  IF NEW.decision = 'ACTION_TAKEN' THEN
    IF btrim(NEW.action_description) = ''
       OR btrim(NEW.baseline_metric) = ''
       OR btrim(NEW.post_action_metric) = '' THEN
      RAISE EXCEPTION 'ACTION_TAKEN requires an action description, a baseline metric and a post-action metric.';
    END IF;
  END IF;

  IF NEW.actual_value_idr > 0 THEN
    IF NEW.decision <> 'ACTION_TAKEN' THEN
      RAISE EXCEPTION 'An actual value can only be recorded for ACTION_TAKEN.';
    END IF;
    IF NEW.value_kind = 'NONE' THEN
      RAISE EXCEPTION 'An actual value must be a revenue increase or a cost saving.';
    END IF;
    IF coalesce(array_length(NEW.evidence_reference, 1), 0) = 0 THEN
      RAISE EXCEPTION 'An actual value requires at least one trusted evidence reference.';
    END IF;
  END IF;

  UPDATE public.pilot_revenue_opportunities
  SET human_decision = NEW.decision, updated_at = now()
  WHERE id = NEW.opportunity_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pilot_outcomes_guard
BEFORE INSERT ON public.pilot_opportunity_outcomes
FOR EACH ROW EXECUTE FUNCTION public.pilot_outcomes_guard();

CREATE OR REPLACE FUNCTION public.pilot_outcomes_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Recorded business outcomes are append-only.';
END;
$$;

CREATE TRIGGER trg_pilot_outcomes_append_only
BEFORE UPDATE OR DELETE ON public.pilot_opportunity_outcomes
FOR EACH ROW EXECUTE FUNCTION public.pilot_outcomes_append_only();

CREATE OR REPLACE FUNCTION public.pilot_opportunities_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Recorded opportunities cannot be deleted.';
END;
$$;

CREATE TRIGGER trg_pilot_opportunities_no_delete
BEFORE DELETE ON public.pilot_revenue_opportunities
FOR EACH ROW EXECUTE FUNCTION public.pilot_opportunities_no_delete();