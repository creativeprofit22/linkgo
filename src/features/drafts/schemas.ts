import { agentProviderKeySchema } from "@/agent/schemas";
import { AGENT_PLAYBOOK_KEYS } from "@/agent/playbooks";
import {
  DRAFT_AI_AUDIT_RULE_KEYS,
  DRAFT_CONTENT_INTENTS,
} from "@/features/drafts/types";
import { z } from "zod";

export const draftContentIntentSchema = z.enum(DRAFT_CONTENT_INTENTS);

export const draftStatusSchema = z.enum([
  "drafting",
  "needs_revision",
  "ready_for_review",
  "archived",
]);

export const draftVariantStatusSchema = z.enum([
  "draft",
  "selected",
  "rejected",
]);

export const draftAuditSeveritySchema = z.enum(["pass", "warning", "block"]);

export const draftAiAuditRuleKeySchema = z.enum(DRAFT_AI_AUDIT_RULE_KEYS);

export const draftAiAuditRunStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const draftAiAuditRunRowSchema = z
  .object({
    id: z.number().int().positive(),
    draft_variant_id: z.number().int().positive(),
    content_revision: z.number().int().positive(),
    agent_run_id: z.number().int().positive().nullable(),
    workflow_step_execution_id: z.number().int().positive().nullable(),
    provider_key: agentProviderKeySchema,
    model_name: z.string().max(120),
    status: draftAiAuditRunStatusSchema,
    summary: z.string().max(1000),
    error_message: z.string().max(1000),
    started_at: z.string().nullable(),
    completed_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();

export const draftAiAuditFindingRowSchema = z
  .object({
    id: z.number().int().positive(),
    audit_run_id: z.number().int().positive(),
    rule_key: draftAiAuditRuleKeySchema,
    severity: draftAuditSeveritySchema,
    message: z.string().trim().min(1).max(1000),
    created_at: z.string(),
  })
  .strict();

export const draftAiAuditFindingInputSchema = z
  .object({
    ruleKey: draftAiAuditRuleKeySchema,
    severity: draftAuditSeveritySchema,
    message: z.string().trim().min(1).max(500),
  })
  .strict();

function requireEveryAuditRule(
  ruleKeys: string[],
  context: z.RefinementCtx,
): void {
  if (new Set(ruleKeys).size !== DRAFT_AI_AUDIT_RULE_KEYS.length) {
    context.addIssue({
      code: "custom",
      message:
        "findings must contain exactly one entry for each required audit category",
    });
  }
}

export const draftAiAuditFindingsSchema = z
  .array(draftAiAuditFindingInputSchema)
  .length(DRAFT_AI_AUDIT_RULE_KEYS.length)
  .superRefine((findings, context) => {
    requireEveryAuditRule(
      findings.map((finding) => finding.ruleKey),
      context,
    );
  });

export const draftAiAuditFindingRowsSchema = z
  .array(draftAiAuditFindingRowSchema)
  .length(DRAFT_AI_AUDIT_RULE_KEYS.length)
  .superRefine((findings, context) => {
    requireEveryAuditRule(
      findings.map((finding) => finding.rule_key),
      context,
    );
  });

export const runDraftAiAuditSchema = z
  .object({
    draftVariantId: z.number().int().positive(),
    providerKey: agentProviderKeySchema.default("dry_run"),
    modelName: z.string().trim().max(120).default(""),
  })
  .strict();

export const reconcileDraftAiAuditLifecycleSchema = z
  .object({
    maxAuditRuns: z.number().int().min(1).max(100).default(25),
    maxOrphanAgentRuns: z.number().int().min(1).max(100).default(25),
  })
  .strict();

export const startDraftAiAuditRunSchema = z
  .object({
    draftVariantId: z.number().int().positive(),
    contentRevision: z.number().int().positive(),
    agentRunId: z.number().int().positive().nullable().default(null),
    providerKey: agentProviderKeySchema.default("dry_run"),
    modelName: z.string().trim().max(120).default(""),
  })
  .strict();

export const completeDraftAiAuditRunSchema = z
  .object({
    auditRunId: z.number().int().positive(),
    draftVariantId: z.number().int().positive(),
    contentRevision: z.number().int().positive(),
    summary: z.string().trim().max(1000).default(""),
    findings: draftAiAuditFindingsSchema,
  })
  .strict();

export const completePlannerDraftAuditSchema = z
  .object({
    agentRunId: z.number().int().positive(),
    summary: z.string().trim().min(1).max(1000),
    findings: draftAiAuditFindingsSchema,
  })
  .strict();

export const failDraftAiAuditRunSchema = z
  .object({
    auditRunId: z.number().int().positive(),
    draftVariantId: z.number().int().positive(),
    contentRevision: z.number().int().positive(),
    errorMessage: z.string().trim().min(1).max(1000),
  })
  .strict();

export const failPlannerDraftAuditSchema = z
  .object({
    agentRunId: z.number().int().positive(),
    errorSummary: z.string().trim().min(1).max(1000),
  })
  .strict();

export const reconcileStalePlannerDraftAuditsSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(25),
  })
  .strict();

export const draftVariantInputSchema = z.object({
  hook: z.string().trim().max(500).default(""),
  body: z.string().trim().max(3000).default(""),
  cta: z.string().trim().max(500).default(""),
  hashtags: z.string().trim().max(300).default(""),
});

export const createDraftSchema = z.object({
  candidateId: z.number().int().positive(),
  angle: z.string().trim().max(240).default(""),
  notes: z.string().trim().max(1000).default(""),
  contentIntent: draftContentIntentSchema.default("idea"),
  variants: z.array(draftVariantInputSchema).min(1).max(5),
});

export const updateDraftSchema = z.object({
  id: z.number().int().positive(),
  angle: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(1000).optional(),
  status: draftStatusSchema.optional(),
});

export const updateDraftVariantSchema = z.object({
  id: z.number().int().positive(),
  hook: z.string().trim().max(500).optional(),
  body: z.string().trim().max(3000).optional(),
  cta: z.string().trim().max(500).optional(),
  hashtags: z.string().trim().max(300).optional(),
});

export const setDraftVariantStatusSchema = z.object({
  id: z.number().int().positive(),
  status: draftVariantStatusSchema,
});

const playbookKeySchema = z.union([z.enum(AGENT_PLAYBOOK_KEYS), z.literal("")]);

export const generatedDraftVariantSchema = z.object({
  hook: z.string().trim().min(1).max(280),
  body: z.string().trim().min(1).max(2500),
  cta: z.string().trim().max(240).default(""),
  hashtags: z.array(z.string().trim().min(1).max(40)).max(5).default([]),
});

export const draftGenerationRequestStatusSchema = z.enum([
  "pending",
  "generated",
  "saved",
  "failed",
  "dismissed",
]);

export const generateDraftVariantsSchema = z.object({
  campaignId: z.number().int().positive(),
  candidateId: z.number().int().positive(),
  providerKey: agentProviderKeySchema.default("dry_run"),
  modelName: z.string().trim().max(120).default(""),
  playbookKey: playbookKeySchema.default("linkedin_writer"),
  variantCount: z.number().int().min(3).max(5).default(3),
  contentIntent: draftContentIntentSchema.default("idea"),
  workflowRunId: z.number().int().positive().nullable().default(null),
  angle: z.string().trim().max(240).default(""),
  voiceNotes: z.string().trim().max(1000).default(""),
});

export const saveGeneratedDraftSchema = z.object({
  id: z.number().int().positive(),
});

export const dismissDraftGenerationRequestSchema = z.object({
  id: z.number().int().positive(),
});
