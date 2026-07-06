'use client';

import { useAccount, useBalance } from 'wagmi';

/** Native BOT balance for the connected wallet, styled to match the address-pill metadata
 * look used elsewhere. Renders nothing while disconnected. */
export function WalletBalance() {
  const { address, isConnected } = useAccount();
  const { data, isLoading, isError } = useBalance({ address, query: { enabled: isConnected && !!address } });

  if (!isConnected) return null;

  return (
    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: isError ? '#ff9a9a' : '#8fb5a8' }}>
      {isError ? '—' : isLoading || !data ? '...' : `${Number(data.formatted).toFixed(2)} BOT`}
    </span>
  );
}
