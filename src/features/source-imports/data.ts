import {
  createCandidateInTransaction,
  isCandidatePolicyRejectionError,
  isDuplicateCandidateError,
} from "@/features/candidate-queue/data";
import type { CandidatePolicyRuleKey } from "@/features/candidate-policy/types";
import type { CampaignStatus } from "@/features/campaigns/types";
import { parseSourceImportText } from "@/features/source-imports/schemas";
import type {
  CreateSourceImportBatchInput,
  PreparedSourceImportBatchInput,
  SourceImportBatch,
  SourceImportBatchDetail,
  SourceImportBatchResult,
  SourceImportItem,
  SourceImportsDashboard,
} from "@/features/source-imports/types";
import { getDb, type LinkgoDatabase } from "@/lib/db";

const RECENT_BATCH_LIMIT = 10;
const DUPLICATE_REASON = "Duplicate URL or post text for this campaign.";
const STORAGE_ERROR_REASON =
  "Candidate could not be stored. Review the row and retry the import.";
const SKIPPED_AFTER_ERROR_REASON =
  "Not processed because the import stopped after a local storage error.";
const BATCH_STORAGE_ERROR = "Import stopped after a local storage error.";
const INTERRUPTED_ITEM_REASON =
  "Not processed because the previous app session ended before the import finished.";
const INTERRUPTED_BATCH_ERROR =
  "Import stopped because the previous app session ended before processing finished.";

interface CampaignRow {
  id: number;
  status: CampaignStatus;
}

interface SourceImportCounts {
  accepted: number;
  duplicate: number;
  rejected: number;
}

const activeCampaignImports = new Map<number, number>();

function startCampaignImport(campaignId: number): void {
  activeCampaignImports.set(
    campaignId,
    (activeCampaignImports.get(campaignId) ?? 0) + 1,
  );
}

function finishCampaignImport(campaignId: number): void {
  const remaining = (activeCampaignImports.get(campaignId) ?? 1) - 1;
  if (remaining <= 0) {
    activeCampaignImports.delete(campaignId);
    return;
  }
  activeCampaignImports.set(campaignId, remaining);
}

async function rollbackTransaction(db: LinkgoDatabase): Promise<void> {
  try {
    await db.execute("ROLLBACK");
  } catch {
    // Preserve the original transaction failure.
  }
}

async function assertCampaignCanImport(
  db: LinkgoDatabase,
  campaignId: number,
): Promise<void> {
  const rows = await db.select<CampaignRow[]>(
    `SELECT id, status FROM campaigns WHERE id = $1 LIMIT 1`,
    [campaignId],
  );
  const campaign = rows[0];
  if (campaign === undefined) throw new Error("Campaign was not found");
  if (campaign.status === "archived") throw new Error("Campaign is archived");
}

async function createBatchRows(
  db: LinkgoDatabase,
  prepared: PreparedSourceImportBatchInput,
): Promise<number> {
  await db.execute("BEGIN TRANSACTION");
  try {
    const batchResult = await db.execute(
      `INSERT INTO source_import_batches (
        campaign_id,
        source_type,
        status,
        total_count,
        accepted_count,
        duplicate_count,
        rejected_count,
        error_message,
        updated_at
      ) VALUES ($1, $2, 'processing', $3, 0, 0, 0, '', datetime('now'))`,
      [prepared.campaignId, prepared.connectorKey, prepared.rows.length],
    );
    const batchId = batchResult.lastInsertId;

    for (const row of prepared.rows) {
      await db.execute(
        `INSERT INTO source_import_items (
          source_import_batch_id,
          row_number,
          status,
          input_json,
          candidate_post_id,
          reason,
          policy_rule_key,
          updated_at
        ) VALUES ($1, $2, 'pending', $3, NULL, '', '', datetime('now'))`,
        [batchId, row.rowNumber, row.inputJson],
      );
    }

    await db.execute("COMMIT");
    return batchId;
  } catch {
    await rollbackTransaction(db);
    throw new Error("Source import could not be started");
  }
}

