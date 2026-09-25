import { z } from "zod";
import { AGENT_PLAYBOOK_KEYS } from "@/agent/playbooks";

export const playbookKeySchema = z.enum(AGENT_PLAYBOOK_KEYS);

export const agentPlaybookOverrideSchema = z.object({
  playbook_key: playbookKeySchema,
  enabled: z.number().int().min(0).max(1),
  custom_instructions: z.string().max(2000),
  updated_at: z.string(),
});

export const agentPlaybookOverrideListSchema = z
  .array(agentPlaybookOverrideSchema)
  .max(AGENT_PLAYBOOK_KEYS.length);

export const updatePlaybookOverrideSchema = z.object({
  playbookKey: playbookKeySchema,
  enabled: z.boolean(),
  customInstructions: z.string().trim().max(2000).default(""),
});
