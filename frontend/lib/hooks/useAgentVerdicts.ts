import { useReadContracts } from "wagmi";
import { useSwarmEscrowConfig } from "../contract";
import { ZERO_HASH } from "./useEscrow";

export const AGENT_ROLES = ["Reviewer", "FraudSanity", "Arbiter"] as const;
export type AgentRoleName = (typeof AGENT_ROLES)[number];

export interface OnChainVerdict {
  agent: AgentRoleName;
  hasVoted: boolean;
  approved: boolean;
  reasoningHash: `0x${string}`;
}

export interface OnChainSeniorArbiterVote {
  hasVoted: boolean;
  approved: boolean;
  reasoningHash: `0x${string}`;
}

/** Reads all 3 agent-role verdicts plus the Senior Arbiter vote for one escrow in a single multicall. */
export function useAgentVerdicts(escrowId: bigint | undefined) {
  const enabled = escrowId !== undefined;
  const swarmEscrowConfig = useSwarmEscrowConfig();

  const { data, isLoading, isError, error, refetch } = useReadContracts({
    contracts: [
      { ...swarmEscrowConfig, functionName: "verdicts", args: [escrowId ?? BigInt(0), BigInt(0)] },
      { ...swarmEscrowConfig, functionName: "verdicts", args: [escrowId ?? BigInt(0), BigInt(1)] },
      { ...swarmEscrowConfig, functionName: "verdicts", args: [escrowId ?? BigInt(0), BigInt(2)] },
      { ...swarmEscrowConfig, functionName: "seniorArbiterVotes", args: [escrowId ?? BigInt(0)] },
    ],
    query: { enabled, refetchInterval: 20_000 },
  });

  const verdicts: OnChainVerdict[] = AGENT_ROLES.map((agent, i) => {
    const result = data?.[i];
    const d = result?.status === "success" ? (result.result as readonly [boolean, boolean, `0x${string}`]) : undefined;
    return {
      agent,
      hasVoted: d?.[0] ?? false,
      approved: d?.[1] ?? false,
      reasoningHash: d?.[2] ?? ZERO_HASH,
    };
  });

  const seniorArbiterResult = data?.[3];
  const seniorArbiterData =
    seniorArbiterResult?.status === "success"
      ? (seniorArbiterResult.result as readonly [boolean, boolean, `0x${string}`])
      : undefined;

  const seniorArbiterVote: OnChainSeniorArbiterVote = {
    hasVoted: seniorArbiterData?.[0] ?? false,
    approved: seniorArbiterData?.[1] ?? false,
    reasoningHash: seniorArbiterData?.[2] ?? ZERO_HASH,
  };

  return { verdicts, seniorArbiterVote, isLoading, isError, error, refetch };
}
