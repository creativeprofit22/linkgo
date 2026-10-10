/**
 * Mirrors the native `approval_scheduling` gate so Auto-posting only offers
 * "Schedule again" when the approval card will actually let the user pick a
 * new time: the job failed, the approval is still approved and the campaign
 * is not archived. The native checks stay authoritative.
 */
export interface ScheduleAgainState {
  scheduleJobStatus: string | null;
  approvalStatus: string | null;
  campaignStatus: string | null;
}

export function canScheduleAgain(state: ScheduleAgainState): boolean {
  return (
    state.scheduleJobStatus === "failed" &&
    state.approvalStatus === "approved" &&
    state.campaignStatus !== null &&
    state.campaignStatus !== "archived"
  );
}
