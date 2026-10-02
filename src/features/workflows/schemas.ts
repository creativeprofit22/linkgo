import { defineRoute, emptyRouteSearch } from "@/lib/navigation/route-contract";

/** Address of the Automations screen (`#/workflows`). See docs/features/navigation.md. */
export const workflowsRoute = defineRoute("workflows", emptyRouteSearch());
