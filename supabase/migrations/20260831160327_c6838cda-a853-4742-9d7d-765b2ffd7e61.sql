REVOKE ALL ON FUNCTION public.pilot_outcomes_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pilot_opportunities_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pilot_outcomes_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pilot_opportunities_no_delete() FROM PUBLIC, anon, authenticated;