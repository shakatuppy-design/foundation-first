import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type DigitalVisibility = "private" | "shared" | "public";
export type DigitalProfileStatus = "active" | "inactive" | "archived";
export type DigitalCapability =
  | "read_profile"
  | "read_preference"
  | "read_goal"
  | "read_memory"
  | "create_intent"
  | "request_capability"
  | "request_quote"
  | "request_action";

export type DigitalSelfProfile = {
  id: string;
  organization_id: string;
  user_id: string | null;
  display_name: string;
  profile_type: string;
  status: DigitalProfileStatus;
  visibility: DigitalVisibility;
  metadata: JsonValue;
  created_at: string;
  updated_at: string;
};

export type DigitalPreference = {
  id: string;
  key: string;
  value: string;
  visibility: DigitalVisibility;
};

export type DigitalGoal = {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "draft" | "active" | "paused" | "achieved" | "abandoned";
};

export type DigitalMemoryItem = {
  id: string;
  memory_type: string;
  content: string;
  source: string;
  confidence: number;
  visibility: DigitalVisibility;
};

export type DigitalAuthorityRule = {
  id: string;
  capability: DigitalCapability;
  agent_id: string | null;
  allowed: boolean;
  scope: JsonValue;
  expires_at: string | null;
  status: "active" | "revoked" | "expired";
  granted_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DigitalSelfBundle = {
  profile: DigitalSelfProfile | null;
  preferences: DigitalPreference[];
  goals: DigitalGoal[];
  memory: DigitalMemoryItem[];
  authority: DigitalAuthorityRule[];
  agents: { id: string; name: string; status: string }[];
};

export const getMyDigitalSelf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<DigitalSelfBundle> => {
    const { data: profiles, error } = await context.supabase
      .from("digital_profiles")
      .select("*")
      .eq("organization_id", data.organizationId)
      .eq("user_id", context.userId)
      .eq("profile_type", "person")
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) throw new Error(error.message);

    const { data: agents } = await context.supabase
      .from("agents")
      .select("id, name, status")
      .eq("organization_id", data.organizationId)
      .order("name", { ascending: true });

    const profile = (profiles?.[0] ?? null) as DigitalSelfProfile | null;
    if (!profile) {
      return {
        profile: null,
        preferences: [],
        goals: [],
        memory: [],
        authority: [],
        agents: agents ?? [],
      };
    }

    const [prefs, goals, memory, authority] = await Promise.all([
      context.supabase
        .from("digital_preferences")
        .select("id, key, value, visibility")
        .eq("digital_profile_id", profile.id)
        .order("key", { ascending: true }),
      context.supabase
        .from("digital_goals")
        .select("id, title, description, priority, status")
        .eq("digital_profile_id", profile.id)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("digital_memory_items")
        .select("id, memory_type, content, source, confidence, visibility")
        .eq("digital_profile_id", profile.id)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("digital_authority_rules")
        .select(
          "id, capability, agent_id, allowed, scope, expires_at, status, granted_by, created_at, updated_at",
        )
        .eq("digital_profile_id", profile.id)
        .order("capability", { ascending: true }),
    ]);

    if (prefs.error) throw new Error(prefs.error.message);
    if (goals.error) throw new Error(goals.error.message);
    if (memory.error) throw new Error(memory.error.message);
    if (authority.error) throw new Error(authority.error.message);

    return {
      profile,
      preferences: (prefs.data ?? []) as DigitalPreference[],
      goals: (goals.data ?? []) as DigitalGoal[],
      memory: (memory.data ?? []) as DigitalMemoryItem[],
      authority: (authority.data ?? []) as DigitalAuthorityRule[],
      agents: agents ?? [],
    };
  });

export const createMyDigitalSelf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        displayName: z.string().trim().min(2).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: created, error } = await context.supabase
      .from("digital_profiles")
      .insert({
        organization_id: data.organizationId,
        user_id: context.userId,
        display_name: data.displayName,
        profile_type: "person",
        visibility: "private",
        status: "active",
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return created;
  });

