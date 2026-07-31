import type { CandidateWithTarget } from "@/features/candidate-queue";
import type { CandidatePolicyRuleKey } from "@/features/candidate-policy";
import type { SourceConnectorKey } from "@/features/source-imports/connectors";

export type SourceImportSourceType = SourceConnectorKey;

export type SourceImportBatchStatus =
  | "processing"
  | "completed"
  | "completed_with_errors"
  | "failed";

export type SourceImportItemStatus =
  | "pending"
  | "accepted"
  | "duplicate"
  | "rejected";

export interface SourceImportBatch {
  id: number;
  campaign_id: number;
  source_type: SourceImportSourceType;
  status: SourceImportBatchStatus;
  total_count: number;
  accepted_count: number;
  duplicate_count: number;
  rejected_count: number;
  error_message: string;
  created_at: string;
  updated_at: string;
}

export interface SourceImportItem {
  id: number;
  source_import_batch_id: number;
  row_number: number;
  status: SourceImportItemStatus;
  input_json: string;
  candidate_post_id: number | null;
  reason: string;
  policy_rule_key: CandidatePolicyRuleKey | "";
  created_at: string;
  updated_at: string;
}

export type SourceImportItemWithCandidate = SourceImportItem & {
  candidate: CandidateWithTarget | null;
};

export type SourceImportBatchDetail = SourceImportBatch & {
  items: SourceImportItemWithCandidate[];
};

export interface SourceImportsDashboard {
  batches: SourceImportBatchDetail[];
}

export interface SourceImportInputRow {
  url: string;
  content: string;
  authorName?: string;
  authorProfileUrl?: string;
  postedAt?: string | null;
  platformResourceUrn?: string;
  sourceKeyword?: string;
  notes?: string;
}

export interface CreateSourceImportBatchInput {
  campaignId: number;
  sourceText: string;
}

export interface PreparedSourceImportRow {
  rowNumber: number;
  inputJson: string;
  value: SourceImportInputRow | null;
  validationError: string;
}

export interface PreparedSourceImportBatchInput {
  campaignId: number;
  connectorKey: SourceConnectorKey;
  rows: PreparedSourceImportRow[];
}

export interface SourceImportBatchResult {
  batchId: number;
  status: SourceImportBatchStatus;
  totalCount: number;
  acceptedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  errorMessage: string;
}
