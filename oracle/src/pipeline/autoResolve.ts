import { contract } from "../contract/client.js";
import { getEscrow, getAllVerdicts } from "../contract/reads.js";
import { AgentRole, Status } from "../contract/types.js";
import { sendAutoTriggeredTx } from "../lib/autoTriggerTx.js";

// Called right after the oracle's own final submitVerdict for an escrow. The
// oracle is the primary path for triggering resolve() since it's already
// online and funded, but resolve() itself stays a public function anyone can
// call as a fallback (e.g. if this step fails partway through).
export async function tryAutoResolve(escrowId: bigint): Promise<void> {
  const escrow = await getEscrow(escrowId);
  if (escrow.status !== Status.DeliverableSubmitted) {
    // Already resolved (possibly by a human racing us) — nothing to do.
    return;
  }

  const verdicts = await getAllVerdicts(escrowId);
  const roles = [AgentRole.Reviewer, AgentRole.FraudSanity, AgentRole.Arbiter];
  const approveCount = roles.filter((role) => verdicts[role].hasVoted && verdicts[role].approved).length;
  const rejectCount = roles.filter((role) => verdicts[role].hasVoted && !verdicts[role].approved).length;

  if (approveCount < 2 && rejectCount < 2) {
    // Not at 2-of-3 consensus yet (e.g. reviewer/fraudSanity disagree and
    // arbiter hasn't voted). Don't call resolve() — it would only revert.
    return;
  }

  await sendAutoTriggeredTx(escrowId, "resolve", () => contract.resolve(escrowId));
}
