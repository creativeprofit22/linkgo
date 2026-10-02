import { agentProviderKeySchema } from "@/agent/schemas";
import { AGENT_PLAYBOOK_KEYS } from "@/agent/playbooks";
import {
  DRAFT_AI_AUDIT_RULE_KEYS,
  DRAFT_CONTENT_INTENTS,
  DRAFT_QUALITY_ATTEMPT_STATUSES,
  DRAFT_QUALITY_CATEGORY_KEYS,
  DRAFT_QUALITY_RUN_STATUSES,
} from "@/features/drafts/types";
import type { DraftsRouteParams } from "@/features/drafts/types";
import {
  defineRoute,
  optionalRouteFlag,
  optionalRouteId,
  routeId,
} from "@/lib/navigation/route-contract";
import { z } from "zod";

/**
 * Link params for Drafts (`#/drafts?campaignId=1&candidateId=2`). An idea
 * filter needs its campaign, so `candidateId` alone is an invalid link.
 * `write=1` opens Write with AI for that idea and needs both ids. The union
 * mirrors `DraftsRouteParams`.
 */
export const draftsRouteSearchSchema = z.union([
  z.object({
    campaignId: optionalRouteId(),
    candidateId: z.undefined().optional(),
    write: z.undefined().optional(),
  }),
  z.object({
    campaignId: routeId(),
    candidateId: routeId(),
    write: optionalRouteFlag(),
  }),
]);

/** Address of the Drafts screen. See docs/features/navigation.md. */
export const draftsRoute = defineRoute<"drafts", DraftsRouteParams>(
  "drafts",
  draftsRouteSearchSchema,
);

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

/**
 * Completion identity only: native reads the findings from the linked
 * auditor's own persisted output, so callers cannot supply them.
 */
export const completeDraftAiAuditRunSchema = z
  .object({
    auditRunId: z.number().int().positive(),
    draftVariantId: z.number().int().positive(),
    contentRevision: z.number().int().positive(),
  })
  .strict();

/** Identity only: native reads the auditor's own persisted findings. */
export const completePlannerDraftAuditSchema = z
  .object({
    agentRunId: z.number().int().positive(),
  })
  .strict();

export const failDraftAiAuditRunSchema = z
  .object({
    auditRunId: z.number().int().positive(),
    draftVariantId: z.number().int().positive(),
    contentRevision: z.number().int().positive(),
    errorMessage: z.string().trim().min(1).max(1000),
    agentRunId: z.number().int().positive().nullable().default(null),
  })
  .strict();

/** Native result of `linkgo_draft_ai_audit_start`. */
export const draftAiAuditStartResultSchema = z
  .object({
    run: draftAiAuditRunRowSchema,
    campaignId: z.number().int().positive(),
    text: z.string(),
  })
  .strict();

