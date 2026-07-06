import { useMemo } from "react";
import { EscrowStatus } from "./useEscrow";
import { EscrowWithId } from "./useEscrowsByIds";

export interface EscrowStats {
  totalEarned: bigint;
  totalPaidOut: bigint;
  activeCount: number;
}

/**
 * Status.Resolved always means the worker was paid, and Status.Refunded always means the
 * client got the deposit back — true for the normal finalize/senior-arbiter paths AND the
 * emergencyRescue bypass, since _payOut/emergencyRescue both key the terminal status off of
 * who actually received funds. So this split is unambiguous straight from `status`.
 */
export function useEscrowStats(clientEscrows: EscrowWithId[], workerEscrows: EscrowWithId[]): EscrowStats {
  const totalEarned = useMemo(
    () => workerEscrows.filter((e) => e.status === EscrowStatus.Resolved).reduce((sum, e) => sum + e.amount, BigInt(0)),
    [workerEscrows]
  );
  const totalPaidOut = useMemo(
    () => clientEscrows.filter((e) => e.status === EscrowStatus.Resolved).reduce((sum, e) => sum + e.amount, BigInt(0)),
    [clientEscrows]
  );
  const activeCount = useMemo(
    () =>
      [...clientEscrows, ...workerEscrows].filter(
        (e) => e.status !== EscrowStatus.Resolved && e.status !== EscrowStatus.Refunded
      ).length,
    [clientEscrows, workerEscrows]
  );

  return { totalEarned, totalPaidOut, activeCount };
}
