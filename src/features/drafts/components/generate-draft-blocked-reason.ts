/** Plain reason the "Write versions" submit is blocked, or null when ready. */
export function getSubmitBlockedReason({
  candidateId,
  workflowRunId,
  aiLoaded,
}: {
  candidateId: number | null;
  workflowRunId: string;
  aiLoaded: boolean;
}): string | null {
  if (candidateId === null) return "Pick a post idea above first.";
  if (workflowRunId === "") {
    return "Choose an automation or a one-off draft above.";
  }
  if (!aiLoaded) return "Loading AI settings…";
  return null;
}
