/** Identifies the post a failed attempt belongs to, for Calendar rescheduling. */
export interface RescheduleTarget {
  campaignId: number;
  approvalId: number;
}

/**
 * Mirrors the native `approval_scheduling` gate so Auto-posting only offers
 * "Reschedule" when the Calendar will actually let the user pick a new time:
 * the job failed, the approval is still approved and the campaign is not
 * archived. The native checks stay authoritative.
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
