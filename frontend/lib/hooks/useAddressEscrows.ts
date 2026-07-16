import { useReadContract } from "wagmi";
import { useSwarmEscrowConfig } from "../contract";
import { ZERO_ADDRESS } from "./useEscrow";

export function useClientEscrows(address: `0x${string}` | undefined, chainIdOverride?: number) {
  const swarmEscrowConfig = useSwarmEscrowConfig(chainIdOverride);
  return useReadContract({
    ...swarmEscrowConfig,
    functionName: "getClientEscrows",
    args: [address ?? ZERO_ADDRESS],
    query: { enabled: !!address },
  });
}

export function useWorkerEscrows(address: `0x${string}` | undefined, chainIdOverride?: number) {
  const swarmEscrowConfig = useSwarmEscrowConfig(chainIdOverride);
  return useReadContract({
    ...swarmEscrowConfig,
    functionName: "getWorkerEscrows",
    args: [address ?? ZERO_ADDRESS],
    query: { enabled: !!address },
  });
}
