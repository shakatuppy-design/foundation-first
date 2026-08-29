import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { JsonValue } from "@/lib/digital-self.functions";

export const INTENT_TYPES = [
  "general",
  "discovery",
  "procurement",
  "logistics",
  "service",
  "research",
] as const;
export const INTENT_STATUSES = [
  "draft",
  "active",
  "paused",
  "fulfilled",
  "cancelled",
  "expired",
] as const;
export const INTENT_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export type IntentType = (typeof INTENT_TYPES)[number];
export type IntentStatus = (typeof INTENT_STATUSES)[number];
export type IntentPriority = (typeof INTENT_PRIORITIES)[number];

export type DigitalIntent = {
  id: string;
  digital_profile_id: string;
  title: string;
  description: string;
  intent_type: IntentType;
  status: IntentStatus;
  priority: IntentPriority;
  /** Descriptive only. Nothing matches, routes, or executes on this in this session. */
  discovery_requirement: JsonValue;
  created_at: string;
  updated_at: string;
};

const profileInput = z.object({ profileId: z.string().uuid() });

export const listIntents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => profileInput.parse(input))
  .handler(async ({ data, context }): Promise<DigitalIntent[]> => {
    const { data: rows, error } = await context.supabase
      .from("digital_intents")
      .select("*")
      .eq("digital_profile_id", data.profileId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as DigitalIntent[];
  });

export const saveIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        profileId: z.string().uuid(),
        id: z.string().uuid().optional(),
        title: z.string().trim().min(2).max(160),
        description: z.string().max(4000).default(""),
        intentType: z.enum(INTENT_TYPES),
        status: z.enum(INTENT_STATUSES),
        priority: z.enum(INTENT_PRIORITIES),
        discoveryCategory: z.string().trim().max(60).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const row = {
      digital_profile_id: data.profileId,
      title: data.title,
      description: data.description,
      intent_type: data.intentType,
      status: data.status,
      priority: data.priority,
      discovery_requirement: data.discoveryCategory
        ? { category: data.discoveryCategory.toLowerCase() }
        : {},
    };

    const query = data.id
      ? context.supabase.from("digital_intents").update(row).eq("id", data.id)
      : context.supabase.from("digital_intents").insert(row);

    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("digital_intents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
