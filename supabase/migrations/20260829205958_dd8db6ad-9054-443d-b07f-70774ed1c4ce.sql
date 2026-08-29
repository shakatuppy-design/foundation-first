-- 1. Member role escalation fix
DROP POLICY IF EXISTS members_update_admins ON public.organization_members;
CREATE POLICY members_update_admins ON public.organization_members
FOR UPDATE TO authenticated
USING (
  public.has_org_role(organization_id, ARRAY['owner','admin']::app_role[])
  AND (role <> 'owner'::app_role OR public.has_org_role(organization_id, ARRAY['owner']::app_role[]))
)
WITH CHECK (
  public.has_org_role(organization_id, ARRAY['owner','admin']::app_role[])
  AND (role <> 'owner'::app_role OR public.has_org_role(organization_id, ARRAY['owner']::app_role[]))
);

DROP POLICY IF EXISTS members_insert_admins ON public.organization_members;
CREATE POLICY members_insert_admins ON public.organization_members
FOR INSERT TO authenticated
WITH CHECK (
  public.has_org_role(organization_id, ARRAY['owner','admin']::app_role[])
  AND (role <> 'owner'::app_role OR public.has_org_role(organization_id, ARRAY['owner']::app_role[]))
);

-- 2. Remove anonymous access entirely
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.organizations FROM anon;
REVOKE ALL ON public.organization_members FROM anon;
REVOKE ALL ON public.digital_profiles FROM anon;
REVOKE ALL ON public.agents FROM anon;
REVOKE ALL ON public.agent_permissions FROM anon;
REVOKE ALL ON public.agent_activity_logs FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_activity_logs TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.organization_members TO service_role;
GRANT ALL ON public.digital_profiles TO service_role;
GRANT ALL ON public.agents TO service_role;
GRANT ALL ON public.agent_permissions TO service_role;
GRANT ALL ON public.agent_activity_logs TO service_role;

-- 3. Profiles: own row + org co-members only
CREATE OR REPLACE FUNCTION public.shares_organization(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members a
    JOIN public.organization_members b ON b.organization_id = a.organization_id
    WHERE a.user_id = auth.uid() AND b.user_id = _user
  );
$$;
REVOKE ALL ON FUNCTION public.shares_organization(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_organization(uuid) TO authenticated;

DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_visible ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = id OR public.shares_organization(id));

-- 4. Agent ownership consistency
ALTER TABLE public.agents ADD CONSTRAINT agents_id_org_key UNIQUE (id, organization_id);

ALTER TABLE public.agent_permissions DROP CONSTRAINT IF EXISTS agent_permissions_agent_id_fkey;
ALTER TABLE public.agent_permissions
  ADD CONSTRAINT agent_permissions_agent_org_fkey
  FOREIGN KEY (agent_id, organization_id)
  REFERENCES public.agents(id, organization_id) ON DELETE CASCADE;

ALTER TABLE public.agent_activity_logs DROP CONSTRAINT IF EXISTS agent_activity_logs_agent_id_fkey;
ALTER TABLE public.agent_activity_logs
  ADD CONSTRAINT agent_activity_logs_agent_org_fkey
  FOREIGN KEY (agent_id, organization_id)
  REFERENCES public.agents(id, organization_id) ON DELETE CASCADE;

-- 5. Digital profile ownership
DROP POLICY IF EXISTS digital_profiles_insert ON public.digital_profiles;
CREATE POLICY digital_profiles_insert ON public.digital_profiles
FOR INSERT TO authenticated
WITH CHECK (
  public.is_org_member(organization_id)
  AND (
    owner_id = auth.uid()
    OR public.has_org_role(organization_id, ARRAY['owner','admin']::app_role[])
  )
);

DROP POLICY IF EXISTS digital_profiles_update ON public.digital_profiles;
CREATE POLICY digital_profiles_update ON public.digital_profiles
FOR UPDATE TO authenticated
USING (
  public.is_org_member(organization_id)
  AND (
    owner_id = auth.uid()
    OR public.has_org_role(organization_id, ARRAY['owner','admin']::app_role[])
  )
)
WITH CHECK (
  public.is_org_member(organization_id)
  AND (
    owner_id = auth.uid()
    OR public.has_org_role(organization_id, ARRAY['owner','admin']::app_role[])
  )
);

-- 6. Activity log attribution
ALTER TABLE public.agent_activity_logs ALTER COLUMN actor_id SET DEFAULT auth.uid();
DROP POLICY IF EXISTS agent_activity_logs_insert ON public.agent_activity_logs;
CREATE POLICY agent_activity_logs_insert ON public.agent_activity_logs
FOR INSERT TO authenticated
WITH CHECK (public.is_org_member(organization_id) AND actor_id = auth.uid());

-- 7. Value constraints
ALTER TABLE public.agents
  ADD CONSTRAINT agents_status_check CHECK (status IN ('active','inactive','suspended')),
  ADD CONSTRAINT agents_kind_check CHECK (kind IN ('generic','assistant','workflow','integration')),
  ADD CONSTRAINT agents_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 120);

ALTER TABLE public.digital_profiles
  ADD CONSTRAINT digital_profiles_type_check CHECK (profile_type IN ('general','person','organization','device')),
  ADD CONSTRAINT digital_profiles_display_name_check CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 120);

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_slug_check CHECK (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' AND char_length(slug) BETWEEN 2 AND 63),
  ADD CONSTRAINT organizations_name_check CHECK (char_length(btrim(name)) BETWEEN 2 AND 120);

-- create_organization: validate slug server-side
CREATE OR REPLACE FUNCTION public.create_organization(_name text, _slug text)
RETURNS organizations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE _org public.organizations; _uid UUID := auth.uid(); _s TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF char_length(btrim(coalesce(_name,''))) < 2 THEN RAISE EXCEPTION 'Organization name is required'; END IF;
  _s := lower(btrim(coalesce(_slug,'')));
  IF _s = '' THEN
    _s := btrim(regexp_replace(lower(btrim(_name)), '[^a-z0-9]+', '-', 'g'), '-');
  END IF;
  IF _s !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' OR char_length(_s) NOT BETWEEN 2 AND 63 THEN
    RAISE EXCEPTION 'Invalid organization slug';
  END IF;
  INSERT INTO public.organizations (name, slug, created_by)
  VALUES (btrim(_name), _s, _uid) RETURNING * INTO _org;
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (_org.id, _uid, 'owner');
  RETURN _org;
END; $function$;
