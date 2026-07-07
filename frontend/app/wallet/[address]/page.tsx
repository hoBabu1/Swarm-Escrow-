'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { formatEther, isAddress } from 'viem';
import { useClientEscrows, useWorkerEscrows } from '@/lib/hooks/useAddressEscrows';
import { useEscrowsByIds } from '@/lib/hooks/useEscrowsByIds';
import { useEscrowStats } from '@/lib/hooks/useEscrowStats';
import { useAddressFeedback } from '@/lib/hooks/useAddressFeedback';
import { truncate, parseFeedbackRating } from '@/lib/escrowFormat';
import { botChainTestnet } from '@/lib/chains';
import { StatCard, EscrowRowItem } from '@/components/EscrowUI';
import { WalletButton } from '@/components/WalletButton';

const EXPLORER_BASE = botChainTestnet.blockExplorers.default.url;

export default function WalletLookupPage() {
  const router = useRouter();
  const params = useParams();
  const address = (params.address as string) || '';
  const [tab, setTab] = useState<'client' | 'worker'>('worker');
  const [lookupAddr, setLookupAddr] = useState('');
  const lookupValid = lookupAddr.length > 0 && isAddress(lookupAddr);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleLookup = () => {
    if (!lookupValid) return;
    router.push(`/wallet/${lookupAddr}`);
  };

  const validAddress = isAddress(address) ? (address as `0x${string}`) : undefined;
  const { data: clientIdsData, isLoading: clientIdsLoading, isError: clientIdsError } = useClientEscrows(validAddress);
  const { data: workerIdsData, isLoading: workerIdsLoading, isError: workerIdsError } = useWorkerEscrows(validAddress);

  const clientIds = useMemo(() => (clientIdsData as readonly bigint[] | undefined) ?? [], [clientIdsData]);
  const workerIds = useMemo(() => (workerIdsData as readonly bigint[] | undefined) ?? [], [workerIdsData]);

  const { escrows: clientEscrows, isLoading: clientEscrowsLoading, isError: clientEscrowsError } = useEscrowsByIds(clientIds);
  const { escrows: workerEscrows, isLoading: workerEscrowsLoading, isError: workerEscrowsError } = useEscrowsByIds(workerIds);

  const allEscrowIds = useMemo(() => [...clientIds, ...workerIds], [clientIds, workerIds]);
  const feedback = useAddressFeedback(validAddress, allEscrowIds, 'received');

  // Same badge logic as the dashboard: "received" rows are already scoped to feedback the
  // looked-up address was sent (not sent itself), so per escrow this is always the
  // counterparty's rating of that address's role on that specific escrow.
  const ratingByEscrowId = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of feedback.rows) {
      const parsed = parseFeedbackRating(row.text);
      if (parsed !== null) map.set(String(row.escrowId), parsed);
    }
    return map;
  }, [feedback.rows]);

  const activeEscrows = tab === 'client' ? clientEscrows : workerEscrows;
  const activeLoading = tab === 'client' ? clientIdsLoading || clientEscrowsLoading : workerIdsLoading || workerEscrowsLoading;
  const activeError = tab === 'client' ? clientIdsError || clientEscrowsError : workerIdsError || workerEscrowsError;
  const statsLoading = clientIdsLoading || workerIdsLoading || clientEscrowsLoading || workerEscrowsLoading;
  const statsError = clientIdsError || workerIdsError || clientEscrowsError || workerEscrowsError;

  const { totalEarned, totalPaidOut, activeCount } = useEscrowStats(clientEscrows, workerEscrows);
  const totalCount = clientIds.length + workerIds.length;

  const goToEscrow = (id: string | number | bigint) => {
    router.push(`/escrow/${id.toString()}`);
  };

  return (
    <div style={{ background: '#060a0c', position: 'relative', minHeight: '100vh', fontFamily: "'Sora', sans-serif" }}>
      <div style={{ position: 'relative', zIndex: 1, padding: '24px 16px', maxWidth: 960, margin: '0 auto' }}>
        <div onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, color: '#8fb5a8', fontSize: 16, cursor: 'pointer' }}>
          ← Back to landing
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 44 }}>
          <div onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
            <svg width="37" height="37" viewBox="0 0 28 28">
              <circle cx="14" cy="6" r="3.4" fill="#4dffb8" />
              <circle cx="5" cy="21" r="3.4" fill="#4d9fff" />
              <circle cx="23" cy="21" r="3.4" fill="#4dffb8" />
              <line x1="14" y1="6" x2="5" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
              <line x1="14" y1="6" x2="23" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
              <line x1="5" y1="21" x2="23" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
            </svg>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 21, fontWeight: 700, color: '#eafff5' }}>Swarm Escrow</span>
          </div>
          <WalletButton />
        </div>

        <div style={{ marginBottom: 34 }}>
          <div style={{ fontSize: 15, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 9, textTransform: 'uppercase' }}>
            Public wallet history · read-only
          </div>
          <a
            href={`${EXPLORER_BASE}/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 25, color: '#eafff5', fontWeight: 700, wordBreak: 'break-all', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 12 }}
          >
            {address} ↗
          </a>
        </div>

        <div style={{ marginBottom: 34 }}>
          <div style={{ fontSize: 15, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 }}>Look up another wallet</div>
          <div className="wallet-lookup-row" style={{ display: 'flex', gap: 12 }}>
            <input
              value={lookupAddr}
              onChange={(e) => setLookupAddr(e.target.value)}
              placeholder="0x..."
              className="wallet-lookup-input"
              style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '14px 16px', color: '#eafff5', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, outline: 'none' }}
            />
            <button
              className="wallet-lookup-button"
              disabled={!lookupValid}
              onClick={handleLookup}
              style={{ background: '#4d9fff', color: '#03101f', border: 'none', padding: '14px 24px', borderRadius: 10, fontWeight: 700, fontSize: 15, fontFamily: "'Sora', sans-serif", cursor: lookupValid ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', opacity: lookupValid ? 1 : 0.5 }}
            >
              View history
            </button>
          </div>
          {lookupAddr.length > 0 && !lookupValid && <p style={{ color: '#ff9a9a', fontSize: 14, marginTop: 12 }}>Enter a valid address</p>}
          <style>{`
            @media (max-width: 640px) {
              .wallet-lookup-row { flex-direction: column; }
              .wallet-lookup-input,
              .wallet-lookup-button { width: 100%; box-sizing: border-box; }
            }
          `}</style>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 34 }}>
          {statsLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ background: 'rgba(6,10,12,0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 18, height: 82 }} />
            ))
          ) : statsError ? (
            <div style={{ gridColumn: '1 / -1', padding: 18, textAlign: 'center', color: '#ff9a9a', fontSize: 15, background: 'rgba(6,10,12,0.5)', border: '1px solid rgba(255,90,90,0.25)', borderRadius: 16 }}>
              Couldn&apos;t load account stats from the chain. Try refreshing.
            </div>
          ) : (
            <>
              <StatCard label="Total earned" value={`${formatEther(totalEarned)} BOT`} accent="rgba(77,255,184,0.2)" />
              <StatCard label="Total paid out" value={`${formatEther(totalPaidOut)} BOT`} accent="rgba(77,159,255,0.2)" />
              <StatCard label="Active escrows" value={String(activeCount)} accent="rgba(255,255,255,0.1)" />
              <StatCard label="Total escrows" value={String(totalCount)} accent="rgba(255,255,255,0.1)" />
              <StatCard
                label="Rating"
                value={
                  feedback.loading ? '...' : feedback.count === 0 ? (
                    <span style={{ fontSize: 17 }}>No ratings yet</span>
                  ) : (
                    <>
                      {feedback.average!.toFixed(1)} ★ <span style={{ fontSize: 15, color: '#6a8f80', fontWeight: 400 }}>({feedback.count})</span>
                    </>
                  )
                }
                accent="rgba(77,255,184,0.2)"
              />
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 22, background: 'rgba(255,255,255,0.04)', borderRadius: 13, padding: 6, width: 'fit-content' }}>
          <button
            onClick={() => setTab('client')}
            style={{ background: tab === 'client' ? '#4dffb8' : 'transparent', color: tab === 'client' ? '#06120c' : '#a8d4c0', border: 'none', padding: '11px 26px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
          >
            As client
          </button>
          <button
            onClick={() => setTab('worker')}
            style={{ background: tab === 'worker' ? '#4dffb8' : 'transparent', color: tab === 'worker' ? '#06120c' : '#a8d4c0', border: 'none', padding: '11px 26px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
          >
            As worker
          </button>
        </div>

        <div style={{ background: 'rgba(6,10,12,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden', marginBottom: 34 }}>
          {activeLoading ? (
            <div style={{ padding: 34, textAlign: 'center', color: '#6a8f80', fontSize: 15 }}>Loading escrows...</div>
          ) : activeError ? (
            <div style={{ padding: 34, textAlign: 'center', color: '#ff9a9a', fontSize: 15 }}>Couldn&apos;t load escrows from the chain. Try refreshing.</div>
          ) : activeEscrows.length === 0 ? (
            <div style={{ padding: 34, textAlign: 'center', color: '#6a8f80', fontSize: 15 }}>
              No escrows as {tab}.
            </div>
          ) : (
            activeEscrows.map((escrow) => (
              <EscrowRowItem
                key={escrow.id.toString()}
                escrow={escrow}
                counterpartyLabel={tab === 'client' ? `worker ${truncate(escrow.worker)}` : `client ${truncate(escrow.client)}`}
                onClick={() => goToEscrow(escrow.id)}
                showStepTracker
                now={now}
                ratingReceived={ratingByEscrowId.get(escrow.id.toString())}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
