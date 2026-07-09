import { Badge } from "@/components/ui/badge";
import type {
  ContentCalendarPurpose,
  ContentCalendarSlotWithDetails,
} from "@/features/content-calendar/types";

const purposeLabels: Record<ContentCalendarPurpose, string> = {
  reach: "Reach",
  trust: "Trust",
  proof: "Proof",
  conversion: "Conversion",
  community: "Community",
};

const purposeVariants: Record<
  ContentCalendarPurpose,
  "default" | "outline" | "secondary" | "success" | "warning"
> = {
  reach: "default",
  trust: "secondary",
  proof: "success",
  conversion: "warning",
  community: "outline",
};

export type ContentCalendarLifecycle =
  | "archived"
  | "published"
  | "scheduled"
  | "planned";

const lifecycleLabels: Record<ContentCalendarLifecycle, string> = {
  archived: "Archived",
  published: "Published",
  scheduled: "Scheduled",
  planned: "Planned",
};

const lifecycleVariants: Record<
  ContentCalendarLifecycle,
  "default" | "outline" | "secondary" | "success"
> = {
  archived: "outline",
  published: "success",
  scheduled: "default",
  planned: "secondary",
};

export function getContentCalendarLifecycle(
  slot: ContentCalendarSlotWithDetails,
): ContentCalendarLifecycle {
  if (slot.status === "archived") return "archived";
  if (slot.approval.status === "published" || slot.publishAttempt !== null) {
    return "published";
  }
  if (
    slot.approval.status === "scheduled" ||
    slot.scheduleJob?.status === "scheduled"
  ) {
    return "scheduled";
  }
  return "planned";
}

export function ContentCalendarPurposeBadge({
  purpose,
}: {
  purpose: ContentCalendarPurpose;
}): React.ReactNode {
  return (
    <Badge variant={purposeVariants[purpose]}>{purposeLabels[purpose]}</Badge>
  );
}

export function ContentCalendarLifecycleBadge({
  lifecycle,
}: {
  lifecycle: ContentCalendarLifecycle;
}): React.ReactNode {
  return (
    <Badge variant={lifecycleVariants[lifecycle]}>
      {lifecycleLabels[lifecycle]}
    </Badge>
  );
}