async function updateItemOutcome(
  db: LinkgoDatabase,
  batchId: number,
  rowNumber: number,
  status: "accepted" | "duplicate" | "rejected",
  candidatePostId: number | null,
  reason: string,
  policyRuleKey: CandidatePolicyRuleKey | "" = "",
): Promise<void> {
  const result = await db.execute(
    `UPDATE source_import_items
      SET status = $1,
        candidate_post_id = $2,
        reason = $3,
        policy_rule_key = $4,
        updated_at = datetime('now')
      WHERE source_import_batch_id = $5
        AND row_number = $6`,
    [status, candidatePostId, reason, policyRuleKey, batchId, rowNumber],
  );
  if (result.rowsAffected !== 1) {
    throw new Error("Source import item outcome was not stored");
  }
}

async function updateBatchOutcome(
  db: LinkgoDatabase,
  result: SourceImportBatchResult,
): Promise<void> {
  const updateResult = await db.execute(
    `UPDATE source_import_batches
      SET status = $1,
        accepted_count = $2,
        duplicate_count = $3,
        rejected_count = $4,
        error_message = $5,
        updated_at = datetime('now')
      WHERE id = $6`,
    [
      result.status,
      result.acceptedCount,
      result.duplicateCount,
      result.rejectedCount,
      result.errorMessage,
      result.batchId,
    ],
  );
  if (updateResult.rowsAffected !== 1) {
    throw new Error("Source import batch outcome was not stored");
  }
}

function countItemOutcomes(items: SourceImportItem[]): SourceImportCounts {
  return items.reduce<SourceImportCounts>(
    (counts, item) => {
      if (item.status === "accepted") counts.accepted += 1;
      if (item.status === "duplicate") counts.duplicate += 1;
      if (item.status === "rejected") counts.rejected += 1;
      return counts;
    },
    { accepted: 0, duplicate: 0, rejected: 0 },
  );
}

async function terminalizeFailedBatch(
  db: LinkgoDatabase,
  batchId: number,
  totalCount: number,
  failedRowNumber: number | null,
  failedReason: string,
  remainingReason: string,
  batchError: string,
): Promise<SourceImportBatchResult> {
  await db.execute("BEGIN TRANSACTION");
  try {
    const items = await db.select<SourceImportItem[]>(
      `SELECT * FROM source_import_items
        WHERE source_import_batch_id = $1
        ORDER BY row_number ASC`,
      [batchId],
    );

    for (const item of items) {
      if (item.status !== "pending") continue;
      const reason =
        failedRowNumber === null || item.row_number === failedRowNumber
          ? failedReason
          : remainingReason;
      await updateItemOutcome(
        db,
        batchId,
        item.row_number,
        "rejected",
        null,
        reason,
      );
      item.status = "rejected";
      item.candidate_post_id = null;
      item.reason = reason;
      item.policy_rule_key = "";
    }

    const counts = countItemOutcomes(items);
    const result: SourceImportBatchResult = {
      batchId,
      status: "failed",
      totalCount,
      acceptedCount: counts.accepted,
      duplicateCount: counts.duplicate,
      rejectedCount: counts.rejected,
      errorMessage: batchError,
    };
    await updateBatchOutcome(db, result);
    await db.execute("COMMIT");
    return result;
  } catch {
    await rollbackTransaction(db);
    throw new Error(
      "Source import failed and its outcome could not be recorded",
    );
  }
}

async function selectRecentBatches(
  db: LinkgoDatabase,
  campaignId: number,
): Promise<SourceImportBatch[]> {
  return db.select<SourceImportBatch[]>(
    `SELECT * FROM source_import_batches
      WHERE campaign_id = $1
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ${RECENT_BATCH_LIMIT}`,
    [campaignId],
  );
}

async function recoverInterruptedBatches(
  db: LinkgoDatabase,
  campaignId: number,
): Promise<void> {
  if (activeCampaignImports.has(campaignId)) return;

  const interruptedBatches = await db.select<SourceImportBatch[]>(
    `SELECT * FROM source_import_batches
      WHERE campaign_id = $1
        AND status = 'processing'
      ORDER BY id ASC`,
    [campaignId],
  );
  if (activeCampaignImports.has(campaignId)) return;

  for (const batch of interruptedBatches) {
    await terminalizeFailedBatch(
      db,
      batch.id,
      batch.total_count,
      null,
      INTERRUPTED_ITEM_REASON,
      INTERRUPTED_ITEM_REASON,
      INTERRUPTED_BATCH_ERROR,
    );
  }
}

