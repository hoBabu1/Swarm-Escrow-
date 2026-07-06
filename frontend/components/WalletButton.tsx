"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useBalance } from "wagmi";
import { ChevronDown } from "lucide-react";

function WalletBalancePill({ address, enabled }: { address: `0x${string}` | undefined; enabled: boolean }) {
  const { data, isLoading, isError } = useBalance({
    address,
    query: { enabled: enabled && !!address },
  });

  if (!enabled) return null;

  return (
    <span className="font-mono text-xs font-semibold text-[#8fb5a8]">
      {isError ? "--" : isLoading || !data ? "..." : `${Number(data.formatted).toFixed(2)} BOT`}
    </span>
  );
}

export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openConnectModal, openChainModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            className="flex items-center gap-3"
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    type="button"
                    className="rounded-full bg-aurora-green px-5 py-2 text-sm font-bold text-[#06120c] transition hover:brightness-110 active:brightness-95"
                  >
                    Connect wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    type="button"
                    className="rounded-full bg-red-400 px-5 py-2 text-sm font-bold text-[#210606] transition hover:brightness-110 active:brightness-95"
                  >
                    Wrong network
                  </button>
                );
              }

              const truncated = `${account.address.slice(0, 5)}...${account.address.slice(-4)}`;

              return (
                <>
                  <button
                    onClick={openChainModal}
                    type="button"
                    className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-[#eafff5] transition hover:bg-white/15 active:bg-white/20"
                  >
                    {chain.name}
                    <ChevronDown size={14} />
                  </button>
                  <WalletBalancePill address={account.address as `0x${string}`} enabled={!!connected} />
                  <button
                    onClick={openAccountModal}
                    type="button"
                    className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 font-mono text-sm font-bold text-[#eafff5] transition hover:bg-white/15 active:bg-white/20"
                  >
                    <span className="grid size-5 place-items-center rounded-full bg-gradient-to-br from-[#ff4de3] to-[#4d9fff] text-[10px] font-black text-white">
                      A
                    </span>
                    {truncated}
                    <ChevronDown size={14} />
                  </button>
                </>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
