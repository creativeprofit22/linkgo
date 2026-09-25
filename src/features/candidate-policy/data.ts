import { invokeCommand } from "@/lib/tauri";
import {
  candidateIntakePolicyCampaignIdSchema,
  candidateIntakePolicyResultSchema,
  updateCandidateIntakePolicySchema,
} from "@/features/candidate-policy/schemas";
import type {
  CandidateIntakePolicy,
  UpdateCandidateIntakePolicyInput,
} from "@/features/candidate-policy/types";

/**
 * Reads a campaign's intake policy natively (defaults when none is saved).
 * The policy row and its banned topics come from one read transaction.
 */
export async function getCandidateIntakePolicy(
  campaignId: number,
): Promise<CandidateIntakePolicy> {
  const parsedCampaignId =
    candidateIntakePolicyCampaignIdSchema.parse(campaignId);
  return candidateIntakePolicyResultSchema.parse(
    await invokeCommand("linkgo_candidate_policy_get", {
      input: { campaignId: parsedCampaignId },
    }),
  );
}

/**
 * Replaces a campaign's intake policy and banned-topic set. The campaign
 * mutability check, upsert, topic replacement and saved-policy read settle
 * natively in one transaction; native re-applies NFKC topic normalisation.
 */
export async function updateCandidateIntakePolicy(
  input: UpdateCandidateIntakePolicyInput,
): Promise<CandidateIntakePolicy> {
  const parsed = updateCandidateIntakePolicySchema.parse(input);
  return candidateIntakePolicyResultSchema.parse(
    await invokeCommand("linkgo_candidate_policy_update", {
      input: parsed,
    }),
  );
}
