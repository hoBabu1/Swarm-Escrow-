import { PublicClient } from 'viem';

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/**
 * Confirms a client-supplied tx hash is actually a mined, successful transaction against this
 * contract, rather than trusting the caller's word — the same anti-fabrication check the POST
 * handlers already run against on-chain escrow state, applied here to a bare tx hash.
 *
 * Known limitation: this only checks that the tx was mined, succeeded, and was sent to the
 * SwarmEscrow contract — it does NOT decode calldata to confirm it's the specific function/
 * escrowId being attached to (e.g. a caller could technically supply the hash of someone else's
 * unrelated successful tx to this same contract). The "View on-chain" link this guards is a
 * display convenience on top of the real hash-verification banner (which does bind the text to
 * an on-chain hash) — closing this gap would mean decoding `input`/logs per call site and is
 * left as a follow-up, not required for the feature's core guarantee.
 */
export async function verifyMinedTxOnContract(
  publicClient: PublicClient,
  txHash: unknown,
  contractAddress: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!txHash || typeof txHash !== 'string' || !TX_HASH_PATTERN.test(txHash)) {
    return { ok: false, message: 'txHash must be a valid transaction hash' };
  }

  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
  } catch {
    return { ok: false, message: "Couldn't verify transaction on-chain, try again" };
  }

  const toMatches = !!receipt.to && receipt.to.toLowerCase() === contractAddress.toLowerCase();
  if (receipt.status !== 'success' || !toMatches) {
    return { ok: false, message: 'txHash does not correspond to a successful transaction on this contract' };
  }

  return { ok: true };
}
