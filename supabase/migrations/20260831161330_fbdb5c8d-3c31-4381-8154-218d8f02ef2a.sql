REVOKE ALL ON public.pilot_revenue_opportunities FROM anon;
REVOKE ALL ON public.pilot_opportunity_outcomes FROM anon;

REVOKE DELETE ON public.pilot_revenue_opportunities FROM authenticated;
REVOKE DELETE, UPDATE ON public.pilot_opportunity_outcomes FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON public.pilot_revenue_opportunities TO authenticated;
GRANT SELECT, INSERT ON public.pilot_opportunity_outcomes TO authenticated;
GRANT ALL ON public.pilot_revenue_opportunities TO service_role;
GRANT ALL ON public.pilot_opportunity_outcomes TO service_role;