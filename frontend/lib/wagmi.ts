import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { botChainTestnet } from "./chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Swarm Escrow",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "swarm-escrow-dev",
  chains: [botChainTestnet],
  ssr: true,
});
