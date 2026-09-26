import { Clock } from "lucide-react";
import {
  getPublishLockLabel,
  type PublishLock,
} from "@/features/publish-reconciliation/publish-lock";

interface PublishLockNoticeProps {
  lock: PublishLock;
}

/** Short inline notice explaining why the LinkedIn publish action is locked. */
export function PublishLockNotice({
  lock,
}: PublishLockNoticeProps): React.ReactNode {
  return (
    <p
      role="status"
      className="bg-muted/60 text-muted-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm"
    >
      <Clock className="size-3.5" aria-hidden="true" />
      {getPublishLockLabel(lock)}
    </p>
  );
}
