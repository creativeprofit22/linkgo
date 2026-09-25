import { z } from "zod";

import { normalizedSourceConnectorBatchInputSchema } from "@/features/source-imports/connectors";
import { sourceImportBatchStatusSchema } from "@/features/source-imports/record-schemas";
import type { PreparedSourceImportBatchInput } from "@/features/source-imports/types";

export const MAX_SOURCE_IMPORT_ROWS = 50;
export const MAX_SOURCE_IMPORT_TEXT_LENGTH = 400_000;
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
  url: "URL",
  content: "Post text",
  authorName: "Author name",
  authorProfileUrl: "Author profile URL",
  postedAt: "Posted time",
  platformResourceUrn: "Platform resource URN",
  sourceKeyword: "Source keyword",
  notes: "Notes",
};

export const sourceImportRowSchema = z.strictObject({
  url: z.string().trim().min(1, "LinkedIn post URL is required").max(1000),
  content: z.string().trim().min(1, "Post text is required").max(3000),
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
      .min(1, "Include at least one source post")
      .max(
        MAX_SOURCE_IMPORT_ROWS,
        `Import up to ${MAX_SOURCE_IMPORT_ROWS} rows`,
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
          : "Row";
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

export function parseSourceImportText(
  campaignId: number,
  sourceText: string,
): PreparedSourceImportBatchInput {
  if (sourceText.length > MAX_SOURCE_IMPORT_TEXT_LENGTH) {
    throw new Error(
      `Source JSON must be ${MAX_SOURCE_IMPORT_TEXT_LENGTH.toLocaleString("en-US")} characters or less`,
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(sourceText);
  } catch {
    throw new Error("Source text must be valid JSON");
  }

  const batchResult = createSourceImportBatchSchema.safeParse({
    campaignId,
    connectorKey: "local_json",
    rows: parsedJson,
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
