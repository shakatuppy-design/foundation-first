-- Session 3D-1 hardening: the two new tables inherited default privileges for
-- anon/PUBLIC. Every other public table in this project is authenticated-only.
REVOKE ALL ON public.agent_capability_verifications FROM anon;
REVOKE ALL ON public.agent_capability_verifications FROM PUBLIC;
REVOKE ALL ON public.agent_capability_contracts FROM anon;
REVOKE ALL ON public.agent_capability_contracts FROM PUBLIC;

-- Restate the locked grant set (no DELETE, no TRUNCATE for app roles).
REVOKE ALL ON public.agent_capability_verifications FROM authenticated;
REVOKE ALL ON public.agent_capability_contracts FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.agent_capability_verifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.agent_capability_contracts TO authenticated;
GRANT ALL ON public.agent_capability_verifications TO service_role;
GRANT ALL ON public.agent_capability_contracts TO service_role;