import { ReviewStatus, WorkflowAction } from "../schemas.js";

export class InvalidWorkflowTransitionError extends Error {
  constructor(
    public readonly currentStatus: ReviewStatus,
    public readonly action: WorkflowAction
  ) {
    super(
      `Cannot perform action "${action}" when newsletter review status is "${currentStatus}".`
    );
    this.name = "InvalidWorkflowTransitionError";
  }
}

/**
 * State machine definition for newsletter/digest review & publishing workflows.
 *
 * State flow:
 *   draft ──submit──▶ in_review ──approve──▶ approved ──schedule──▶ scheduled ──start_sending──▶ sending ──mark_sent──▶ sent
 *     ▲                    │                                                                          │
 *     └──request_changes───┘                                                              (error)──▶ failed ──retry──▶ sending
 */
const VALID_TRANSITIONS: Record<ReviewStatus, Partial<Record<WorkflowAction, ReviewStatus>>> = {
  draft: {
    submit_for_review: "in_review",
  },
  in_review: {
    approve: "approved",
    request_changes: "changes_requested",
  },
  changes_requested: {
    submit_for_review: "in_review",
  },
  approved: {
    schedule: "scheduled",
    start_sending: "sending",
  },
  scheduled: {
    start_sending: "sending",
  },
  sending: {
    mark_sent: "sent",
    mark_failed: "failed",
  },
  failed: {
    retry: "sending",
  },
  sent: {},
};

/**
 * Validates and executes a state transition for a newsletter review workflow.
 */
export function transitionReviewStatus(
  currentStatus: ReviewStatus,
  action: WorkflowAction
): ReviewStatus {
  const nextStatus = VALID_TRANSITIONS[currentStatus]?.[action];
  if (!nextStatus) {
    throw new InvalidWorkflowTransitionError(currentStatus, action);
  }
  return nextStatus;
}

/**
 * Returns available workflow actions given the current review status.
 */
export function getAvailableWorkflowActions(currentStatus: ReviewStatus): WorkflowAction[] {
  const transitions = VALID_TRANSITIONS[currentStatus];
  return transitions ? (Object.keys(transitions) as WorkflowAction[]) : [];
}
