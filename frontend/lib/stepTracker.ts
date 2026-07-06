import { EscrowStatus } from "./hooks/useEscrow";

export const STEP_LABELS = ["Created", "Submitted", "Challenge", "Resolved"] as const;

/** One distinct accent color per phase (index-matched to STEP_LABELS), shared by the full-size
 * and mini step trackers so a given phase always reads the same color in both places. Reached
 * steps (done or current) render in their own phase color; only not-yet-reached steps fall
 * back to a dim neutral gray. */
export const STEP_COLORS: readonly string[] = [
  "#4dffb8", // Created — green
  "#4d9fff", // Submitted — blue
  "#ffb44d", // Challenge — amber
  "#c084fc", // Resolved — violet
];

// Real contract states only — there is no distinct "Reviewed" status on-chain (agent votes
// accumulate silently until resolve() tallies 2-of-3), so that step is folded into "Submitted".
const STEP_STATUS_ORDER: EscrowStatus[] = [
  EscrowStatus.Created,
  EscrowStatus.DeliverableSubmitted,
  EscrowStatus.PendingChallenge,
  EscrowStatus.Resolved,
];

export interface StepInfo {
  currentIndex: number;
  isTerminal: boolean;
  /** "Challenged" replaces the "Challenge" label on that step when the escrow is mid-challenge. */
  labelOverride?: string;
}

/** Shared by the full-size step tracker (escrow detail page) and the compact dot tracker
 * (dashboard rows) so both always agree on which step is "current". */
export function computeStepInfo(status: EscrowStatus): StepInfo {
  const isTerminal = status === EscrowStatus.Resolved || status === EscrowStatus.Refunded;
  // Challenged is a sub-state of the Challenge step; Refunded is a terminal alternate of Resolved.
  const effectiveStatus = status === EscrowStatus.Challenged ? EscrowStatus.PendingChallenge : status;
  const currentIndex = isTerminal
    ? STEP_LABELS.length - 1
    : STEP_STATUS_ORDER.findIndex((s) => s === effectiveStatus);

  return {
    currentIndex,
    isTerminal,
    labelOverride: status === EscrowStatus.Challenged ? "Challenged" : undefined,
  };
}
