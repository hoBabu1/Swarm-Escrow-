"use client";

import { useState, useRef, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useDisconnect } from "wagmi";
import { Check, Copy, LogOut } from "lucide-react";

export function WalletButton() {
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openChainModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            ref={containerRef}
            className="relative"
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
                    className="rounded-full bg-red-400 px-5 py-2 text-sm font-bold text-[#210606] transition hover:brightness-110 active:brightness-95"
                  >
                    Wrong network
                  </button>
                );
              }

              const truncated = `${account.address.slice(0, 5)}...${account.address.slice(-4)}`;

              return (
                <div>
                  <button
                    onClick={() => setOpen((prev) => !prev)}
                    className="rounded-full bg-aurora-green px-5 py-2 font-mono text-sm font-bold text-[#06120c] transition hover:brightness-110 active:brightness-95"
                  >
                    {truncated}
                  </button>
                  {open && (
                    <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-48 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[rgba(77,255,184,0.3)] bg-[rgba(10,16,14,0.95)] backdrop-blur-md shadow-xl">
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(account.address);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-foreground transition hover:bg-white/5"
                      >
                        {copied ? (
                          <Check size={14} className="text-aurora-green" />
                        ) : (
                          <Copy size={14} />
                        )}
                        {copied ? "Copied!" : "Copy address"}
                      </button>
                      <button
                        onClick={() => {
                          disconnect();
                          setOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-[#ff9a9a] transition hover:bg-white/5"
                      >
                        <LogOut size={14} />
                        Disconnect
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
