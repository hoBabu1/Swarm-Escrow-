import { EscrowStatus } from "./hooks/useEscrow";

export const STATUS_LABELS: Record<EscrowStatus, string> = {
  [EscrowStatus.Created]: "Awaiting submission",
  [EscrowStatus.DeliverableSubmitted]: "Awaiting review",
  [EscrowStatus.PendingChallenge]: "Pending challenge",
  [EscrowStatus.Challenged]: "Challenged",
  [EscrowStatus.Resolved]: "Resolved",
  [EscrowStatus.Refunded]: "Refunded",
};

export function truncate(addr: string) {
  return `${addr.slice(0, 5)}...${addr.slice(-4)}`;
}

const FEEDBACK_RATING_PREFIX = /^(\d)\/5/;

/** Feedback messages are stored as "{rating}/5 — {text}" with no separate on-chain rating
 * field — this pulls just the numeric rating back out, or null if the text doesn't match. */
export function parseFeedbackRating(text: string): number | null {
  const match = FEEDBACK_RATING_PREFIX.exec(text);
  return match ? Number(match[1]) : null;
}

/** Ethereum addresses are case-insensitive — every equality check against one must go through this. */
export function sameAddress(a: string | undefined | null, b: string | undefined | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

// resolve()/finalizeAfterChallengeWindow()/resolveAfterSeniorArbiterTimeout() are all public —
// anyone (a human or the oracle) can call them, so losing a race to whichever caller lands
// first is expected, normal behavior, not a bug. These are the exact `require` reason strings
// those functions revert with when the escrow's status/deadline no longer matches what the
// caller expected — i.e. someone else already handled it. Matched against a write error's
// message so the UI can show a friendly "already handled" message instead of a generic failure.
const RACE_REVERT_REASONS = [
  "wrong status",
  "consensus not reached",
  "challenge window not passed",
  "senior arbiter window not passed",
  "already resolved",
];

export function isLikelyAlreadyHandledError(error: { message?: string } | null | undefined): boolean {
  if (!error?.message) return false;
  return RACE_REVERT_REASONS.some((reason) => error.message!.includes(reason));
}
