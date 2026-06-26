import { z } from "zod";
import {
  WORKFLOW_EVENT_TYPES,
  WORKFLOW_RUN_STATUSES,
  WORKFLOW_STEP_KEYS,
  WORKFLOW_STEP_STATUSES,
  WORKFLOW_TYPES,
} from "@/workflows/types";

const positiveIdSchema = z.number().int().positive();
const optionalSummarySchema = z.string().trim().max(1000).default("");

export const workflowTypeSchema = z.enum(WORKFLOW_TYPES);
export const workflowRunStatusSchema = z.enum(WORKFLOW_RUN_STATUSES);
export const workflowStepKeySchema = z.enum(WORKFLOW_STEP_KEYS);
export const workflowStepStatusSchema = z.enum(WORKFLOW_STEP_STATUSES);
export const workflowEventTypeSchema = z.enum(WORKFLOW_EVENT_TYPES);

export const createWorkflowRunSchema = z.object({
  campaignId: positiveIdSchema,
  title: z.string().trim().min(1, "Title is required").max(160),
  contextSummary: optionalSummarySchema,
});

export const startWorkflowRunSchema = z.object({
  id: positiveIdSchema,
});

export const setWorkflowStepStatusSchema = z.object({
  stepId: positiveIdSchema,
  status: workflowStepStatusSchema,
  outputSummary: optionalSummarySchema,
  errorMessage: optionalSummarySchema,
});

export const cancelWorkflowRunSchema = z.object({
  id: positiveIdSchema,
});

export const addWorkflowNoteSchema = z.object({
  workflowRunId: positiveIdSchema,
  note: z.string().trim().min(1, "Note is required").max(1000),
});