export const updateMyDigitalSelf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        profileId: z.string().uuid(),
        displayName: z.string().trim().min(2).max(120).optional(),
        status: z.enum(["active", "inactive", "archived"]).optional(),
        visibility: z.enum(["private", "shared", "public"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      display_name?: string;
      status?: "active" | "inactive" | "archived";
      visibility?: "private" | "shared" | "public";
    } = {};
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.status !== undefined) patch.status = data.status;
    if (data.visibility !== undefined) patch.visibility = data.visibility;

    const { error } = await context.supabase
      .from("digital_profiles")
      .update(patch)
      .eq("id", data.profileId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const savePreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        profileId: z.string().uuid(),
        id: z.string().uuid().optional(),
        key: z.string().trim().min(1).max(80),
        value: z.string().max(2000),
        visibility: z.enum(["private", "shared", "public"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const row = {
      digital_profile_id: data.profileId,
      key: data.key,
      value: data.value,
      visibility: data.visibility,
    };
    const query = data.id
      ? context.supabase.from("digital_preferences").update(row).eq("id", data.id)
      : context.supabase.from("digital_preferences").insert(row);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("digital_preferences")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        profileId: z.string().uuid(),
        id: z.string().uuid().optional(),
        title: z.string().trim().min(2).max(160),
        description: z.string().max(4000).default(""),
        priority: z.enum(["low", "medium", "high", "critical"]),
        status: z.enum(["draft", "active", "paused", "achieved", "abandoned"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const row = {
      digital_profile_id: data.profileId,
      title: data.title,
      description: data.description,
      priority: data.priority,
      status: data.status,
    };
    const query = data.id
      ? context.supabase.from("digital_goals").update(row).eq("id", data.id)
      : context.supabase.from("digital_goals").insert(row);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("digital_goals").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveMemoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        profileId: z.string().uuid(),
        id: z.string().uuid().optional(),
        memoryType: z.enum(["note", "fact", "preference_signal", "context"]),
        content: z.string().trim().min(1).max(4000),
        visibility: z.enum(["private", "shared", "public"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const row = {
      digital_profile_id: data.profileId,
      memory_type: data.memoryType,
      content: data.content,
      visibility: data.visibility,
    };
    const query = data.id
      ? context.supabase.from("digital_memory_items").update(row).eq("id", data.id)
      : context.supabase.from("digital_memory_items").insert(row);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMemoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("digital_memory_items")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const grantAuthority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        profileId: z.string().uuid(),
        organizationId: z.string().uuid(),
        agentId: z.string().uuid().nullable().default(null),
        capability: z.enum([
          "read_profile",
          "read_preference",
          "read_goal",
          "read_memory",
          "create_intent",
          "request_capability",
          "request_quote",
          "request_action",
        ]),
        allowed: z.boolean(),
        scopeNote: z.string().max(400).default(""),
        expiresAt: z.string().datetime().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("digital_authority_rules").insert({
      digital_profile_id: data.profileId,
      organization_id: data.organizationId,
      agent_id: data.agentId,
      capability: data.capability,
      allowed: data.allowed,
      scope: data.scopeNote ? { note: data.scopeNote } : {},
      expires_at: data.expiresAt,
      status: "active",
      granted_by: context.userId,
    });
    if (error) {
      if (error.code === "23505" || error.message.includes("duplicate")) {
        throw new Error("That capability is already defined for this agent.");
      }
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const setAuthorityAllowed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), allowed: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("digital_authority_rules")
      .update({ allowed: data.allowed, status: "active" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeAuthority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("digital_authority_rules")
      .update({ status: "revoked", allowed: false })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyDigitalSelfAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_activity_logs")
      .select("id, event, payload, actor_id, agent_id, created_at")
      .eq("organization_id", data.organizationId)
      .like("event", "digital_%")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
