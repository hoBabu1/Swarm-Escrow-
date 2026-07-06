import { useWaitForTransactionReceipt } from "wagmi";

export type TxLifecycleState = "idle" | "approve" | "confirming" | "confirmed" | "reverted";

/**
 * Derives a single tx-state machine from a write's pending/hash state plus its receipt.
 * `useWaitForTransactionReceipt`'s `isSuccess` only means the receipt was fetched — a
 * mined-but-reverted tx resolves it too — so "confirmed" must be gated on the receipt's
 * own on-chain `status`, not just query resolution.
 */
export function useTxLifecycle(hash: `0x${string}` | undefined, isPending: boolean) {
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const isConfirmed = receipt?.status === "success";
  const isReverted = receipt?.status === "reverted";

  const txState: TxLifecycleState = isConfirmed
    ? "confirmed"
    : isReverted
    ? "reverted"
    : isConfirming
    ? "confirming"
    : isPending || hash
    ? "approve"
    : "idle";

  return { txState, receipt, isConfirmed, isReverted, isConfirming };
}
