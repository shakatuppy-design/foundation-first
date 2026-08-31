REVOKE ALL ON public.pilot_emergency_events FROM PUBLIC;
REVOKE ALL ON public.pilot_emergency_events FROM anon;
GRANT SELECT, INSERT ON public.pilot_emergency_events TO authenticated;
GRANT ALL ON public.pilot_emergency_events TO service_role;