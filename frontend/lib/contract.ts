import { useChainId } from "wagmi";
import { SWARM_ESCROW_ABI } from "./abi";
import { botChainTestnet, botChainMainnet } from "./chains";

function requireEnv(name: string, value: string | undefined): `0x${string}` {
  if (!value) {
    throw new Error(`${name} is not set — check .env.local`);
  }
  return value as `0x${string}`;
}

// Testnet (968) and mainnet (677) are different deployments with different
// addresses — this maps each supported chain to its own contract, since the
// two networks run live in parallel rather than one replacing the other.
// NEXT_PUBLIC_ vars must be referenced as static `process.env.NEXT_PUBLIC_X` literals
// (not dynamic `process.env[name]`) so Next.js can inline them into the client bundle.
const CONTRACT_ADDRESSES: Record<number, `0x${string}`> = {
  [botChainTestnet.id]: requireEnv(
    "NEXT_PUBLIC_CONTRACT_ADDRESS_TESTNET",
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS_TESTNET,
  ),
  [botChainMainnet.id]: requireEnv(
    "NEXT_PUBLIC_CONTRACT_ADDRESS_MAINNET",
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS_MAINNET,
  ),
};

export function getContractAddress(chainId: number): `0x${string}` {
  const address = CONTRACT_ADDRESSES[chainId];
  if (!address) {
    throw new Error(`No SwarmEscrow contract address configured for chain ${chainId}`);
  }
  return address;
}

export function getSwarmEscrowConfig(chainId: number) {
  return {
    address: getContractAddress(chainId),
    abi: SWARM_ESCROW_ABI,
    // Included so every wagmi read/write call this config is spread into targets this
    // specific chain's RPC, regardless of which chain the connected wallet happens to be
    // on (or wagmi's default chain when disconnected) — needed by pages that must pin to
    // one network rather than follow the active connection (e.g. wallet lookup → testnet).
    chainId,
  } as const;
}

/** React-hook form: resolves the contract config for a given chain. Pass `chainIdOverride`
 * to pin to a specific network regardless of the connected wallet's active chain; omit it
 * to follow whichever chain the app is currently on (wagmi's default/first configured
 * chain when no wallet is connected). */
export function useSwarmEscrowConfig(chainIdOverride?: number) {
  const activeChainId = useChainId();
  return getSwarmEscrowConfig(chainIdOverride ?? activeChainId);
}
