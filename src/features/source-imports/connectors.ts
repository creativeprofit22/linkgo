import { z } from "zod";

export const SOURCE_CONNECTOR_KEYS = ["local_json"] as const;

export const sourceConnectorKeySchema = z.enum(SOURCE_CONNECTOR_KEYS);

export type SourceConnectorKey = z.infer<typeof sourceConnectorKeySchema>;
export type SourceConnectorMode = "local" | "remote";

export interface SourceConnectorDefinition {
  key: SourceConnectorKey;
  label: string;
  mode: SourceConnectorMode;
  available: boolean;
  mayFetchExternally: boolean;
}

export const SOURCE_CONNECTORS: Readonly<
  Record<SourceConnectorKey, SourceConnectorDefinition>
> = {
  local_json: {
    key: "local_json",
    label: "Local operator-supplied JSON",
    mode: "local",
    available: true,
    mayFetchExternally: false,
  },
};

export const normalizedSourceConnectorBatchInputSchema = z.strictObject({
  campaignId: z.number().int().positive(),
  connectorKey: sourceConnectorKeySchema,
  rows: z.array(z.unknown()).min(1, "Include at least one source post"),
});

export type NormalizedSourceConnectorBatchInput = z.infer<
  typeof normalizedSourceConnectorBatchInputSchema
>;

export function getSourceConnector(
  connectorKey: SourceConnectorKey,
): SourceConnectorDefinition {
  return SOURCE_CONNECTORS[connectorKey];
}