async function writePolicyEnforcedSourceBatch(
  db: LinkgoDatabase,
  prepared: PreparedSourceImportBatchInput,
): Promise<SourceImportBatchResult> {
  await assertCampaignCanImport(db, prepared.campaignId);

  startCampaignImport(prepared.campaignId);
  let batchId: number | null = null;
  let currentRowNumber: number | null = null;
  try {
    batchId = await createBatchRows(db, prepared);
    const counts: SourceImportCounts = {
      accepted: 0,
      duplicate: 0,
      rejected: 0,
    };

    for (const row of prepared.rows) {
      currentRowNumber = row.rowNumber;
      if (row.value === null) {
        await updateItemOutcome(
          db,
          batchId,
          row.rowNumber,
          "rejected",
          null,
          row.validationError,
        );
        counts.rejected += 1;
        continue;
      }

      await db.execute("BEGIN TRANSACTION");
      try {
        const candidateId = await createCandidateInTransaction(
          db,
          {
            campaignId: prepared.campaignId,
            ...row.value,
          },
          { enforcePolicy: true },
        );
        await updateItemOutcome(
          db,
          batchId,
          row.rowNumber,
          "accepted",
          candidateId,
          `Candidate ${candidateId} created.`,
        );
        await db.execute("COMMIT");
        counts.accepted += 1;
      } catch (error) {
        await rollbackTransaction(db);
        if (isCandidatePolicyRejectionError(error)) {
          const reason = error.findings
            .map((finding) => finding.message)
            .join(" ")
            .slice(0, 2000);
          await updateItemOutcome(
            db,
            batchId,
            row.rowNumber,
            "rejected",
            null,
            reason,
            error.primaryRuleKey,
          );
          counts.rejected += 1;
          continue;
        }
        if (!isDuplicateCandidateError(error)) throw error;

        await updateItemOutcome(
          db,
          batchId,
          row.rowNumber,
          "duplicate",
          null,
          DUPLICATE_REASON,
        );
        counts.duplicate += 1;
      }
    }

    currentRowNumber = null;
    const result: SourceImportBatchResult = {
      batchId,
      status:
        counts.accepted === prepared.rows.length
          ? "completed"
          : "completed_with_errors",
      totalCount: prepared.rows.length,
      acceptedCount: counts.accepted,
      duplicateCount: counts.duplicate,
      rejectedCount: counts.rejected,
      errorMessage: "",
    };
    await updateBatchOutcome(db, result);
    return result;
  } catch {
    if (batchId === null) throw new Error("Source import could not be started");
    const failedResult = await terminalizeFailedBatch(
      db,
      batchId,
      prepared.rows.length,
      currentRowNumber,
      STORAGE_ERROR_REASON,
      SKIPPED_AFTER_ERROR_REASON,
      BATCH_STORAGE_ERROR,
    );
    return failedResult;
  } finally {
    finishCampaignImport(prepared.campaignId);
  }
}

export async function createSourceImportBatch(
  input: CreateSourceImportBatchInput,
): Promise<SourceImportBatchResult> {
  const prepared = parseSourceImportText(input.campaignId, input.sourceText);
  const db = await getDb();
  return writePolicyEnforcedSourceBatch(db, prepared);
}

export async function listSourceImportBatches(
  campaignId: number,
): Promise<SourceImportsDashboard> {
  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    throw new Error("Campaign is required");
  }

  const db = await getDb();
  await recoverInterruptedBatches(db, campaignId);
  const batches = await selectRecentBatches(db, campaignId);

  const details: SourceImportBatchDetail[] = [];
  for (const batch of batches) {
    const items = await db.select<SourceImportItem[]>(
      `SELECT * FROM source_import_items
        WHERE source_import_batch_id = $1
        ORDER BY row_number ASC`,
      [batch.id],
    );
    details.push({
      ...batch,
      items: items.map((item) => ({ ...item, candidate: null })),
    });
  }

  return { batches: details };
}
