'use client';

import { useRouter, useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { formatEther, isAddress } from 'viem';
import { useClientEscrows, useWorkerEscrows } from '@/lib/hooks/useAddressEscrows';
import { useEscrowsByIds, EscrowWithId } from '@/lib/hooks/useEscrowsByIds';
import { useEscrowStats } from '@/lib/hooks/useEscrowStats';
import { useAddressFeedback } from '@/lib/hooks/useAddressFeedback';
import { truncate, sameAddress } from '@/lib/escrowFormat';
import { botChainTestnet } from '@/lib/chains';
import { StatCard, EscrowRowItem } from '@/components/EscrowUI';

const EXPLORER_BASE = botChainTestnet.blockExplorers.default.url;

export default function WalletLookupPage() {
  const router = useRouter();
  const params = useParams();
  const address = (params.address as string) || '';
  const [tab, setTab] = useState<'client' | 'worker'>('worker');

  const validAddress = isAddress(address) ? (address as `0x${string}`) : undefined;
  const { data: clientIdsData, isLoading: clientIdsLoading, isError: clientIdsError } = useClientEscrows(validAddress);
  const { data: workerIdsData, isLoading: workerIdsLoading, isError: workerIdsError } = useWorkerEscrows(validAddress);

  const clientIds = useMemo(() => (clientIdsData as readonly bigint[] | undefined) ?? [], [clientIdsData]);
  const workerIds = useMemo(() => (workerIdsData as readonly bigint[] | undefined) ?? [], [workerIdsData]);

  const { escrows: clientEscrows, isLoading: clientEscrowsLoading, isError: clientEscrowsError } = useEscrowsByIds(clientIds);
  const { escrows: workerEscrows, isLoading: workerEscrowsLoading, isError: workerEscrowsError } = useEscrowsByIds(workerIds);

  const allEscrowIds = useMemo(() => [...clientIds, ...workerIds], [clientIds, workerIds]);
  const feedback = useAddressFeedback(validAddress, allEscrowIds);

  const activeEscrows = tab === 'client' ? clientEscrows : workerEscrows;
  const activeLoading = tab === 'client' ? clientIdsLoading || clientEscrowsLoading : workerIdsLoading || workerEscrowsLoading;
  const activeError = tab === 'client' ? clientIdsError || clientEscrowsError : workerIdsError || workerEscrowsError;
  const statsLoading = clientIdsLoading || workerIdsLoading || clientEscrowsLoading || workerEscrowsLoading;
  const statsError = clientIdsError || workerIdsError || clientEscrowsError || workerEscrowsError;

  const { totalEarned, totalPaidOut, activeCount } = useEscrowStats(clientEscrows, workerEscrows);
  const totalCount = clientIds.length + workerIds.length;

  // Feedback rows only carry escrow_id + sender — look up which role the sender held on
  // that specific escrow (they're guaranteed to be the counterparty, since useAddressFeedback
  // already excludes rows sent by `address` itself) so the label reads "from client/worker X".
  const escrowById = useMemo(() => {
    const map = new Map<number, EscrowWithId>();
    for (const e of [...clientEscrows, ...workerEscrows]) map.set(Number(e.id), e);
    return map;
  }, [clientEscrows, workerEscrows]);

  const goToEscrow = (id: string | number | bigint) => {
    router.push(`/escrow/${id.toString()}`);
  };

  return (
    <div style={{ background: '#060a0c', position: 'relative', minHeight: '100vh', fontFamily: "'Sora', sans-serif" }}>
      <div style={{ position: 'relative', zIndex: 1, padding: '24px 32px', maxWidth: 720, margin: '0 auto' }}>
        <div onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, cursor: 'pointer' }}>
          <svg width="26" height="26" viewBox="0 0 28 28">
            <circle cx="14" cy="6" r="3.4" fill="#4dffb8" />
            <circle cx="5" cy="21" r="3.4" fill="#4d9fff" />
            <circle cx="23" cy="21" r="3.4" fill="#4dffb8" />
            <line x1="14" y1="6" x2="5" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
            <line x1="14" y1="6" x2="23" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
            <line x1="5" y1="21" x2="23" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
          </svg>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700, color: '#eafff5' }}>Swarm Escrow</span>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 6, textTransform: 'uppercase' }}>
            Public wallet history · read-only
          </div>
          <a
            href={`${EXPLORER_BASE}/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, color: '#eafff5', fontWeight: 700, wordBreak: 'break-all', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            {address} ↗
          </a>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
          {statsLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ background: 'rgba(6,10,12,0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, height: 62 }} />
            ))
          ) : statsError ? (
            <div style={{ gridColumn: '1 / -1', padding: 14, textAlign: 'center', color: '#ff9a9a', fontSize: 12, background: 'rgba(6,10,12,0.5)', border: '1px solid rgba(255,90,90,0.25)', borderRadius: 12 }}>
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
                    <span style={{ fontSize: 13 }}>No ratings yet</span>
                  ) : (
                    <>
                      {feedback.average!.toFixed(1)} ★ <span style={{ fontSize: 11, color: '#6a8f80', fontWeight: 400 }}>({feedback.count})</span>
                    </>
                  )
                }
                accent="rgba(77,255,184,0.2)"
              />
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
          <button
            onClick={() => setTab('client')}
            style={{ background: tab === 'client' ? '#4dffb8' : 'transparent', color: tab === 'client' ? '#06120c' : '#a8d4c0', border: 'none', padding: '8px 18px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
          >
            As client
          </button>
          <button
            onClick={() => setTab('worker')}
            style={{ background: tab === 'worker' ? '#4dffb8' : 'transparent', color: tab === 'worker' ? '#06120c' : '#a8d4c0', border: 'none', padding: '8px 18px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
          >
            As worker
          </button>
        </div>

        <div style={{ background: 'rgba(6,10,12,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
          {activeLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#6a8f80', fontSize: 12 }}>Loading escrows...</div>
          ) : activeError ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#ff9a9a', fontSize: 12 }}>Couldn&apos;t load escrows from the chain. Try refreshing.</div>
          ) : activeEscrows.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#6a8f80', fontSize: 12 }}>
              No escrows as {tab}.
            </div>
          ) : (
            activeEscrows.map((escrow) => (
              <EscrowRowItem
                key={escrow.id.toString()}
                escrow={escrow}
                counterpartyLabel={tab === 'client' ? `worker ${truncate(escrow.worker)}` : `client ${truncate(escrow.client)}`}
                onClick={() => goToEscrow(escrow.id)}
              />
            ))
          )}
        </div>

        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6a8f80', fontFamily: "'JetBrains Mono', monospace", marginBottom: 10 }}>
            Feedback received
          </div>
          {feedback.loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#6a8f80', fontSize: 12, background: 'rgba(6,10,12,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
              Loading feedback...
            </div>
          ) : feedback.error ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#ff9a9a', fontSize: 12, background: 'rgba(6,10,12,0.4)', border: '1px solid rgba(255,90,90,0.25)', borderRadius: 12 }}>
              Couldn&apos;t load feedback. Try refreshing.
            </div>
          ) : feedback.rows.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#6a8f80', fontSize: 12, background: 'rgba(6,10,12,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
              No feedback yet.
            </div>
          ) : (
            feedback.rows.map((f, i) => {
              const escrow = escrowById.get(f.escrowId);
              const senderRole = escrow && sameAddress(escrow.client, f.senderAddress) ? 'client' : 'worker';
              return (
                <div
                  key={i}
                  onClick={() => goToEscrow(f.escrowId)}
                  style={{ background: 'rgba(6,10,12,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px', marginBottom: 8, cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 12, color: '#c4dcd0', marginBottom: 6, lineHeight: 1.5 }}>&quot;{f.text}&quot;</div>
                  <div style={{ fontSize: 10, color: '#6a8f80', fontFamily: "'JetBrains Mono', monospace", display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span>from {senderRole} {truncate(f.senderAddress)}</span>
                    <span>·</span>
                    <span>escrow #{f.escrowId}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
