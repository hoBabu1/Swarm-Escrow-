'use client';

import { useRouter } from 'next/navigation';
import { useAccount, useWriteContract } from 'wagmi';
import { useEffect, useMemo, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { DatePickerProps } from 'react-datepicker';
import { decodeEventLog, formatEther, isAddress, keccak256, parseEther, toBytes } from 'viem';
import 'react-datepicker/dist/react-datepicker.css';
import { swarmEscrowConfig } from '@/lib/contract';
import { SWARM_ESCROW_ABI } from '@/lib/abi';
import { botChainTestnet } from '@/lib/chains';
import { useClientEscrows, useWorkerEscrows } from '@/lib/hooks/useAddressEscrows';
import { useEscrowsByIds } from '@/lib/hooks/useEscrowsByIds';
import { EscrowStatus } from '@/lib/hooks/useEscrow';
import { useEscrowStats } from '@/lib/hooks/useEscrowStats';
import { useAddressFeedback } from '@/lib/hooks/useAddressFeedback';
import { TxLifecycleStatus } from '@/components/TxLifecycleStatus';
import { StatCard, EscrowRowItem } from '@/components/EscrowUI';
import { WalletButton } from '@/components/WalletButton';
import { AdminNavLink } from '@/components/AdminNavLink';
import { useTxLifecycle } from '@/lib/hooks/useTxLifecycle';
import { truncate, parseFeedbackRating } from '@/lib/escrowFormat';

const EXPLORER_BASE = botChainTestnet.blockExplorers.default.url;

// react-datepicker's default export is a class component whose `defaultProps` type
// doesn't structurally satisfy next/dynamic's loader signature, hence the double cast.
const DatePicker = dynamic<DatePickerProps>(
  () => import('react-datepicker').then((mod) => mod.default as unknown as ComponentType<DatePickerProps>),
  { ssr: false }
);

interface CreateEscrowFormState {
  workerAddress: string;
  amount: string;
  specText: string;
}

type TouchedState = Partial<Record<keyof CreateEscrowFormState, boolean>> & { deadline?: boolean };

function validateCreateEscrowForm(form: CreateEscrowFormState) {
  const errors: Partial<Record<keyof CreateEscrowFormState, string>> = {};

  if (!form.workerAddress || !isAddress(form.workerAddress)) {
    errors.workerAddress = 'Enter a valid address';
  }

  const amountNum = Number(form.amount);
  if (!form.amount || Number.isNaN(amountNum) || amountNum <= 0) {
    errors.amount = 'Enter an amount greater than 0';
  }

  if (form.specText.trim().length === 0) {
    errors.specText = 'Spec text is required';
  }

  return errors;
}

function EscrowSection({
  title,
  count,
  emptyText,
  children,
  accent,
}: {
  title: string;
  count: number;
  emptyText: string;
  children: ReactNode;
  accent: string;
}) {
  return (
    <section style={{ background: 'rgba(6,10,12,0.58)', border: `1px solid ${accent}`, borderRadius: 18, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '20px 24px', background: 'rgba(255,255,255,0.035)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, color: '#eafff5', marginBottom: 3 }}>
            {title}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#8fb5a8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {count} {count === 1 ? 'escrow' : 'escrows'}
          </div>
        </div>
        <span style={{ width: 13, height: 13, borderRadius: 999, background: accent, boxShadow: `0 0 18px ${accent}` }} />
      </div>
      {count === 0 ? (
        <div style={{ padding: '30px 24px', color: '#a8d4c0', fontSize: 17 }}>
          {emptyText}
        </div>
      ) : (
        <div>{children}</div>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const [tab, setTab] = useState<'client' | 'worker'>('client');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const [form, setForm] = useState<CreateEscrowFormState>({ workerAddress: '', amount: '', specText: '' });
  const [touched, setTouched] = useState<TouchedState>({});
  const [deadlineDate, setDeadlineDate] = useState<Date | null>(null);
  const [supabaseSaveError, setSupabaseSaveError] = useState<string | null>(null);
  const specSaved = useRef(false);

  const errors = validateCreateEscrowForm(form);
  const deadlineValid = deadlineDate !== null && deadlineDate.getTime() > Date.now();
  const isFormValid = Object.keys(errors).length === 0 && deadlineValid;
  // Recomputed each time the modal opens so "now" doesn't go stale across sessions,
  // but stable within a single open modal to avoid reallocating on every keystroke.
  const datePickerMinDate = useMemo(() => new Date(), [modalOpen]);

  const isDeadlineDateToday =
    deadlineDate !== null &&
    deadlineDate.getFullYear() === datePickerMinDate.getFullYear() &&
    deadlineDate.getMonth() === datePickerMinDate.getMonth() &&
    deadlineDate.getDate() === datePickerMinDate.getDate();
  // react-datepicker's minTime/maxTime only constrain the time-of-day *portion* of a date —
  // when today is selected, minTime must be "now" so already-past slots on today are actually
  // unselectable (minDate alone only blocks past calendar days, not past times within today).
  const timeWindow = useMemo(() => {
    if (isDeadlineDateToday) {
      return { minTime: new Date(), maxTime: new Date(new Date().setHours(23, 59, 59, 999)) };
    }
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    return { minTime: startOfDay, maxTime: endOfDay };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-derive fresh "now" bounds whenever the selected day flips today <-> future
  }, [isDeadlineDateToday]);

  const {
    data: clientIdsData,
    isLoading: clientIdsLoading,
    isError: clientIdsError,
    refetch: refetchClientIds,
  } = useClientEscrows(address);
  const {
    data: workerIdsData,
    isLoading: workerIdsLoading,
    isError: workerIdsError,
    refetch: refetchWorkerIds,
  } = useWorkerEscrows(address);

  const clientIds = useMemo(() => (clientIdsData as readonly bigint[] | undefined) ?? [], [clientIdsData]);
  const workerIds = useMemo(() => (workerIdsData as readonly bigint[] | undefined) ?? [], [workerIdsData]);

  const {
    escrows: clientEscrows,
    isLoading: clientEscrowsLoading,
    isError: clientEscrowsError,
    refetch: refetchClientEscrows,
  } = useEscrowsByIds(clientIds);
  const {
    escrows: workerEscrows,
    isLoading: workerEscrowsLoading,
    isError: workerEscrowsError,
    refetch: refetchWorkerEscrows,
  } = useEscrowsByIds(workerIds);

  const { writeContract, data: txHash, isPending: isApproving, error: writeError, reset: resetWrite } = useWriteContract();
  const { txState, receipt, isConfirmed } = useTxLifecycle(txHash, isApproving);

  useEffect(() => {
    if (!isConnected) {
      router.push('/');
    }
  }, [isConnected, router]);

  // Once the createEscrow tx confirms: decode the emitted escrowId, persist the full spec
  // text to Supabase (server-side, so we can verify it hashes to specHash before storing),
  // then refetch on-chain reads so the new escrow shows up without a manual reload.
  useEffect(() => {
    if (!isConfirmed || !receipt || specSaved.current) return;
    specSaved.current = true;

    let escrowId: bigint | undefined;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: SWARM_ESCROW_ABI, data: log.data, topics: log.topics, eventName: 'EscrowCreated' });
        escrowId = decoded.args.escrowId;
        break;
      } catch {
        continue;
      }
    }

    (async () => {
      if (escrowId !== undefined) {
        const specHash = keccak256(toBytes(form.specText));
        try {
          // receipt.transactionHash is the same confirmed hash as `txHash` (useWriteContract's
          // own `data`) above — read off the receipt here since it's already in scope from
          // decoding EscrowCreated, rather than threading a second variable through this effect.
          const res = await fetch('/api/escrow-specs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ escrowId: escrowId.toString(), specText: form.specText, specHash, txHash: receipt.transactionHash }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setSupabaseSaveError(body.error ?? 'Failed to save spec text');
          }
        } catch {
          setSupabaseSaveError("Couldn't reach the server to save spec text");
        }
      }

      refetchClientIds();
      refetchWorkerIds();
      refetchClientEscrows();
      refetchWorkerEscrows();
    })();
  }, [isConfirmed, receipt, form.specText, refetchClientIds, refetchWorkerIds, refetchClientEscrows, refetchWorkerEscrows]);

  const activeEscrows = tab === 'client' ? clientEscrows : workerEscrows;
  const activeIdsLoading = tab === 'client' ? clientIdsLoading || clientEscrowsLoading : workerIdsLoading || workerEscrowsLoading;
  const activeError = tab === 'client' ? clientIdsError || clientEscrowsError : workerIdsError || workerEscrowsError;
  const statsLoading = clientIdsLoading || workerIdsLoading || clientEscrowsLoading || workerEscrowsLoading;
  const statsError = clientIdsError || workerIdsError || clientEscrowsError || workerEscrowsError;

  const filteredData = useMemo(() => {
    const trimmed = search.trim();
    if (trimmed === '') return activeEscrows;
    return activeEscrows.filter((e) => e.id.toString().includes(trimmed));
  }, [activeEscrows, search]);

  const isTerminal = (status: EscrowStatus) => status === EscrowStatus.Resolved || status === EscrowStatus.Refunded;

  const activeTabEscrows = useMemo(() => filteredData.filter((e) => !isTerminal(e.status)), [filteredData]);
  const historyTabEscrows = useMemo(
    () => filteredData.filter((e) => isTerminal(e.status)).sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0)),
    [filteredData]
  );

  const { totalEarned, totalPaidOut, activeCount } = useEscrowStats(clientEscrows, workerEscrows);
  const totalEscrowCount = clientIds.length + workerIds.length;

  const lockedBot = useMemo(
    () =>
      [...clientEscrows, ...workerEscrows]
        .filter((e) => !isTerminal(e.status))
        .reduce((sum, e) => sum + e.amount, BigInt(0)),
    [clientEscrows, workerEscrows]
  );

  const allEscrowIds = useMemo(() => [...clientIds, ...workerIds], [clientIds, workerIds]);
  const rating = useAddressFeedback(address, allEscrowIds);

  // "Received" rows are already scoped to feedback the connected wallet was sent (not sent
  // itself) — for any given escrow that's always the counterparty's rating of the connected
  // wallet's role on that specific escrow, which is exactly the per-card badge below.
  const ratingByEscrowId = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rating.rows) {
      const parsed = parseFeedbackRating(row.text);
      if (parsed !== null) map.set(String(row.escrowId), parsed);
    }
    return map;
  }, [rating.rows]);

  const goToEscrow = (id: bigint) => {
    router.push(`/escrow/${id.toString()}`);
  };

  const closeModal = () => {
    setModalOpen(false);
    setForm({ workerAddress: '', amount: '', specText: '' });
    setTouched({});
    setDeadlineDate(null);
    setSupabaseSaveError(null);
    specSaved.current = false;
    resetWrite();
  };

  const handleFundEscrow = () => {
    if (txState !== 'idle') return;
    setTouched({ workerAddress: true, amount: true, specText: true, deadline: true });
    if (!isFormValid) return;

    const deadlineTimestamp = Math.floor(deadlineDate!.getTime() / 1000);
    const deadline = BigInt(deadlineTimestamp);
    const specHash = keccak256(toBytes(form.specText));

    writeContract({
      ...swarmEscrowConfig,
      functionName: 'createEscrow',
      args: [form.workerAddress as `0x${string}`, specHash, deadline],
      value: parseEther(form.amount),
    });
  };

  return (
    <div style={{ background: '#060a0c', position: 'relative', minHeight: '100vh', fontFamily: "'Sora', sans-serif" }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', height: 300, zIndex: 0 }}>
        <div style={{ position: 'absolute', width: 380, height: 380, borderRadius: '50%', top: -180, left: -80, background: 'radial-gradient(circle, rgba(77,255,184,0.12), transparent 70%)', filter: 'blur(30px)' }} />
        <div style={{ position: 'absolute', width: 340, height: 340, borderRadius: '50%', top: -140, right: -100, background: 'radial-gradient(circle, rgba(77,159,255,0.12), transparent 70%)', filter: 'blur(30px)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, padding: '24px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 44 }}>
          <div onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
            <svg width="38" height="38" viewBox="0 0 28 28">
              <circle cx="14" cy="6" r="3.4" fill="#4dffb8" />
              <circle cx="5" cy="21" r="3.4" fill="#4d9fff" />
              <circle cx="23" cy="21" r="3.4" fill="#4dffb8" />
              <line x1="14" y1="6" x2="5" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
              <line x1="14" y1="6" x2="23" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
              <line x1="5" y1="21" x2="23" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
            </svg>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 21, fontWeight: 700, color: '#eafff5' }}>Swarm Escrow</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <AdminNavLink />
            <WalletButton />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 34 }}>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 30, color: '#eafff5', fontWeight: 700, margin: 0 }}>Dashboard</h1>
          <button onClick={() => setModalOpen(true)} style={{ background: '#4dffb8', color: '#06120c', border: 'none', padding: '15px 28px', borderRadius: 100, fontWeight: 700, fontSize: 17, cursor: 'pointer' }}>
            + Create escrow
          </button>
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
              <StatCard label="Total escrows" value={String(totalEscrowCount)} accent="rgba(255,255,255,0.1)" />
              <StatCard label="Your locked BOT" value={`${formatEther(lockedBot)} BOT`} accent="rgba(77,159,255,0.2)" />
              <StatCard
                label="Rating"
                value={rating.loading ? '...' : rating.count === 0 ? 'No ratings yet' : `${rating.average!.toFixed(1)} ★ (${rating.count})`}
                accent="rgba(77,255,184,0.2)"
              />
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', gap: 5, background: 'rgba(255,255,255,0.04)', borderRadius: 13, padding: 5, width: 'fit-content' }}>
            <button
              onClick={() => setTab('client')}
              style={{ background: tab === 'client' ? '#4dffb8' : 'transparent', color: tab === 'client' ? '#06120c' : '#a8d4c0', border: 'none', padding: '12px 26px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
            >
              As client
            </button>
            <button
              onClick={() => setTab('worker')}
              style={{ background: tab === 'worker' ? '#4dffb8' : 'transparent', color: tab === 'worker' ? '#06120c' : '#a8d4c0', border: 'none', padding: '12px 26px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
            >
              As worker
            </button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by escrow #"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '12px 16px', color: '#eafff5', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, outline: 'none', width: 220 }}
          />
        </div>

        <div>
          {activeIdsLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#8fb5a8', fontSize: 16, background: 'rgba(6,10,12,0.58)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18 }}>Loading escrows...</div>
          ) : activeError ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#ff9a9a', fontSize: 16, background: 'rgba(6,10,12,0.58)', border: '1px solid rgba(255,90,90,0.25)', borderRadius: 18 }}>Couldn&apos;t load escrows from the chain. Try refreshing.</div>
          ) : filteredData.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#a8d4c0', fontSize: 16, background: 'rgba(6,10,12,0.58)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18 }}>No escrows found.</div>
          ) : (
            <div style={{ display: 'grid', gap: 24 }}>
              <EscrowSection title="Active" count={activeTabEscrows.length} emptyText="No active escrows" accent="rgba(77,255,184,0.35)">
                {activeTabEscrows.map((escrow) => (
                  <EscrowRowItem
                    key={escrow.id.toString()}
                    escrow={escrow}
                    counterpartyLabel={tab === 'client' ? `worker ${truncate(escrow.worker)}` : `client ${truncate(escrow.client)}`}
                    onClick={() => goToEscrow(escrow.id)}
                    showStepTracker
                    now={now}
                    actionNeeded={tab === 'client' && escrow.status === EscrowStatus.Created && now > Number(escrow.deadline) * 1000}
                    ratingReceived={ratingByEscrowId.get(escrow.id.toString())}
                  />
                ))}
              </EscrowSection>

              <EscrowSection title="History" count={historyTabEscrows.length} emptyText="No history yet" accent="rgba(77,159,255,0.35)">
                {historyTabEscrows.map((escrow) => (
                  <EscrowRowItem
                    key={escrow.id.toString()}
                    escrow={escrow}
                    counterpartyLabel={tab === 'client' ? `worker ${truncate(escrow.worker)}` : `client ${truncate(escrow.client)}`}
                    onClick={() => goToEscrow(escrow.id)}
                    showStepTracker
                    now={now}
                    ratingReceived={ratingByEscrowId.get(escrow.id.toString())}
                  />
                ))}
              </EscrowSection>
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: '#0a0f0d', border: '1px solid rgba(77,255,184,0.25)', borderRadius: 22, padding: 34, width: 'min(460px, 90vw)', maxWidth: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 26 }}>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, color: '#eafff5', margin: 0 }}>Create escrow</h2>
              {/* Disabled mid-flight: closing here would detach this component's tx-watching
                  effect from the broadcast tx, permanently losing the spec-text Supabase write. */}
              {(txState === 'approve' || txState === 'confirming') ? (
                <span style={{ color: '#3a4a44', fontSize: 24 }}>✕</span>
              ) : (
                <span onClick={closeModal} style={{ color: '#6a8f80', cursor: 'pointer', fontSize: 24 }}>✕</span>
              )}
            </div>

            {txState === 'idle' && (
              <>
                <label style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", display: 'block', marginBottom: 8 }}>Worker address</label>
                <input
                  value={form.workerAddress}
                  onChange={(e) => setForm((f) => ({ ...f, workerAddress: e.target.value }))}
                  onBlur={() => setTouched((t) => ({ ...t, workerAddress: true }))}
                  placeholder="0x..."
                  style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${touched.workerAddress && errors.workerAddress ? '#ff9a9a' : 'rgba(255,255,255,0.12)'}`, borderRadius: 10, padding: '14px 16px', color: '#eafff5', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, outline: 'none', marginBottom: 6, boxSizing: 'border-box' }}
                />
                {touched.workerAddress && errors.workerAddress && (
                  <div style={{ fontSize: 13, color: '#ff9a9a', marginBottom: 14 }}>{errors.workerAddress}</div>
                )}

                <label style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", display: 'block', marginBottom: 8, marginTop: touched.workerAddress && errors.workerAddress ? 0 : 14 }}>Amount (BOT)</label>
                <input
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
                  placeholder="0.00"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${touched.amount && errors.amount ? '#ff9a9a' : 'rgba(255,255,255,0.12)'}`, borderRadius: 10, padding: '14px 16px', color: '#eafff5', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, outline: 'none', marginBottom: 6, boxSizing: 'border-box' }}
                />
                {touched.amount && errors.amount && (
                  <div style={{ fontSize: 13, color: '#ff9a9a', marginBottom: 14 }}>{errors.amount}</div>
                )}

                <label style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", display: 'block', marginBottom: 8, marginTop: touched.amount && errors.amount ? 0 : 14 }}>Deadline</label>
                <DatePicker
                  selected={deadlineDate}
                  onChange={(date: Date | null) => setDeadlineDate(date)}
                  onBlur={() => setTouched((t) => ({ ...t, deadline: true }))}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  dateFormat="MMM d, yyyy 'at' h:mm aa"
                  minDate={datePickerMinDate}
                  minTime={timeWindow.minTime}
                  maxTime={timeWindow.maxTime}
                  placeholderText="Select deadline date & time"
                  className={`swarm-datepicker-input${touched.deadline && !deadlineValid ? ' swarm-datepicker-input--error' : ''}`}
                  wrapperClassName="swarm-datepicker-wrapper"
                  calendarClassName="swarm-datepicker-calendar"
                  popperPlacement="bottom-start"
                />
                {touched.deadline && !deadlineValid && (
                  <div style={{ fontSize: 13, color: '#ff9a9a', marginTop: 6, marginBottom: 10 }}>Select a deadline in the future</div>
                )}
                <div style={{ fontSize: 13, color: '#6a8f80', marginTop: touched.deadline && !deadlineValid ? 0 : 10, marginBottom: 18 }}>
                  Worker must deliver before this date, or you can reclaim funds via reclaimAfterDeadline.
                </div>

                <label style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", display: 'block', marginBottom: 8 }}>Deliverable spec / terms</label>
                <textarea
                  value={form.specText}
                  onChange={(e) => setForm((f) => ({ ...f, specText: e.target.value }))}
                  onBlur={() => setTouched((t) => ({ ...t, specText: true }))}
                  placeholder="Describe what's expected..."
                  style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${touched.specText && errors.specText ? '#ff9a9a' : 'rgba(255,255,255,0.12)'}`, borderRadius: 10, padding: '14px 16px', color: '#eafff5', fontFamily: "'Sora', sans-serif", fontSize: 15, outline: 'none', marginBottom: 6, minHeight: 95, resize: 'none', boxSizing: 'border-box' }}
                />
                {touched.specText && errors.specText && (
                  <div style={{ fontSize: 13, color: '#ff9a9a', marginBottom: 14 }}>{errors.specText}</div>
                )}

                {writeError && (
                  <div style={{ fontSize: 14, color: '#ff9a9a', marginTop: 14, marginBottom: 6 }}>
                    {writeError.message.includes('User rejected') ? 'Transaction rejected in wallet' : 'Transaction failed, try again'}
                  </div>
                )}

                <button
                  onClick={handleFundEscrow}
                  disabled={!isFormValid}
                  style={{ width: '100%', background: isFormValid ? '#4dffb8' : 'rgba(255,255,255,0.06)', color: isFormValid ? '#06120c' : '#4a5550', border: 'none', padding: 16, borderRadius: 100, fontWeight: 700, fontSize: 17, cursor: isFormValid ? 'pointer' : 'not-allowed', marginTop: 18 }}
                >
                  Fund escrow
                </button>
              </>
            )}

            {txState !== 'idle' && (
              <TxLifecycleStatus
                txState={txState}
                txHash={txHash}
                explorerBase={EXPLORER_BASE}
                confirmedLabel="Escrow funded"
                revertedLabel="No escrow was created and no funds moved."
                onClose={closeModal}
                closeLabel="Done"
                confirmedExtra={
                  supabaseSaveError ? (
                    <div style={{ fontSize: 14, color: '#ffb44d', marginBottom: 16 }}>
                      Escrow created on-chain, but the spec text failed to save: {supabaseSaveError}
                    </div>
                  ) : undefined
                }
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
