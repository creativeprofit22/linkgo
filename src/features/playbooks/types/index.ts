import type {
  AgentPlaybookDefinition,
  AgentPlaybookKey,
} from "@/agent/playbooks";

export type {
  AgentPlaybookDefinition,
  AgentPlaybookKey,
} from "@/agent/playbooks";
export { AGENT_PLAYBOOK_KEYS } from "@/agent/playbooks";

export interface AgentPlaybookOverride {
  playbook_key: AgentPlaybookKey;
  enabled: number;
  custom_instructions: string;
  updated_at: string;
}

export type AgentPlaybookView = AgentPlaybookDefinition & {
  enabled: boolean;
  customInstructions: string;
  updatedAt: string | null;
};

export interface UpdatePlaybookOverrideInput {
  playbookKey: AgentPlaybookKey;
  enabled: boolean;
  customInstructions: string;
}

export interface RuntimePlaybookPrompt {
  definition: AgentPlaybookDefinition;
  customInstructions: string;
}
