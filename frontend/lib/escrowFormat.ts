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
];

export function isLikelyAlreadyHandledError(error: { message?: string } | null | undefined): boolean {
  if (!error?.message) return false;
  return RACE_REVERT_REASONS.some((reason) => error.message!.includes(reason));
}
