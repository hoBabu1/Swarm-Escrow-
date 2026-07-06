import { SWARM_ESCROW_ABI } from "./abi";

if (!process.env.NEXT_PUBLIC_CONTRACT_ADDRESS) {
  throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS is not set — check .env.local");
}

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

export const swarmEscrowConfig = {
  address: CONTRACT_ADDRESS,
  abi: SWARM_ESCROW_ABI,
} as const;
