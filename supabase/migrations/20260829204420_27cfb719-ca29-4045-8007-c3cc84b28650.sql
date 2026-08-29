-- ============ helpers ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TYPE public.app_role AS ENUM ('owner','admin','member');

-- ============ profiles ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NULLIF(NEW.raw_user_meta_data->>'full_name',''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ organizations ============
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX organizations_created_by_idx ON public.organizations(created_by);
CREATE INDEX organizations_slug_idx ON public.organizations(slug);
CREATE TRIGGER organizations_set_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX organization_members_org_idx ON public.organization_members(organization_id);
CREATE INDEX organization_members_user_idx ON public.organization_members(user_id);
CREATE TRIGGER organization_members_set_updated_at BEFORE UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- security definer helpers (avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.is_org_member(_org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members m
                 WHERE m.organization_id = _org AND m.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members m
                 WHERE m.organization_id = _org AND m.user_id = auth.uid() AND m.role = ANY(_roles));
$$;

CREATE OR REPLACE FUNCTION public.create_organization(_name TEXT, _slug TEXT)
RETURNS public.organizations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org public.organizations; _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Organization name is required'; END IF;
  INSERT INTO public.organizations (name, slug, created_by)
  VALUES (trim(_name), lower(trim(_slug)), _uid) RETURNING * INTO _org;
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (_org.id, _uid, 'owner');
  RETURN _org;
END; $$;

GRANT SELECT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "organizations_select_members" ON public.organizations FOR SELECT TO authenticated USING (public.is_org_member(id));
CREATE POLICY "organizations_update_admins" ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_org_role(id, ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_org_role(id, ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "organizations_delete_owner" ON public.organizations FOR DELETE TO authenticated
  USING (public.has_org_role(id, ARRAY['owner']::public.app_role[]));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select_same_org" ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "members_insert_admins" ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "members_update_admins" ON public.organization_members FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']::public.app_role[]) AND (role <> 'owner' OR public.has_org_role(organization_id, ARRAY['owner']::public.app_role[])))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "members_delete_admins" ON public.organization_members FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']::public.app_role[]) AND (role <> 'owner' OR public.has_org_role(organization_id, ARRAY['owner']::public.app_role[])));

-- ============ digital_profiles ============
CREATE TABLE public.digital_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  profile_type TEXT NOT NULL DEFAULT 'general',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX digital_profiles_org_idx ON public.digital_profiles(organization_id);
CREATE INDEX digital_profiles_owner_idx ON public.digital_profiles(owner_id);
CREATE TRIGGER digital_profiles_set_updated_at BEFORE UPDATE ON public.digital_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_profiles TO authenticated;
GRANT ALL ON public.digital_profiles TO service_role;
ALTER TABLE public.digital_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "digital_profiles_select" ON public.digital_profiles FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "digital_profiles_insert" ON public.digital_profiles FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "digital_profiles_update" ON public.digital_profiles FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "digital_profiles_delete" ON public.digital_profiles FOR DELETE TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','admin']::public.app_role[]));

-- ============ agents ============
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'generic',
  status TEXT NOT NULL DEFAULT 'inactive',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agents_org_idx ON public.agents(organization_id);
CREATE TRIGGER agents_set_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents TO authenticated;
GRANT ALL ON public.agents TO service_role;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agents_select" ON public.agents FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "agents_insert" ON public.agents FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "agents_update" ON public.agents FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','admin']::public.app_role[])) WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "agents_delete" ON public.agents FOR DELETE TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','admin']::public.app_role[]));

-- ============ agent_permissions ============
CREATE TABLE public.agent_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, permission_key)
);
CREATE INDEX agent_permissions_agent_idx ON public.agent_permissions(agent_id);
CREATE INDEX agent_permissions_org_idx ON public.agent_permissions(organization_id);
CREATE TRIGGER agent_permissions_set_updated_at BEFORE UPDATE ON public.agent_permissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_permissions TO authenticated;
GRANT ALL ON public.agent_permissions TO service_role;
ALTER TABLE public.agent_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_permissions_select" ON public.agent_permissions FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "agent_permissions_write" ON public.agent_permissions FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "agent_permissions_update" ON public.agent_permissions FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','admin']::public.app_role[])) WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "agent_permissions_delete" ON public.agent_permissions FOR DELETE TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','admin']::public.app_role[]));

-- ============ agent_activity_logs ============
CREATE TABLE public.agent_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agent_activity_logs_agent_idx ON public.agent_activity_logs(agent_id);
CREATE INDEX agent_activity_logs_org_created_idx ON public.agent_activity_logs(organization_id, created_at DESC);
CREATE INDEX agent_activity_logs_actor_idx ON public.agent_activity_logs(actor_id);
GRANT SELECT, INSERT ON public.agent_activity_logs TO authenticated;
GRANT ALL ON public.agent_activity_logs TO service_role;
ALTER TABLE public.agent_activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_activity_logs_select" ON public.agent_activity_logs FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "agent_activity_logs_insert" ON public.agent_activity_logs FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id) AND (actor_id IS NULL OR actor_id = auth.uid()));
