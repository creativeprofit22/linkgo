import {
  getAgentPlaybook,
  listAgentPlaybookDefinitions,
  type AgentPlaybookKey,
} from "@/agent/playbooks";
import { invokeCommand } from "@/lib/tauri";
import {
  agentPlaybookOverrideListSchema,
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

/** Override persistence is owned natively (`src-tauri/src/playbooks.rs`). */
async function listOverrideRows(): Promise<AgentPlaybookOverride[]> {
  const rows = await invokeCommand("linkgo_playbook_override_list");
  return agentPlaybookOverrideListSchema.parse(rows);
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
  await invokeCommand<null>("linkgo_playbook_override_upsert", {
    input: {
      playbookKey: parsed.playbookKey,
      enabled: parsed.enabled,
      customInstructions: parsed.customInstructions,
    },
  });
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
