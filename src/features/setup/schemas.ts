import { defineRoute, emptyRouteSearch } from "@/lib/navigation/route-contract";
import { z } from "zod";

/** Address of the Get started screen (`#/setup`). See docs/features/setup.md. */
export const setupRoute = defineRoute("setup", emptyRouteSearch());

/** Stored setup preferences; anything else is ignored and treated as fresh. */
export const setupPreferencesSchema = z
  .object({
    dismissed: z.boolean(),
  })
  .strict();
