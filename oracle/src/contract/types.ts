// Mirrors the enums/structs in contracts/src/SwarmEscrow.sol exactly.
// Numeric ordering must never drift from the Solidity source.
export enum Status {
  Created = 0,
  DeliverableSubmitted = 1,
  PendingChallenge = 2,
  Challenged = 3,
  Resolved = 4,
  Refunded = 5,
}

export enum AgentRole {
  Reviewer = 0,
  FraudSanity = 1,
  Arbiter = 2,
}

export interface EscrowStruct {
  client: string;
  worker: string;
  amount: bigint;
  specHash: string;
  deadline: bigint;
  status: Status;
  repoUrl: string;
  commitHash: string;
  tentativeApproved: boolean;
  challengeDeadline: bigint;
  hasChallenged: boolean;
  seniorArbiterDeadline: bigint;
  challengeReasoningHash: string;
  hasClientFeedback: boolean;
  hasWorkerFeedback: boolean;
}

export interface VerdictStruct {
  hasVoted: boolean;
  approved: boolean;
  reasoningHash: string;
}

export interface SeniorArbiterVoteStruct {
  hasVoted: boolean;
  approved: boolean;
  reasoningHash: string;
}
