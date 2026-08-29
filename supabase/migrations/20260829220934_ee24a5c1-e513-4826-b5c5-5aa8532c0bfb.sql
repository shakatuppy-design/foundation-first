REVOKE ALL ON FUNCTION public.controls_digital_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_digital_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.digital_profile_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_org_role(uuid, app_role[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shares_organization(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_organization(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.controls_digital_profile(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_digital_profile(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.digital_profile_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, app_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shares_organization(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text) TO authenticated, service_role;
