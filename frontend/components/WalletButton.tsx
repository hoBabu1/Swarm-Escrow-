"use client";

import { useEffect, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useBalance, useSwitchChain } from "wagmi";
import { ChevronDown, X } from "lucide-react";
import { botChainMainnet, botChainTestnet } from "@/lib/chains";

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

const NETWORKS = [botChainMainnet, botChainTestnet];

export function WalletButton() {
  const [chainMenuOpen, setChainMenuOpen] = useState(false);
  const chainMenuRef = useRef<HTMLDivElement>(null);
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (chainMenuRef.current && !chainMenuRef.current.contains(event.target as Node)) {
        setChainMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
                  <div className="relative" ref={chainMenuRef}>
                    <button
                      onClick={() => setChainMenuOpen((prev) => !prev)}
                      type="button"
                      className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-[#eafff5] transition hover:bg-white/15 active:bg-white/20"
                    >
                      {chain.name}
                      <ChevronDown size={14} />
                    </button>
                    {chainMenuOpen && (
                      <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-72 max-w-[calc(100vw-2rem)] rounded-3xl border border-white/10 bg-[#1d1d24] p-5 shadow-2xl">
                        <div className="mb-5 flex items-center justify-between">
                          <div className="text-xl font-bold text-white">Switch Networks</div>
                          <button
                            onClick={() => setChainMenuOpen(false)}
                            type="button"
                            className="grid size-9 place-items-center rounded-full bg-white/10 text-[#b9bac5] transition hover:bg-white/15 hover:text-white"
                            aria-label="Close network menu"
                          >
                            <X size={20} />
                          </button>
                        </div>
                        <div className="flex flex-col gap-2">
                          {NETWORKS.map((network) => {
                            const isActive = chain.id === network.id;
                            return isActive ? (
                              <div
                                key={network.id}
                                className="flex items-center justify-between rounded-2xl bg-aurora-green px-4 py-3 text-[#06120c]"
                              >
                                <span className="text-base font-bold">{network.name}</span>
                                <span className="flex items-center gap-2 text-sm">
                                  Connected
                                  <span className="size-2.5 rounded-full bg-[#22e800]" />
                                </span>
                              </div>
                            ) : (
                              <button
                                key={network.id}
                                type="button"
                                disabled={isSwitchingChain}
                                onClick={() => {
                                  switchChain({ chainId: network.id });
                                  setChainMenuOpen(false);
                                }}
                                className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-left transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                <span className="text-base font-bold text-white">{network.name}</span>
                                <span className="font-mono text-[10px] text-[#9da0ad]">Switch</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
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
