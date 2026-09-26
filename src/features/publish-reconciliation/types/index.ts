export type PublishExecutionKind = "post" | "comment";

export type PublishExecutionCaller = "manual" | "scheduler";

export type OpenPublishExecutionStatus =
  | "reserved"
  | "in_flight"
  | "outcome_unknown";

export type PublishExecutionRemoteOutcome =
  | ""
  | "created"
  | "rejected"
  | "ambiguous";

/** Open (unsettled) durable publish execution from native storage. */
export interface OpenPublishExecution {
  id: number;
  kind: PublishExecutionKind;
  subjectId: number;
  campaignId: number;
  campaignName: string;
  scheduleJobId: number | null;
  caller: PublishExecutionCaller;
  status: OpenPublishExecutionStatus;
  fence: number;
  remoteOutcome: PublishExecutionRemoteOutcome;
  remoteStatusCode: number | null;
  errorMessage: string;
  reservedAt: string;
  sentAt: string | null;
  updatedAt: string;
}

export type ReconcileResolution = "posted" | "not_posted";

export interface ReconcilePublishExecutionInput {
  executionId: number;
  fence: number;
  resolution: ReconcileResolution;
  /** LinkedIn URL or URN; required when `resolution` is `posted`. */
  externalUrl?: string | undefined;
  note?: string | undefined;
  /** Must equal {@link RECONCILE_CONFIRMATION} exactly. */
  confirmation: string;
}

export type ReconciledExecutionStatus =
  | "reconciled_posted"
  | "reconciled_not_posted";

export interface ReconcilePublishExecutionResult {
  executionId: number;
  status: ReconciledExecutionStatus;
}
