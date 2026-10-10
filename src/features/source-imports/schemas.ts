import { z } from "zod";

import { normalizedSourceConnectorBatchInputSchema } from "@/features/source-imports/connectors";
import { sourceImportBatchStatusSchema } from "@/features/source-imports/record-schemas";
import type {
  PreparedSourceImportBatchInput,
  SourceImportFormRow,
} from "@/features/source-imports/types";

export const MAX_SOURCE_IMPORT_ROWS = 50;
export const MAX_SOURCE_IMPORT_INPUT_JSON_LENGTH = 20_000;
export const MAX_SOURCE_IMPORT_REASON_LENGTH = 2_000;

const SOURCE_IMPORT_FIELD_LIMITS = {
  url: 1000,
  content: 3000,
  authorName: 160,
  authorProfileUrl: 1000,
  postedAt: 80,
  platformResourceUrn: 500,
  sourceKeyword: 80,
  notes: 1000,
} as const;

const SOURCE_IMPORT_FIELDS = Object.keys(
  SOURCE_IMPORT_FIELD_LIMITS,
) as (keyof typeof SOURCE_IMPORT_FIELD_LIMITS)[];

const SOURCE_IMPORT_FIELD_LABELS: Record<
  keyof typeof SOURCE_IMPORT_FIELD_LIMITS,
  string
> = {
  url: "Link",
  content: "Post text",
  authorName: "Author name",
  authorProfileUrl: "Author profile URL",
  postedAt: "Post date",
  platformResourceUrn: "LinkedIn post ID",
  sourceKeyword: "Source keyword",
  notes: "Notes",
};

export const sourceImportRowSchema = z.strictObject({
  url: z.string().trim().min(1, "Add the LinkedIn post link").max(1000),
  content: z.string().trim().min(1, "Add the post text").max(3000),
  authorName: z.string().trim().max(160).optional().default(""),
  authorProfileUrl: z.string().trim().max(1000).optional().default(""),
  postedAt: z.string().trim().max(80).nullable().optional().default(null),
  platformResourceUrn: z.string().trim().max(500).optional().default(""),
  sourceKeyword: z.string().trim().max(80).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
});

export const createSourceImportBatchSchema =
  normalizedSourceConnectorBatchInputSchema.extend({
    rows: z
      .array(z.unknown())
      .min(1, "Add at least one post")
      .max(
        MAX_SOURCE_IMPORT_ROWS,
        `Import up to ${MAX_SOURCE_IMPORT_ROWS} posts at a time`,
      ),
  });

function formatRowValidationError(
  issues: readonly { path: PropertyKey[]; message: string }[],
): string {
  const formattedReason = issues
    .slice(0, 5)
    .map((issue) => {
      const field = issue.path[0];
      const label =
        typeof field === "string" && field in SOURCE_IMPORT_FIELD_LABELS
          ? SOURCE_IMPORT_FIELD_LABELS[
              field as keyof typeof SOURCE_IMPORT_FIELD_LABELS
            ]
          : "Post";
      return `${label}: ${issue.message}`;
    })
    .join("; ");

  return formattedReason.slice(0, MAX_SOURCE_IMPORT_REASON_LENGTH);
}

function sanitizeAuditValue(value: unknown, maxLength: number): unknown {
  if (typeof value === "string") return value.slice(0, maxLength + 1);
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return "[unsupported value]";
}

function getAuditValueType(
  value: unknown,
): "array" | "null" | "object" | "scalar" {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" ? "object" : "scalar";
}

function createTruncatedAuditJson(
  serializedJson: string,
  rawRow: unknown,
): string {
  const previewCharacters: string[] = [];
  for (const character of serializedJson) {
    if (previewCharacters.length === MAX_SOURCE_IMPORT_INPUT_JSON_LENGTH) {
      break;
    }
    previewCharacters.push(character);
  }

  const createAuditEnvelope = (previewLength: number) =>
    JSON.stringify({
      truncated: true,
      originalType: getAuditValueType(rawRow),
      originalJsonLength: serializedJson.length,
      preview: previewCharacters.slice(0, previewLength).join(""),
    });

  let minimumPreviewLength = 0;
  let maximumPreviewLength = previewCharacters.length;
  while (minimumPreviewLength < maximumPreviewLength) {
    const previewLength = Math.ceil(
      (minimumPreviewLength + maximumPreviewLength) / 2,
    );
    if (
      createAuditEnvelope(previewLength).length <=
      MAX_SOURCE_IMPORT_INPUT_JSON_LENGTH
    ) {
      minimumPreviewLength = previewLength;
    } else {
      maximumPreviewLength = previewLength - 1;
    }
  }

  return createAuditEnvelope(minimumPreviewLength);
}

