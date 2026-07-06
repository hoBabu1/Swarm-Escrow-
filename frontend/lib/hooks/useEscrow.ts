import { useReadContract } from "wagmi";
import { swarmEscrowConfig } from "../contract";

export enum EscrowStatus {
  Created = 0,
  DeliverableSubmitted = 1,
  PendingChallenge = 2,
  Challenged = 3,
  Resolved = 4,
  Refunded = 5,
}

export interface ParsedEscrow {
  client: `0x${string}`;
  worker: `0x${string}`;
  amount: bigint;
  specHash: `0x${string}`;
  deadline: bigint;
  status: EscrowStatus;
  repoUrl: string;
  commitHash: string;
  tentativeApproved: boolean;
  challengeDeadline: bigint;
  hasChallenged: boolean;
  seniorArbiterDeadline: bigint;
  challengeReasoningHash: `0x${string}`;
  hasClientFeedback: boolean;
  hasWorkerFeedback: boolean;
}

/** Raw tuple shape of the `escrows(id)` getter, in ABI field order. */
export type EscrowStructTuple = readonly [
  `0x${string}`,
  `0x${string}`,
  bigint,
  `0x${string}`,
  bigint,
  number,
  string,
  string,
  boolean,
  bigint,
  boolean,
  bigint,
  `0x${string}`,
  boolean,
  boolean,
];

export function parseEscrowTuple(data: EscrowStructTuple): ParsedEscrow {
  return {
    client: data[0],
    worker: data[1],
    amount: data[2],
    specHash: data[3],
    deadline: data[4],
    status: data[5] as EscrowStatus,
    repoUrl: data[6],
    commitHash: data[7],
    tentativeApproved: data[8],
    challengeDeadline: data[9],
    hasChallenged: data[10],
    seniorArbiterDeadline: data[11],
    challengeReasoningHash: data[12],
    hasClientFeedback: data[13],
    hasWorkerFeedback: data[14],
  };
}

export function useEscrow(escrowId: string | bigint | undefined) {
  const isValid = escrowId !== undefined && !Number.isNaN(Number(escrowId));

  const { data, isLoading, isError, error, refetch } = useReadContract({
    ...swarmEscrowConfig,
    functionName: "escrows",
    args: [isValid ? BigInt(escrowId) : BigInt(0)],
    query: { enabled: isValid },
  });

  const parsed: ParsedEscrow | undefined = data ? parseEscrowTuple(data as unknown as EscrowStructTuple) : undefined;

  return { data, isLoading, isError, error, escrow: parsed, refetch };
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const ZERO_HASH = `0x${"0".repeat(64)}` as const;

/** An escrow ID with no on-chain record reads back as an all-zero struct. */
export function escrowExists(escrow: ParsedEscrow | undefined): boolean {
  return !!escrow && escrow.client !== ZERO_ADDRESS;
}
