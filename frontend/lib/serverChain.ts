import { createPublicClient, http, type PublicClient } from 'viem';
import { botChainTestnet, botChainMainnet } from './chains';

const SUPPORTED_CHAINS = [botChainTestnet, botChainMainnet] as const;

export function isSupportedChainId(chainId: unknown): chainId is number {
  return typeof chainId === 'number' && SUPPORTED_CHAINS.some((c) => c.id === chainId);
}

const clientCache = new Map<number, PublicClient>();

// One publicClient per chain, memoized — API routes are hit far more often than the process
// restarts, so building a fresh client per request would be wasted work for no benefit.
export function getServerPublicClient(chainId: number): PublicClient {
  const cached = clientCache.get(chainId);
  if (cached) return cached;

  const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  if (!chain) {
    throw new Error(`Unsupported chainId ${chainId}`);
  }

  // Optional override, same pattern as the pre-mainnet single-network setup — falls back to
  // each chain's own public RPC endpoint (defined in lib/chains.ts) if unset.
  const rpcOverride = chainId === botChainTestnet.id ? process.env.RPC_URL_TESTNET : process.env.RPC_URL_MAINNET;

  const client = createPublicClient({
    chain,
    transport: http(rpcOverride ?? chain.rpcUrls.default.http[0]),
  }) as PublicClient;
  clientCache.set(chainId, client);
  return client;
}
