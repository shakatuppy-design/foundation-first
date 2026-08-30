-- Session 3D-3: move contract confidentiality to the RLS boundary.
-- Replaces the overly broad member-wide SELECT with party-only access.
DROP POLICY IF EXISTS acc_select ON public.agent_capability_contracts;

CREATE POLICY acc_select
  ON public.agent_capability_contracts
  FOR SELECT
  TO authenticated
  USING (
    public.controls_digital_profile(requester_digital_profile_id)
    OR public.has_org_role(organization_id, ARRAY['owner'::app_role, 'admin'::app_role])
  );