function createBoundedInputJson(rawRow: unknown): string {
  let auditValue = rawRow;
  if (rawRow !== null && typeof rawRow === "object" && !Array.isArray(rawRow)) {
    const record = rawRow as Record<string, unknown>;
    const boundedRow: Record<string, unknown> = {};
    for (const field of SOURCE_IMPORT_FIELDS) {
      if (!(field in record)) continue;
      boundedRow[field] = sanitizeAuditValue(
        record[field],
        SOURCE_IMPORT_FIELD_LIMITS[field],
      );
    }
    auditValue = boundedRow;
  }

  const serializedJson = JSON.stringify(auditValue) ?? '"[unsupported value]"';
  return serializedJson.length <= MAX_SOURCE_IMPORT_INPUT_JSON_LENGTH
    ? serializedJson
    : createTruncatedAuditJson(serializedJson, rawRow);
}

/**
 * Turns the guided form rows into contract rows. Empty optional fields are
 * left out; the post date (a local `datetime-local` value) becomes an absolute
 * ISO timestamp so the native age filter can read it. Unparseable dates pass
 * through unchanged and the native filter rejects that row with a reason.
 */
export function sourceImportFormRowsToRawRows(
  rows: readonly SourceImportFormRow[],
): Record<string, string | null>[] {
  return rows.map((row) => {
    const rawRow: Record<string, string | null> = {
      url: row.url,
      content: row.content,
      postedAt: toAbsoluteTimestamp(row.postedAt),
    };
    for (const field of [
      "authorName",
      "authorProfileUrl",
      "sourceKeyword",
    ] as const) {
      if (row[field].trim().length > 0) rawRow[field] = row[field];
    }
    return rawRow;
  });
}

function toAbsoluteTimestamp(localValue: string): string | null {
  const trimmed = localValue.trim();
  if (trimmed.length === 0) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
}

/**
 * Validates a batch against the normalized import contract. Batch-level
 * problems (no rows, too many rows) throw; each row is validated on its own so
 * one bad row is recorded with a reason instead of blocking its neighbours.
 */
export function prepareSourceImportBatch(
  campaignId: number,
  rawRows: unknown,
): PreparedSourceImportBatchInput {
  const batchResult = createSourceImportBatchSchema.safeParse({
    campaignId,
    connectorKey: "local_json",
    rows: rawRows,
  });
  if (!batchResult.success) {
    throw new Error(
      batchResult.error.issues[0]?.message ?? "Source import is invalid",
    );
  }

  return {
    campaignId: batchResult.data.campaignId,
    connectorKey: batchResult.data.connectorKey,
    rows: batchResult.data.rows.map((rawRow, index) => {
      const rowResult = sourceImportRowSchema.safeParse(rawRow);
      return {
        rowNumber: index + 1,
        inputJson: createBoundedInputJson(rawRow),
        value: rowResult.success ? rowResult.data : null,
        validationError: rowResult.success
          ? ""
          : formatRowValidationError(rowResult.error.issues),
      };
    }),
  };
}

/** Native result of `linkgo_source_import_write_batch`. */
export const sourceImportBatchResultSchema = z.strictObject({
  batchId: z.number().int().positive(),
  status: sourceImportBatchStatusSchema,
  totalCount: z.number().int().min(1).max(MAX_SOURCE_IMPORT_ROWS),
  acceptedCount: z.number().int().min(0),
  duplicateCount: z.number().int().min(0),
  rejectedCount: z.number().int().min(0),
  errorMessage: z.string(),
});
