// Public state-changing functions (resolve/finalizeAfterChallengeWindow/
// resolveAfterSeniorArbiterTimeout) are callable by anyone, so a human and
// the oracle racing for the same call is expected, not a bug — the contract's
// own status/deadline `require`s are what prevent double-execution. When our
// call loses that race, ethers surfaces it as a revert whose reason matches
// one of these known guard strings; that case should log at info level, not
// error. Anything else (RPC failure, out of gas, unexpected revert) is a real
// problem and should still surface as an error.
const KNOWN_RACE_REVERT_REASONS = [
  "wrong status",
  "consensus not reached",
  "challenge window not passed",
  "senior arbiter window not passed",
];

export function isLikelyRaceRevert(err: unknown): boolean {
  // Prefer ethers' own decoded revert reason when present — some RPC nodes
  // omit revert data on the eth_estimateGas/eth_call ethers does internally
  // before sending, in which case `.message` degrades to a generic
  // "execution reverted (unknown custom error)" that would otherwise
  // misclassify a genuine race as a real error.
  const reason = (err as { reason?: unknown } | null)?.reason;
  if (typeof reason === "string") {
    return KNOWN_RACE_REVERT_REASONS.some((known) => reason.includes(known));
  }
  const message = err instanceof Error ? err.message : String(err);
  return KNOWN_RACE_REVERT_REASONS.some((known) => message.includes(known));
}
