import { defineChain } from "viem";

export const botChainTestnet = defineChain({
  id: 968,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.bohr.life"] },
  },
  blockExplorers: {
    default: { name: "BOT Scan", url: "https://scan.bohr.life" },
  },
  testnet: true,
});

export const botChainMainnet = defineChain({
  id: 677,
  name: "BOT Chain Mainnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.botchain.ai"] },
  },
  blockExplorers: {
    default: { name: "BOT Scan", url: "https://scan.botchain.ai" },
  },
});

const EXPLORER_BASE_BY_CHAIN: Record<number, string> = {
  [botChainTestnet.id]: botChainTestnet.blockExplorers.default.url,
  [botChainMainnet.id]: botChainMainnet.blockExplorers.default.url,
};

export function getExplorerBase(chainId: number): string {
  return EXPLORER_BASE_BY_CHAIN[chainId] ?? botChainTestnet.blockExplorers.default.url;
}
