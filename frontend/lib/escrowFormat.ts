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