/** Native result of `linkgo_draft_ai_audit_reconcile`. */
export const draftAiAuditReconcileResultSchema = z
  .object({
    failedAuditRunIds: z.array(z.number().int().positive()),
    failedAgentRunIds: z.array(z.number().int().positive()),
    clearedApprovalCheckpointCount: z.number().int().min(0),
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

export const draftQualityCategoryKeySchema = z.enum(
  DRAFT_QUALITY_CATEGORY_KEYS,
);
export const draftQualityRunStatusSchema = z.enum(DRAFT_QUALITY_RUN_STATUSES);
export const draftQualityAttemptStatusSchema = z.enum(
  DRAFT_QUALITY_ATTEMPT_STATUSES,
);

export const draftQualityCategoryScoreInputSchema = z
  .object({
    categoryKey: draftQualityCategoryKeySchema,
    score: z.number().int().min(0).max(100),
    feedback: z.string().trim().min(1).max(1000),
  })
  .strict();

export const draftQualityCategoryScoresSchema = z
  .array(draftQualityCategoryScoreInputSchema)
  .length(DRAFT_QUALITY_CATEGORY_KEYS.length)
  .superRefine((scores, context) => {
    if (
      new Set(scores.map((score) => score.categoryKey)).size !==
      DRAFT_QUALITY_CATEGORY_KEYS.length
    ) {
      context.addIssue({
        code: "custom",
        message:
          "categoryScores must contain exactly one score for every quality category",
      });
    }
  });

export const draftQualityRewriteSchema = z
  .object({
    hook: z.string().trim().min(1).max(500),
    body: z.string().trim().min(1).max(3000),
    cta: z.string().trim().max(500),
    hashtags: z.string().trim().max(300),
  })
  .strict();

export const draftQualityScoreInputSchema = z
  .object({
    campaignId: z.number().int().positive(),
    draftVariantId: z.number().int().positive(),
    qualityRunId: z.number().int().positive(),
    attemptId: z.number().int().positive(),
    contentRevision: z.number().int().positive(),
    hook: z.string().max(500),
    body: z.string().max(3000),
    cta: z.string().max(500),
    hashtags: z.string().max(300),
    threshold: z.literal(70),
    rewriteAllowed: z.boolean(),
    priorCategoryFeedback: z
      .array(
        z
          .object({
            categoryKey: draftQualityCategoryKeySchema,
            feedback: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .max(DRAFT_QUALITY_CATEGORY_KEYS.length),
    categoryScores: draftQualityCategoryScoresSchema,
    rewrite: draftQualityRewriteSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const overall = Math.round(
      input.categoryScores.reduce((total, item) => total + item.score, 0) /
        DRAFT_QUALITY_CATEGORY_KEYS.length,
    );
    const requiresRewrite = overall < input.threshold && input.rewriteAllowed;
    if (requiresRewrite !== (input.rewrite !== undefined)) {
      context.addIssue({
        code: "custom",
        path: ["rewrite"],
        message: requiresRewrite
          ? "A complete rewrite is required below threshold while rewriting is allowed"
          : "A rewrite is only allowed below threshold while another rewrite is available",
      });
    }
  });

export const applyDraftQualityScoreInputSchema = z
  .object({
    qualityRunId: z.number().int().positive(),
    draftVariantId: z.number().int().positive(),
    attemptId: z.number().int().positive(),
    contentRevision: z.number().int().positive(),
    agentRunId: z.number().int().positive(),
    categoryScores: draftQualityCategoryScoresSchema,
    rewrite: draftQualityRewriteSchema.optional(),
    summary: z.string().trim().min(1).max(1000),
  })
  .strict();

/** Native fail input; `attemptId` binds the failure to the loop's own attempt. */
export const failDraftQualityInputSchema = z
  .object({
    qualityRunId: z.number().int().positive(),
    draftVariantId: z.number().int().positive(),
    attemptId: z.number().int().positive(),
    errorMessage: z.string().trim().min(1).max(1000),
  })
  .strict();

/** Native `ClaimPayload` returned by claim, continue, and resume. */
export const draftQualityClaimResultSchema = z
  .object({
    qualityRunId: z.number().int().positive(),
    attemptId: z.number().int().positive(),
    agentRunId: z.number().int().positive(),
    campaignId: z.number().int().positive(),
    draftVariantId: z.number().int().positive(),
    contentRevision: z.number().int().min(1),
  })
  .strict();

/** Native `ReconcilePayload` returned by stale quality-run reconciliation. */
export const draftQualityReconcileResultSchema = z
  .object({
    reconciledRunIds: z.array(z.number().int().positive()),
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

export const playbookKeySchema = z.union([
  z.enum(AGENT_PLAYBOOK_KEYS),
  z.literal(""),
]);

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

/** Native result of the draft mutation commands: the affected row id. */
export const draftMutationResultSchema = z
  .object({ id: z.number().int().positive() })
  .strict();

/** Native result of `linkgo_draft_generation_claim`. */
export const draftGenerationClaimResultSchema = z
  .object({
    requestId: z.number().int().positive(),
    campaignId: z.number().int().positive(),
    workflowRunId: z.number().int().positive().nullable(),
    candidateContext: z.record(z.string(), z.unknown()),
  })
  .strict();

/** Native result of `linkgo_draft_generation_settle`. */
export const draftGenerationSettleResultSchema = z
  .object({
    status: z.enum(["generated", "failed"]),
    errorMessage: z.string(),
  })
  .strict();
