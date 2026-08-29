import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyOrganizations, type OrganizationSummary } from "@/lib/organizations.functions";

const STORAGE_KEY = "logos.activeOrganizationId";

type OrgContextValue = {
  organizations: OrganizationSummary[];
  activeOrg: OrganizationSummary | null;
  setActiveOrgId: (id: string) => void;
  isLoading: boolean;
  refresh: () => void;
};

const OrgContext = createContext<OrgContextValue>({
  organizations: [],
  activeOrg: null,
  setActiveOrgId: () => {},
  isLoading: true,
  refresh: () => {},
});

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const fetchOrgs = useServerFn(listMyOrganizations);
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => fetchOrgs(),
  });

  const organizations = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setActiveId(stored);
  }, []);

  useEffect(() => {
    if (!organizations.length) return;
    if (!activeId || !organizations.some((o) => o.id === activeId)) {
      setActiveId(organizations[0]!.id);
    }
  }, [organizations, activeId]);

  const value = useMemo<OrgContextValue>(() => {
    const activeOrg = organizations.find((o) => o.id === activeId) ?? null;
    return {
      organizations,
      activeOrg,
      isLoading,
      setActiveOrgId: (id: string) => {
        setActiveId(id);
        window.localStorage.setItem(STORAGE_KEY, id);
      },
      refresh: () => {
        void queryClient.invalidateQueries({ queryKey: ["organizations"] });
      },
    };
  }, [organizations, activeId, isLoading, queryClient]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrganizations() {
  return useContext(OrgContext);
}
