CREATE TABLE IF NOT EXISTS public.pilot_emergency_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pilot_key text NOT NULL DEFAULT 'management-intelligence-pilot'
    CHECK (pilot_key = 'management-intelligence-pilot'),
  previous_state text NOT NULL CHECK (previous_state IN ('RUNNING','STOPPED')),
  new_state text NOT NULL CHECK (new_state IN ('RUNNING','STOPPED')),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  activated_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pilot_emergency_events_org_created_idx
  ON public.pilot_emergency_events (organization_id, created_at DESC);

GRANT SELECT, INSERT ON public.pilot_emergency_events TO authenticated;
GRANT ALL ON public.pilot_emergency_events TO service_role;

ALTER TABLE public.pilot_emergency_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members read pilot emergency log" ON public.pilot_emergency_events;
CREATE POLICY "org members read pilot emergency log"
  ON public.pilot_emergency_events FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "org managers append pilot emergency events" ON public.pilot_emergency_events;
CREATE POLICY "org managers append pilot emergency events"
  ON public.pilot_emergency_events FOR INSERT TO authenticated
  WITH CHECK (
    activated_by = auth.uid()
    AND public.has_org_role(organization_id, ARRAY['owner'::app_role, 'admin'::app_role])
  );

CREATE OR REPLACE FUNCTION public.pilot_emergency_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'pilot_emergency_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS pilot_emergency_events_no_mutate ON public.pilot_emergency_events;
CREATE TRIGGER pilot_emergency_events_no_mutate
  BEFORE UPDATE OR DELETE ON public.pilot_emergency_events
  FOR EACH ROW EXECUTE FUNCTION public.pilot_emergency_events_append_only();