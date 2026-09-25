import { invokeCommand } from "@/lib/tauri";
import {
  parseSourceImportText,
  sourceImportBatchResultSchema,
} from "@/features/source-imports/schemas";
import { sourceImportDashboardSchema } from "@/features/source-imports/record-schemas";
import type {
  CreateSourceImportBatchInput,
  SourceImportBatchResult,
  SourceImportsDashboard,
} from "@/features/source-imports/types";

/**
 * Imports a pasted JSON batch. Parsing and row validation happen here; the
 * native `linkgo_source_import_write_batch` command then enforces the
 * candidate intake policy (WHATWG URL + NFKC topic matching), dedupes, and
 * settles each row with its item outcome in one pinned transaction.
 */
export async function createSourceImportBatch(
  input: CreateSourceImportBatchInput,
): Promise<SourceImportBatchResult> {
  const prepared = parseSourceImportText(input.campaignId, input.sourceText);
  return sourceImportBatchResultSchema.parse(
    await invokeCommand("linkgo_source_import_write_batch", {
      input: prepared,
    }),
  );
}

export async function listSourceImportBatches(
  campaignId: number,
): Promise<SourceImportsDashboard> {
  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    throw new Error("Campaign is required");
  }

  await invokeCommand("linkgo_source_import_recover_interrupted", {
    input: { campaignId },
  });
  // Native read: 10 newest batches with their items from one snapshot.
  const batches = sourceImportDashboardSchema.parse(
    await invokeCommand("linkgo_source_import_dashboard", {
      input: { campaignId },
    }),
  );
  return {
    batches: batches.map((batch) => ({
      ...batch,
      items: batch.items.map((item) => ({ ...item, candidate: null })),
    })),
  };
}
