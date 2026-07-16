import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { botChainTestnet, botChainMainnet } from "./chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Swarm Escrow",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "swarm-escrow-dev",
  chains: [botChainMainnet, botChainTestnet],
  ssr: true,
});
