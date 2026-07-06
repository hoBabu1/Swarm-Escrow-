// All contract-write call sites (submitVerdict, submitSeniorArbiterVerdict,
// resolve, finalizeAfterChallengeWindow, resolveAfterSeniorArbiterTimeout)
// send from the single shared `oracleWallet` (contract/client.ts). The event
// poller and the deadline-scan loop in index.ts run on independent timers,
// so without this lock two sends could both fetch the wallet's pending nonce
// at once and collide. Every tx-sending call in this codebase must acquire
// this lock before calling a contract write method and hold it until
// `tx.wait()` resolves, guaranteeing at most one oracle-wallet tx is ever in
// flight process-wide.
let tail: Promise<unknown> = Promise.resolve();

export async function withTxLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  // Swallow rejection in the chain itself (not in what we return to the
  // caller) so one failed tx doesn't wedge the queue for everyone after it.
  tail = run.catch(() => undefined);
  return run;
}
