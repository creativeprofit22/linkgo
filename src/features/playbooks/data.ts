import {
  getAgentPlaybook,
  listAgentPlaybookDefinitions,
  type AgentPlaybookKey,
} from "@/agent/playbooks";
import { getDb } from "@/lib/db";
import {
  agentPlaybookOverrideSchema,
  playbookKeySchema,
  updatePlaybookOverrideSchema,
} from "@/features/playbooks/schemas";
import type {
  AgentPlaybookOverride,
  AgentPlaybookView,
  RuntimePlaybookPrompt,
  UpdatePlaybookOverrideInput,
} from "@/features/playbooks/types";

function mapOverrideByKey(
  rows: AgentPlaybookOverride[],
): Map<AgentPlaybookKey, AgentPlaybookOverride> {
  return new Map(rows.map((row) => [row.playbook_key, row]));
}

async function listOverrideRows(): Promise<AgentPlaybookOverride[]> {
  const db = await getDb();
  const rows = await db.select<AgentPlaybookOverride[]>(
    `SELECT
      playbook_key,
      enabled,
      custom_instructions,
      updated_at
    FROM agent_playbook_overrides
    ORDER BY playbook_key ASC`,
  );
  return rows.map((row) => agentPlaybookOverrideSchema.parse(row));
}

export async function listPlaybooks(): Promise<AgentPlaybookView[]> {
  const overrideByKey = mapOverrideByKey(await listOverrideRows());
  return listAgentPlaybookDefinitions().map((definition) => {
    const override = overrideByKey.get(definition.key);
    const enabled = override
      ? override.enabled === 1
      : definition.runtimeEnabled;
    return {
      ...definition,
      enabled,
      customInstructions: override?.custom_instructions ?? "",
      updatedAt: override?.updated_at ?? null,
    };
  });
}

export async function updatePlaybookOverride(
  input: UpdatePlaybookOverrideInput,
): Promise<void> {
  const parsed = updatePlaybookOverrideSchema.parse(input);
  const db = await getDb();
  await db.execute(
    `INSERT INTO agent_playbook_overrides (
      playbook_key,
      enabled,
      custom_instructions,
      updated_at
    ) VALUES ($1, $2, $3, datetime('now'))
    ON CONFLICT(playbook_key) DO UPDATE SET
      enabled = excluded.enabled,
      custom_instructions = excluded.custom_instructions,
      updated_at = datetime('now')`,
    [
      parsed.playbookKey,
      parsed.enabled ? 1 : 0,
      parsed.customInstructions.trim(),
    ],
  );
}

export async function getPlaybookPromptForRuntime(
  playbookKey: string | null | undefined,
): Promise<RuntimePlaybookPrompt | null> {
  const parsedKey = playbookKeySchema.safeParse(playbookKey);
  if (!parsedKey.success) return null;

  const definition = getAgentPlaybook(parsedKey.data);
  if (
    !definition ||
    !definition.runtimeEnabled ||
    definition.operatorGuidanceOnly
  ) {
    return null;
  }

  const rows = await listOverrideRows();
  const override = mapOverrideByKey(rows).get(parsedKey.data);
  if (override && override.enabled !== 1) return null;

  return {
    definition,
    customInstructions: override?.custom_instructions ?? "",
  };
}
