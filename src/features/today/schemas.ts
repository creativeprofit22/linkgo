import { defineRoute, emptyRouteSearch } from "@/lib/navigation/route-contract";

/** `#/today`: the to-do list of what needs the user now. Takes no params. */
export const todayRoute = defineRoute("today", emptyRouteSearch());
