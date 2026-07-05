import { contract } from "./client.js";
import { AgentRole, type EscrowStruct, type SeniorArbiterVoteStruct, type VerdictStruct } from "./types.js";

// Contract state is always read live from the chain here — never cached or
// mirrored as a source of truth (per CLAUDE.md's "no database for on-chain
// state" constraint). Callers should re-fetch rather than hold onto these.

export async function getEscrow(escrowId: bigint): Promise<EscrowStruct> {
  const r = await contract.escrows(escrowId);
  return {
    client: r.client,
    worker: r.worker,
    amount: r.amount,
    specHash: r.specHash,
    deadline: r.deadline,
    status: Number(r.status),
    repoUrl: r.repoUrl,
    commitHash: r.commitHash,
    tentativeApproved: r.tentativeApproved,
    challengeDeadline: r.challengeDeadline,
    hasChallenged: r.hasChallenged,
    seniorArbiterDeadline: r.seniorArbiterDeadline,
    challengeReasoningHash: r.challengeReasoningHash,
    hasClientFeedback: r.hasClientFeedback,
    hasWorkerFeedback: r.hasWorkerFeedback,
  };
}

export async function getVerdict(escrowId: bigint, role: AgentRole): Promise<VerdictStruct> {
  const r = await contract.verdicts(escrowId, role);
  return { hasVoted: r.hasVoted, approved: r.approved, reasoningHash: r.reasoningHash };
}

export async function getAllVerdicts(escrowId: bigint): Promise<Record<AgentRole, VerdictStruct>> {
  const [reviewer, fraudSanity, arbiter] = await Promise.all([
    getVerdict(escrowId, AgentRole.Reviewer),
    getVerdict(escrowId, AgentRole.FraudSanity),
    getVerdict(escrowId, AgentRole.Arbiter),
  ]);
  return { [AgentRole.Reviewer]: reviewer, [AgentRole.FraudSanity]: fraudSanity, [AgentRole.Arbiter]: arbiter };
}

export async function getSeniorArbiterVote(escrowId: bigint): Promise<SeniorArbiterVoteStruct> {
  const r = await contract.seniorArbiterVotes(escrowId);
  return { hasVoted: r.hasVoted, approved: r.approved, reasoningHash: r.reasoningHash };
}
