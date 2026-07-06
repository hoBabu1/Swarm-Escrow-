'use client';

import { useRouter, useParams } from 'next/navigation';
import { useAccount, useWriteContract } from 'wagmi';
import { useState, useEffect, useRef } from 'react';
import { formatEther, keccak256, toBytes } from 'viem';
import { swarmEscrowConfig } from '@/lib/contract';
import { botChainTestnet } from '@/lib/chains';
import { useEscrow, EscrowStatus, escrowExists, parseEscrowTuple, type EscrowStructTuple } from '@/lib/hooks/useEscrow';
import { useAgentVerdicts, AgentRoleName } from '@/lib/hooks/useAgentVerdicts';
import { useHashVerifiedText } from '@/lib/hooks/useHashVerifiedText';
import { useTxLifecycle } from '@/lib/hooks/useTxLifecycle';
import { STATUS_LABELS, truncate, sameAddress, isLikelyAlreadyHandledError } from '@/lib/escrowFormat';
import { computeStepInfo, STEP_LABELS, STEP_COLORS } from '@/lib/stepTracker';
import { TxLifecycleStatus } from '@/components/TxLifecycleStatus';
import { ViewOnChainLink } from '@/components/ViewOnChainLink';
import { WalletButton } from '@/components/WalletButton';
import { AdminNavLink } from '@/components/AdminNavLink';
import { Markdown } from '@/components/Markdown';
import { supabase } from '@/lib/supabase';
import { selectWithTxHashFallback } from '@/lib/selectWithTxHashFallback';

const RATING_PREFIX = /^(\d)\/5\s*(?:—|-)?\s*/;

const EXPLORER_BASE = botChainTestnet.blockExplorers.default.url;

function formatCountdown(ms: number) {
  if (ms <= 0) return '00:00:00';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function BigCountdown({ label, ms }: { label: string; ms: number }) {
  const parts = formatCountdown(ms).split(':');
  return (
    <div style={{ background: 'rgba(6,10,12,0.5)', border: '1px solid rgba(77,159,255,0.25)', borderRadius: 16, padding: 22, marginBottom: 34 }}>
      <div style={{ fontSize: 16, color: '#eafff5', fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', margin: '12px 0' }}>
        {['HH', 'MM', 'SS'].map((unit, idx) => (
          <div key={unit} style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 38, fontWeight: 700, color: '#4d9fff', background: 'rgba(77,159,255,0.08)', padding: '9px 18px', borderRadius: 10, minWidth: 70, textAlign: 'center', display: 'inline-block' }}>
              {parts[idx]}
            </span>
            {idx < 2 && <span style={{ color: '#4d9fff', fontSize: 26 }}>:</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepTracker({ status }: { status: EscrowStatus }) {
  const { currentIndex, isTerminal, labelOverride } = computeStepInfo(status);

  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 44 }}>
      {STEP_LABELS.map((stepLabel, i) => {
        const done = i < currentIndex || isTerminal;
        const current = i === currentIndex && !isTerminal;
        const reached = done || current;
        const phaseColor = STEP_COLORS[i];
        const label = i === 2 && labelOverride ? labelOverride : stepLabel;
        return (
          <div key={stepLabel} style={{ display: 'flex', alignItems: 'center', flex: i < STEP_LABELS.length - 1 ? 1 : 'unset' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: reached ? phaseColor : 'rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: reached ? '#06120c' : '#6a8f80',
                fontSize: 13, fontWeight: 700,
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 12, color: reached ? phaseColor : '#6a8f80', marginTop: 8, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < currentIndex ? phaseColor : 'rgba(255,255,255,0.1)', marginBottom: 22, minWidth: 26 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const VERDICT_REASONING_LIMIT = 100;
const SPEC_LIMIT = 180;

function fetchFeedbackMessage(escrowId: bigint, senderAddress: string) {
  return selectWithTxHashFallback('feedback_messages', { escrow_id: Number(escrowId), sender_address: senderAddress }, 'message_text');
}

function HashMismatchWarning() {
  return (
    <div style={{ background: 'rgba(255,90,90,0.1)', border: '1px solid rgba(255,90,90,0.35)', borderRadius: 10, padding: '11px 14px', fontSize: 13, color: '#ff9a9a', marginBottom: 14 }}>
      ⚠ This text doesn&apos;t match the on-chain hash — it may have been tampered with or corrupted off-chain. Do not trust this content.
    </div>
  );
}

function ReviewingIndicator() {
  return (
    <div>
      <div style={{ display: 'flex', gap: 7, marginBottom: 11 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: i % 2 === 0 ? '#4dffb8' : '#4d9fff',
              display: 'inline-block',
              animation: `swarmPulse 1.2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </div>
      <p style={{ fontSize: 14, color: '#6a8f80', margin: 0 }}>Reviewing...</p>
      <style>{`@keyframes swarmPulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.7); } 40% { opacity: 1; transform: scale(1.15); } }`}</style>
    </div>
  );
}

function FeedbackPanel({
  title,
  hasSubmitted,
  feedback,
  explorerBase,
}: {
  title: string;
  hasSubmitted: boolean;
  feedback: { text: string; txHash: string | null; loading: boolean; error: string | null };
  explorerBase: string;
}) {
  return (
    <div style={{ background: 'rgba(6,10,12,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 22, flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 11, textTransform: 'uppercase' }}>
        {title}
      </div>
      {!hasSubmitted ? (
        <p style={{ fontSize: 15, color: '#6a8f80', margin: 0 }}>Not yet submitted</p>
      ) : feedback.loading ? (
        <p style={{ fontSize: 15, color: '#6a8f80', margin: 0 }}>Loading feedback...</p>
      ) : feedback.error ? (
        <p style={{ fontSize: 15, color: '#ff9a9a', margin: 0 }}>{feedback.error}</p>
      ) : (() => {
        const match = RATING_PREFIX.exec(feedback.text);
        const rating = match ? Number(match[1]) : null;
        const message = match ? feedback.text.slice(match[0].length) : feedback.text;
        return (
          <>
            {rating !== null && (
              <div style={{ marginBottom: 11 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} style={{ fontSize: 20, color: n <= rating ? '#4dffb8' : '#3a4a44' }}>★</span>
                ))}
              </div>
            )}
            <Markdown text={message || 'No message left'} color="#c4dcd0" fontSize={15} lineHeight={1.5} />
            <ViewOnChainLink txHash={feedback.txHash} explorerBase={explorerBase} />
          </>
        );
      })()}
    </div>
  );
}

function VerdictCard({
  agent,
  hasVoted,
  approved,
  reasoning,
  loading,
  fetchError,
  matchesHash,
  txHash,
  explorerBase,
  onShowMore,
  notNeededReason,
  finalBindingLabel,
}: {
  agent: AgentRoleName | 'Senior Arbiter';
  hasVoted: boolean;
  approved: boolean;
  reasoning: string | undefined;
  loading: boolean;
  fetchError: string | null;
  matchesHash: boolean | undefined;
  txHash: string | null | undefined;
  explorerBase: string;
  onShowMore: () => void;
  notNeededReason?: string;
  finalBindingLabel?: boolean;
}) {
  if (!hasVoted) {
    if (notNeededReason) {
      return (
        <div style={{ background: 'rgba(6,10,12,0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 22 }}>
          <div style={{ fontSize: 15, color: '#eafff5', fontWeight: 500, marginBottom: 14 }}>{agent}</div>
          <p style={{ fontSize: 14, color: '#6a8f80', margin: 0 }}>{notNeededReason}</p>
        </div>
      );
    }
    return (
      <div style={{ background: 'rgba(6,10,12,0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 22 }}>
        <div style={{ fontSize: 15, color: '#eafff5', fontWeight: 500, marginBottom: 14 }}>{agent}</div>
        <ReviewingIndicator />
      </div>
    );
  }

  const text = reasoning ?? '';
  const isLong = text.length > VERDICT_REASONING_LIMIT;
  const displayText = isLong ? `${text.slice(0, VERDICT_REASONING_LIMIT)}...` : text;

  return (
    <div style={{ background: 'rgba(6,10,12,0.5)', border: `1px solid ${approved ? 'rgba(77,255,184,0.25)' : 'rgba(255,180,77,0.25)'}`, borderRadius: 16, padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: finalBindingLabel ? 3 : 14 }}>
        <span style={{ fontSize: 15, color: '#eafff5', fontWeight: 500 }}>{agent}</span>
        <span style={{ color: approved ? '#4dffb8' : '#ffb44d', fontSize: 18 }}>{approved ? '✓' : '✕'}</span>
      </div>
      {finalBindingLabel && (
        <div style={{ fontSize: 13, color: 'rgba(255,180,77,0.85)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 14, textTransform: 'uppercase' }}>
          Final binding verdict
        </div>
      )}
      {loading ? (
        <p style={{ fontSize: 14, color: '#6a8f80', margin: 0 }}>Loading reasoning...</p>
      ) : fetchError ? (
        <p style={{ fontSize: 14, color: '#ff9a9a', margin: 0 }}>Couldn&apos;t load reasoning text — {fetchError}</p>
      ) : matchesHash === false ? (
        <HashMismatchWarning />
      ) : (
        <>
          <Markdown text={displayText || 'Reasoning text unavailable'} color="#a8d4c0" fontSize={14} lineHeight={1.5} />
          {isLong && (
            <span
              onClick={onShowMore}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
              style={{ display: 'block', color: '#4d9fff', fontSize: 14, cursor: 'pointer', textDecoration: 'none' }}
            >
              Show more
            </span>
          )}
          <ViewOnChainLink txHash={txHash} explorerBase={explorerBase} />
        </>
      )}
    </div>
  );
}

export default function EscrowDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { address } = useAccount();
  const [now, setNow] = useState(Date.now());
  const [specExpanded, setSpecExpanded] = useState(false);
  const [expandedReasoning, setExpandedReasoning] = useState<{ agent: string; text: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [commitHash, setCommitHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ verified: boolean; fileCount?: number; lastCommitDate?: string; files?: string[]; error?: string } | null>(null);
  const verifyRequestId = useRef(0);

  const [challengeModalOpen, setChallengeModalOpen] = useState(false);
  const [challengeReason, setChallengeReason] = useState('');
  const [challengeSaving, setChallengeSaving] = useState(false);
  const [challengeSubmitError, setChallengeSubmitError] = useState<string | null>(null);

  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackSubmitError, setFeedbackSubmitError] = useState<string | null>(null);

  const [clientToWorkerFeedback, setClientToWorkerFeedback] = useState<{ text: string; txHash: string | null; loading: boolean; error: string | null }>({ text: '', txHash: null, loading: false, error: null });
  const [workerToClientFeedback, setWorkerToClientFeedback] = useState<{ text: string; txHash: string | null; loading: boolean; error: string | null }>({ text: '', txHash: null, loading: false, error: null });

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const isValidId = rawId !== undefined && /^\d+$/.test(rawId);
  const escrowId = isValidId ? BigInt(rawId) : undefined;

  const { escrow, isLoading, isError, refetch } = useEscrow(isValidId ? rawId : undefined);
  const { verdicts, seniorArbiterVote, isLoading: verdictsLoading, isError: verdictsError, refetch: refetchVerdicts } = useAgentVerdicts(escrowId);

  const { writeContract, data: submitTxHash, isPending: isSubmitApproving, error: submitWriteError, reset: resetSubmitWrite } = useWriteContract();
  const { txState, isConfirmed: isSubmitConfirmed } = useTxLifecycle(submitTxHash, isSubmitApproving);

  useEffect(() => {
    if (isSubmitConfirmed) {
      refetch();
      refetchVerdicts();
    }
  }, [isSubmitConfirmed, refetch, refetchVerdicts]);

  const { writeContract: writeChallenge, data: challengeTxHash, isPending: isChallengeApproving, error: challengeWriteError, reset: resetChallengeWrite } = useWriteContract();
  const { txState: challengeTxState, isConfirmed: isChallengeConfirmed } = useTxLifecycle(challengeTxHash, isChallengeApproving);

  const challengeTxHashSaved = useRef(false);
  useEffect(() => {
    if (isChallengeConfirmed) {
      refetch();
      refetchVerdicts();
      if (!challengeTxHashSaved.current && escrowId !== undefined && challengeTxHash) {
        challengeTxHashSaved.current = true;
        fetch('/api/challenge-docs', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ escrowId: escrowId.toString(), txHash: challengeTxHash }),
        }).catch(() => {});
      }
    }
  }, [isChallengeConfirmed, refetch, refetchVerdicts, escrowId, challengeTxHash]);

  const { writeContract: writeFeedback, data: feedbackTxHash, isPending: isFeedbackApproving, error: feedbackWriteError, reset: resetFeedbackWrite } = useWriteContract();
  const { txState: feedbackTxState, isConfirmed: isFeedbackConfirmed } = useTxLifecycle(feedbackTxHash, isFeedbackApproving);

  const feedbackTxHashSaved = useRef(false);
  useEffect(() => {
    if (isFeedbackConfirmed) {
      refetch();
      if (!feedbackTxHashSaved.current && escrowId !== undefined && feedbackTxHash && address) {
        feedbackTxHashSaved.current = true;
        fetch('/api/feedback-messages', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ escrowId: escrowId.toString(), senderAddress: address, txHash: feedbackTxHash }),
        }).catch(() => {});
      }
    }
  }, [isFeedbackConfirmed, refetch, escrowId, feedbackTxHash, address]);

  const { writeContract: writeFinalize, data: finalizeTxHash, isPending: isFinalizeApproving, error: finalizeWriteError, reset: resetFinalizeWrite } = useWriteContract();
  const { txState: finalizeTxState, isConfirmed: isFinalizeConfirmed } = useTxLifecycle(finalizeTxHash, isFinalizeApproving);
  const [finalizeRaceMessage, setFinalizeRaceMessage] = useState<string | null>(null);
  const [isFinalizeSubmitting, setIsFinalizeSubmitting] = useState(false);

  useEffect(() => {
    if (isFinalizeConfirmed) {
      refetch();
    }
  }, [isFinalizeConfirmed, refetch]);

  // reclaimAfterDeadline is client-only (unlike finalize/resolve) — only escrow.client can
  // call it, so the panel that triggers this is only ever rendered for that wallet.
  const { writeContract: writeReclaim, data: reclaimTxHash, isPending: isReclaimApproving, error: reclaimWriteError, reset: resetReclaimWrite } = useWriteContract();
  const { txState: reclaimTxState, isConfirmed: isReclaimConfirmed } = useTxLifecycle(reclaimTxHash, isReclaimApproving);
  const [reclaimRaceMessage, setReclaimRaceMessage] = useState<string | null>(null);
  const [isReclaimSubmitting, setIsReclaimSubmitting] = useState(false);

  useEffect(() => {
    if (isReclaimConfirmed) {
      refetch();
    }
  }, [isReclaimConfirmed, refetch]);

  useEffect(() => {
    if (isLikelyAlreadyHandledError(reclaimWriteError)) {
      setReclaimRaceMessage('Already handled — refreshing latest status');
      refetch();
    }
  }, [reclaimWriteError, refetch]);

  // resolve() is a public function — the oracle calls it automatically moments after the
  // final agent vote lands, but any wallet can trigger it too (e.g. if the oracle is down).
  const { writeContract: writeResolve, data: resolveTxHash, isPending: isResolveApproving, error: resolveWriteError, reset: resetResolveWrite } = useWriteContract();
  const { txState: resolveTxState, isConfirmed: isResolveConfirmed } = useTxLifecycle(resolveTxHash, isResolveApproving);
  const [resolveRaceMessage, setResolveRaceMessage] = useState<string | null>(null);
  const [isResolveSubmitting, setIsResolveSubmitting] = useState(false);

  useEffect(() => {
    if (isResolveConfirmed) {
      refetch();
      refetchVerdicts();
    }
  }, [isResolveConfirmed, refetch, refetchVerdicts]);

  // Both write errors can carry a known "someone already handled this" revert reason (see
  // isLikelyAlreadyHandledError) — surface that as a friendly message and refresh instead of
  // the generic "Transaction failed" text, since this race is expected, not a bug.
  useEffect(() => {
    if (isLikelyAlreadyHandledError(resolveWriteError)) {
      // A failed resolve() can't have changed any verdict, only the escrow's own status —
      // no need to also re-run the verdicts multicall here.
      setResolveRaceMessage('Already handled — refreshing latest status');
      refetch();
    }
  }, [resolveWriteError, refetch]);

  useEffect(() => {
    if (isLikelyAlreadyHandledError(finalizeWriteError)) {
      setFinalizeRaceMessage('Already handled — refreshing latest status');
      refetch();
    }
  }, [finalizeWriteError, refetch]);

  // `now` needs to keep ticking through Created (submission deadline countdown),
  // PendingChallenge (countdown display) and Challenged (no visible countdown yet, but we
  // still need to detect the moment seniorArbiterDeadline passes so the finalize panel
  // appears without a manual refresh).
  const isCountingDown =
    escrow?.status === EscrowStatus.Created ||
    escrow?.status === EscrowStatus.PendingChallenge ||
    escrow?.status === EscrowStatus.Challenged;
  useEffect(() => {
    if (!isCountingDown) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isCountingDown]);

  useEffect(() => {
    if (!expandedReasoning) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedReasoning(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expandedReasoning]);

  const isTerminalStatus = escrow?.status === EscrowStatus.Resolved || escrow?.status === EscrowStatus.Refunded;

  // These two panels are labeled by fixed direction ("Client -> Worker" / "Worker -> Client"),
  // not by the connected wallet's role, so they're fetched by the escrow's actual client/worker
  // addresses rather than by `address`/counterparty — the same two panels render identically
  // no matter who's viewing.
  useEffect(() => {
    if (!isTerminalStatus || !escrow?.hasClientFeedback || !escrow?.client || escrowId === undefined) return;
    let cancelled = false;
    setClientToWorkerFeedback({ text: '', txHash: null, loading: true, error: null });
    (async () => {
      const { data, error } = await fetchFeedbackMessage(escrowId, escrow.client);
      if (cancelled) return;
      if (error) {
        setClientToWorkerFeedback({ text: '', txHash: null, loading: false, error: "Couldn't load this feedback" });
        return;
      }
      setClientToWorkerFeedback({ text: (data?.message_text as string) ?? '', txHash: (data?.tx_hash as string) ?? null, loading: false, error: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [isTerminalStatus, escrow?.hasClientFeedback, escrow?.client, escrowId]);

  useEffect(() => {
    if (!isTerminalStatus || !escrow?.hasWorkerFeedback || !escrow?.worker || escrowId === undefined) return;
    let cancelled = false;
    setWorkerToClientFeedback({ text: '', txHash: null, loading: true, error: null });
    (async () => {
      const { data, error } = await fetchFeedbackMessage(escrowId, escrow.worker);
      if (cancelled) return;
      if (error) {
        setWorkerToClientFeedback({ text: '', txHash: null, loading: false, error: "Couldn't load this feedback" });
        return;
      }
      setWorkerToClientFeedback({ text: (data?.message_text as string) ?? '', txHash: (data?.tx_hash as string) ?? null, loading: false, error: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [isTerminalStatus, escrow?.hasWorkerFeedback, escrow?.worker, escrowId]);

  const specText = useHashVerifiedText({
    table: 'escrow_specs',
    match: escrowId !== undefined ? { escrow_id: Number(escrowId) } : {},
    textColumn: 'spec_text',
    onChainHash: escrow?.specHash,
  });

  const challengeReasonText = useHashVerifiedText({
    table: 'challenge_docs',
    match: escrowId !== undefined ? { escrow_id: Number(escrowId) } : {},
    textColumn: 'document_text',
    onChainHash: escrow?.hasChallenged ? escrow.challengeReasoningHash : undefined,
  });

  const reviewerText = useHashVerifiedText({
    table: 'verdicts',
    match: escrowId !== undefined ? { escrow_id: Number(escrowId), agent_role: 'reviewer' } : {},
    textColumn: 'reasoning_text',
    onChainHash: verdicts[0]?.hasVoted ? verdicts[0].reasoningHash : undefined,
  });
  const fraudSanityText = useHashVerifiedText({
    table: 'verdicts',
    match: escrowId !== undefined ? { escrow_id: Number(escrowId), agent_role: 'fraud_sanity' } : {},
    textColumn: 'reasoning_text',
    onChainHash: verdicts[1]?.hasVoted ? verdicts[1].reasoningHash : undefined,
  });
  const arbiterText = useHashVerifiedText({
    table: 'verdicts',
    match: escrowId !== undefined ? { escrow_id: Number(escrowId), agent_role: 'arbiter' } : {},
    textColumn: 'reasoning_text',
    onChainHash: verdicts[2]?.hasVoted ? verdicts[2].reasoningHash : undefined,
  });
  const seniorArbiterText = useHashVerifiedText({
    table: 'verdicts',
    match: escrowId !== undefined ? { escrow_id: Number(escrowId), agent_role: 'senior_arbiter' } : {},
    textColumn: 'reasoning_text',
    onChainHash: seniorArbiterVote.hasVoted ? seniorArbiterVote.reasoningHash : undefined,
  });

  const verdictTexts = [reviewerText, fraudSanityText, arbiterText];

  if (!isValidId) {
    return (
      <div style={{ background: '#060a0c', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a8d4c0', fontFamily: "'Sora', sans-serif" }}>
        Invalid escrow ID.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ background: '#060a0c', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6a8f80', fontFamily: "'Sora', sans-serif" }}>
        Loading escrow...
      </div>
    );
  }

  if (isError || !escrowExists(escrow)) {
    return (
      <div style={{ background: '#060a0c', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#a8d4c0', fontFamily: "'Sora', sans-serif" }}>
        <div>Escrow not found.</div>
        <div onClick={() => router.push('/dashboard')} style={{ color: '#4d9fff', fontSize: 15, cursor: 'pointer' }}>← Back to dashboard</div>
      </div>
    );
  }

  const escrowData = escrow!;
  const isClient = sameAddress(address, escrowData.client);
  const isWorker = sameAddress(address, escrowData.worker);
  const losingPartyIsClient = escrowData.tentativeApproved;
  const canChallenge =
    escrowData.status === EscrowStatus.PendingChallenge &&
    !escrowData.hasChallenged &&
    now < Number(escrowData.challengeDeadline) * 1000 &&
    ((losingPartyIsClient && isClient) || (!losingPartyIsClient && isWorker));
  const countdownMs = Number(escrowData.challengeDeadline) * 1000 - now;
  // The contract reverts submitDeliverable once block.timestamp > deadline — check client-side
  // so a past-deadline submission surfaces a clear message instead of a wallet-level revert.
  const isPastDeadline = now > Number(escrowData.deadline) * 1000;
  const alreadyLeftFeedback = (isClient && escrowData.hasClientFeedback) || (isWorker && escrowData.hasWorkerFeedback);

  // Neither path has a caller restriction on-chain — anyone can trigger these once the
  // relevant window has actually elapsed, since funds never move automatically on a timer.
  const canFinalizeAfterChallengeWindow =
    escrowData.status === EscrowStatus.PendingChallenge && now > Number(escrowData.challengeDeadline) * 1000;
  const canFinalizeAfterSeniorArbiterTimeout =
    escrowData.status === EscrowStatus.Challenged && now > Number(escrowData.seniorArbiterDeadline) * 1000;

  // reclaimAfterDeadline requires status still Created or DeliverableSubmitted — but the
  // worker can't submit past the deadline (see isPastDeadline above), so in practice only
  // Created applies here. Client-only, unlike every other finalize/resolve path.
  const canReclaimAfterDeadline =
    isClient && escrowData.status === EscrowStatus.Created && now > Number(escrowData.deadline) * 1000;

  // resolve() has no caller restriction either — it just requires 2-of-3 agent consensus to
  // exist. The oracle normally calls it within moments of the deciding vote; this is the
  // manual fallback for anyone connected.
  const approveVoteCount = verdicts.filter((v) => v.hasVoted && v.approved).length;
  const rejectVoteCount = verdicts.filter((v) => v.hasVoted && !v.approved).length;
  const consensusReached = approveVoteCount >= 2 || rejectVoteCount >= 2;
  const canResolve = escrowData.status === EscrowStatus.DeliverableSubmitted && consensusReached;

  const isSpecLong = (specText.text ?? '').length > SPEC_LIMIT;
  const displaySpec = isSpecLong && !specExpanded ? `${(specText.text ?? '').slice(0, SPEC_LIMIT)}...` : specText.text;

  const canSubmitDeliverable = verifyResult !== null && verifyResult.verified === true && txState === 'idle' && !isPastDeadline;

  const handleChallenge = () => {
    setChallengeModalOpen(true);
  };

  const handleLeaveFeedback = () => {
    setFeedbackModalOpen(true);
  };

  const resetChallengeModal = () => {
    setChallengeModalOpen(false);
    setChallengeReason('');
    setChallengeSaving(false);
    setChallengeSubmitError(null);
    resetChallengeWrite();
  };

  const handleSubmitChallenge = async () => {
    if (challengeReason.trim().length === 0 || challengeSaving || challengeTxState !== 'idle' || !address || escrowId === undefined) return;

    setChallengeSubmitError(null);
    setChallengeSaving(true);

    const reasoningHash = keccak256(toBytes(challengeReason));
    try {
      const res = await fetch('/api/challenge-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrowId: escrowId.toString(),
          challengerAddress: address,
          documentText: challengeReason,
          documentHash: reasoningHash,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setChallengeSubmitError(body.error ?? 'Failed to save challenge document');
        setChallengeSaving(false);
        return;
      }
    } catch {
      setChallengeSubmitError("Couldn't reach the server to save the challenge document");
      setChallengeSaving(false);
      return;
    }

    setChallengeSaving(false);
    writeChallenge({
      ...swarmEscrowConfig,
      functionName: 'challenge',
      args: [escrowId, reasoningHash],
    });
  };

  const resetFeedbackModal = () => {
    setFeedbackModalOpen(false);
    setFeedbackRating(0);
    setFeedbackText('');
    setFeedbackSaving(false);
    setFeedbackSubmitError(null);
    resetFeedbackWrite();
  };

  const handleSubmitFeedback = async () => {
    if (feedbackRating === 0 || feedbackSaving || feedbackTxState !== 'idle' || !address || escrowId === undefined) return;

    setFeedbackSubmitError(null);
    setFeedbackSaving(true);

    // The contract has no separate on-chain rating field — the rating is embedded in the
    // hashed text itself, and extracted back out of the Supabase-stored full text for display.
    const combined = `${feedbackRating}/5 — ${feedbackText}`;
    const messageHash = keccak256(toBytes(combined));
    try {
      const res = await fetch('/api/feedback-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrowId: escrowId.toString(),
          senderAddress: address,
          messageText: combined,
          messageHash,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFeedbackSubmitError(body.error ?? 'Failed to save feedback message');
        setFeedbackSaving(false);
        return;
      }
    } catch {
      setFeedbackSubmitError("Couldn't reach the server to save the feedback message");
      setFeedbackSaving(false);
      return;
    }

    setFeedbackSaving(false);
    writeFeedback({
      ...swarmEscrowConfig,
      functionName: 'leaveFeedback',
      args: [escrowId, messageHash],
    });
  };

  const resetSubmitModal = () => {
    verifyRequestId.current += 1;
    setModalOpen(false);
    setRepoUrl('');
    setCommitHash('');
    setVerifyResult(null);
    setVerifying(false);
    resetSubmitWrite();
  };

  const handleRepoUrlChange = (value: string) => {
    setRepoUrl(value);
    setVerifyResult(null);
    verifyRequestId.current += 1;
  };

  const handleCommitHashChange = (value: string) => {
    setCommitHash(value);
    setVerifyResult(null);
    verifyRequestId.current += 1;
  };

  const handleVerifyCommit = async () => {
    const thisRequestId = (verifyRequestId.current += 1);
    setVerifying(true);
    try {
      const res = await fetch('/api/verify-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, commitHash }),
      });
      const data = await res.json();
      if (thisRequestId !== verifyRequestId.current) return;
      setVerifyResult(data);
    } catch {
      if (thisRequestId !== verifyRequestId.current) return;
      setVerifyResult({ verified: false, error: "Couldn't reach GitHub, try again" });
    } finally {
      if (thisRequestId === verifyRequestId.current) setVerifying(false);
    }
  };

  // Re-checks live status right before sending: the oracle (or another wallet) may have
  // already finalized this escrow since the page last rendered. If so, skip the tx entirely
  // rather than let it revert, and just refresh to the current state.
  // `finalizeTxState !== 'idle'` alone doesn't guard against a double-click: it only flips
  // away from 'idle' once writeFinalize is actually called, which is after the `await
  // refetch()` below settles — a second click during that window would pass the same check.
  // isFinalizeSubmitting is set synchronously at entry to close that window.
  const handleFinalize = async () => {
    if (isFinalizeSubmitting || finalizeTxState !== 'idle' || escrowId === undefined) return;
    setIsFinalizeSubmitting(true);
    setFinalizeRaceMessage(null);

    try {
      const fresh = await refetch();
      const freshEscrow = fresh.data ? parseEscrowTuple(fresh.data as EscrowStructTuple) : escrowData;
      const stillPendingChallenge =
        freshEscrow.status === EscrowStatus.PendingChallenge && now > Number(freshEscrow.challengeDeadline) * 1000;
      const stillChallenged =
        freshEscrow.status === EscrowStatus.Challenged && now > Number(freshEscrow.seniorArbiterDeadline) * 1000;

      if (!stillPendingChallenge && !stillChallenged) {
        setFinalizeRaceMessage('This was already resolved — refreshing...');
        return;
      }

      if (stillPendingChallenge) {
        writeFinalize({ ...swarmEscrowConfig, functionName: 'finalizeAfterChallengeWindow', args: [escrowId] });
      } else {
        writeFinalize({ ...swarmEscrowConfig, functionName: 'resolveAfterSeniorArbiterTimeout', args: [escrowId] });
      }
    } finally {
      setIsFinalizeSubmitting(false);
    }
  };

  // Same race-safety pattern (and same reason for isResolveSubmitting) as handleFinalize above.
  const handleResolve = async () => {
    if (isResolveSubmitting || resolveTxState !== 'idle' || escrowId === undefined) return;
    setIsResolveSubmitting(true);
    setResolveRaceMessage(null);

    try {
      const fresh = await refetch();
      const freshEscrow = fresh.data ? parseEscrowTuple(fresh.data as EscrowStructTuple) : escrowData;

      if (freshEscrow.status !== EscrowStatus.DeliverableSubmitted) {
        setResolveRaceMessage('This was already resolved — refreshing...');
        return;
      }

      writeResolve({ ...swarmEscrowConfig, functionName: 'resolve', args: [escrowId] });
    } finally {
      setIsResolveSubmitting(false);
    }
  };

  // Same race-safety pattern as handleFinalize/handleResolve above.
  const handleReclaim = async () => {
    if (isReclaimSubmitting || reclaimTxState !== 'idle' || escrowId === undefined) return;
    setIsReclaimSubmitting(true);
    setReclaimRaceMessage(null);

    try {
      const fresh = await refetch();
      const freshEscrow = fresh.data ? parseEscrowTuple(fresh.data as EscrowStructTuple) : escrowData;
      const stillReclaimable =
        (freshEscrow.status === EscrowStatus.Created || freshEscrow.status === EscrowStatus.DeliverableSubmitted) &&
        now > Number(freshEscrow.deadline) * 1000;

      if (!stillReclaimable) {
        setReclaimRaceMessage('This was already resolved — refreshing...');
        return;
      }

      writeReclaim({ ...swarmEscrowConfig, functionName: 'reclaimAfterDeadline', args: [escrowId] });
    } finally {
      setIsReclaimSubmitting(false);
    }
  };

  const handleSubmitDeliverable = () => {
    if (!canSubmitDeliverable || escrowId === undefined) return;
    writeContract({
      ...swarmEscrowConfig,
      functionName: 'submitDeliverable',
      args: [escrowId, repoUrl, commitHash],
    });
  };

  return (
    <div style={{ background: '#060a0c', position: 'relative', minHeight: '100vh', fontFamily: "'Sora', sans-serif" }}>
      <div style={{ position: 'relative', zIndex: 1, padding: '32px 48px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div onClick={() => router.push('/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: 11, color: '#8fb5a8', fontSize: 15, cursor: 'pointer' }}>
            ← Back to dashboard
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <AdminNavLink />
            <WalletButton />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 38, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, color: '#eafff5', fontWeight: 700, margin: '0 0 8px' }}>
              Escrow #{rawId}
            </h1>
            <div style={{ fontSize: 15, color: '#6a8f80', fontFamily: "'JetBrains Mono', monospace" }}>
              {formatEther(escrowData.amount)} BOT · worker {truncate(escrowData.worker)}
            </div>
          </div>
          <span style={{ background: 'rgba(77,159,255,0.12)', color: '#4d9fff', fontSize: 14, padding: '7px 16px', borderRadius: 100, fontFamily: "'JetBrains Mono', monospace" }}>
            {STATUS_LABELS[escrowData.status]}
          </span>
        </div>

        {escrowData.status === EscrowStatus.Created && (
          <BigCountdown label="Submission ends in" ms={Number(escrowData.deadline) * 1000 - now} />
        )}

        {escrowData.status === EscrowStatus.PendingChallenge && (
          <div style={{ background: 'rgba(6,10,12,0.5)', border: '1px solid rgba(77,159,255,0.25)', borderRadius: 16, padding: 22, marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 11, marginBottom: 6 }}>
              <span style={{ fontSize: 15, color: '#eafff5', fontWeight: 500 }}>Challenge window ends in</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, color: '#4d9fff', fontWeight: 700 }}>{formatCountdown(countdownMs)}</span>
            </div>

            <div style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", marginBottom: canChallenge ? 16 : 0 }}>
              tentative outcome: {escrowData.tentativeApproved ? 'worker paid' : 'client refunded'}
            </div>

            {canChallenge && (
              <button onClick={handleChallenge} style={{ background: 'transparent', color: '#ffb44d', border: '1px solid rgba(255,180,77,0.4)', padding: '13px 24px', borderRadius: 100, fontWeight: 700, fontSize: 15, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Raise challenge
              </button>
            )}
          </div>
        )}

        {escrowData.status === EscrowStatus.Challenged && !canFinalizeAfterSeniorArbiterTimeout && (
          <div style={{ background: 'rgba(255,180,77,0.08)', border: '1px solid rgba(255,180,77,0.3)', borderRadius: 16, padding: 22, marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 11 }}>
              <span style={{ fontSize: 15, color: '#eafff5', fontWeight: 500 }}>Senior Arbiter response ends in</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, color: '#4d9fff', fontWeight: 700 }}>
                {formatCountdown(Number(escrowData.seniorArbiterDeadline) * 1000 - now)}
              </span>
            </div>
          </div>
        )}

        <StepTracker status={escrowData.status} />

        <div style={{ background: 'rgba(6,10,12,0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 22, marginBottom: 44 }}>
          <div style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 11 }}>Deliverable spec</div>
          {specText.loading ? (
            <p style={{ fontSize: 15, color: '#6a8f80', margin: 0 }}>Loading spec...</p>
          ) : specText.error ? (
            <p style={{ fontSize: 15, color: '#ff9a9a', margin: 0 }}>Couldn&apos;t load spec text — {specText.error}</p>
          ) : specText.matchesHash === false ? (
            <HashMismatchWarning />
          ) : (
            <>
              <p style={{ fontSize: 16, color: '#c4dcd0', margin: 0, lineHeight: 1.5 }}>{displaySpec || 'Spec text unavailable'}</p>
              {isSpecLong && (
                <span
                  onClick={() => setSpecExpanded((prev) => !prev)}
                  onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                  style={{ display: 'block', color: '#4d9fff', fontSize: 14, cursor: 'pointer', textDecoration: 'none', marginTop: 11 }}
                >
                  {specExpanded ? 'Show less' : 'Show more'}
                </span>
              )}
              <ViewOnChainLink txHash={specText.txHash} explorerBase={EXPLORER_BASE} />
            </>
          )}
        </div>

        {escrowData.hasChallenged && (
          <div style={{ background: 'rgba(6,10,12,0.5)', border: '1px solid rgba(255,180,77,0.25)', borderRadius: 16, padding: 22, marginBottom: 44 }}>
            <div style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 11 }}>Challenge reason</div>
            {challengeReasonText.loading ? (
              <p style={{ fontSize: 15, color: '#6a8f80', margin: 0 }}>Loading challenge reason...</p>
            ) : challengeReasonText.error ? (
              <p style={{ fontSize: 15, color: '#ff9a9a', margin: 0 }}>Couldn&apos;t load challenge reason — {challengeReasonText.error}</p>
            ) : challengeReasonText.matchesHash === false ? (
              <HashMismatchWarning />
            ) : (
              <>
                <Markdown text={challengeReasonText.text || 'Challenge reason unavailable'} color="#c4dcd0" fontSize={16} lineHeight={1.5} />
                <ViewOnChainLink txHash={challengeReasonText.txHash} explorerBase={EXPLORER_BASE} />
              </>
            )}
          </div>
        )}

        {escrowData.status !== EscrowStatus.Created && (() => {
          const arbiterNotNeeded =
            !verdicts[2]?.hasVoted && !!verdicts[0]?.hasVoted && !!verdicts[1]?.hasVoted && verdicts[0].approved === verdicts[1].approved;
          const showSeniorArbiterCard = escrowData.hasChallenged;
          const cardCount = showSeniorArbiterCard ? 4 : 3;

          return (
            <>
              <div style={{ fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6a8f80', fontFamily: "'JetBrains Mono', monospace", marginBottom: 14 }}>
                {/* The 2-of-3 tally only ever covers Reviewer/FraudSanity/Arbiter — the Senior
                    Arbiter's vote is a separate, overriding decision, not a 4th ballot in the same
                    count, so it's called out on its own rather than folded into "X of Y approve". */}
                Agent verdicts · {verdicts.filter((v) => v.hasVoted && v.approved).length} of {verdicts[2]?.hasVoted ? 3 : 2} approve
                {arbiterNotNeeded && ' · Arbiter not needed (Reviewer and FraudSanity agreed)'}
                {seniorArbiterVote.hasVoted && ` · Senior Arbiter ${seniorArbiterVote.approved ? 'approved' : 'rejected'} (binding, overrides tentative outcome)`}
              </div>
              {verdictsError && (
                <div style={{ background: 'rgba(255,90,90,0.1)', border: '1px solid rgba(255,90,90,0.35)', borderRadius: 10, padding: '14px 16px', fontSize: 14, color: '#ff9a9a', marginBottom: 16 }}>
                  Couldn&apos;t read agent verdicts from the chain — the panel below may not reflect real votes yet. Try refreshing.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cardCount}, 1fr)`, gap: 16, marginBottom: 44 }}>
                {verdicts.map((v, i) => (
                  <VerdictCard
                    key={v.agent}
                    agent={v.agent}
                    hasVoted={v.hasVoted}
                    approved={v.approved}
                    reasoning={verdictTexts[i].text}
                    loading={verdictsLoading || verdictTexts[i].loading}
                    fetchError={verdictTexts[i].error}
                    matchesHash={verdictTexts[i].matchesHash}
                    txHash={verdictTexts[i].txHash}
                    explorerBase={EXPLORER_BASE}
                    onShowMore={() => setExpandedReasoning({ agent: v.agent, text: verdictTexts[i].text ?? '' })}
                    notNeededReason={
                      i === 2 && arbiterNotNeeded
                        ? 'Not needed — Reviewer and FraudSanity agreed'
                        : !v.hasVoted && isTerminalStatus
                        ? 'No verdict recorded — escrow resolved without this vote'
                        : undefined
                    }
                  />
                ))}
                {showSeniorArbiterCard && (
                  <VerdictCard
                    agent="Senior Arbiter"
                    hasVoted={seniorArbiterVote.hasVoted}
                    approved={seniorArbiterVote.approved}
                    reasoning={seniorArbiterText.text}
                    loading={verdictsLoading || seniorArbiterText.loading}
                    fetchError={seniorArbiterText.error}
                    matchesHash={seniorArbiterText.matchesHash}
                    txHash={seniorArbiterText.txHash}
                    explorerBase={EXPLORER_BASE}
                    onShowMore={() => setExpandedReasoning({ agent: 'Senior Arbiter', text: seniorArbiterText.text ?? '' })}
                    notNeededReason={
                      !seniorArbiterVote.hasVoted && isTerminalStatus
                        ? 'No verdict recorded — escrow resolved without this vote'
                        : undefined
                    }
                    finalBindingLabel
                  />
                )}
              </div>
            </>
          );
        })()}

        {isWorker && escrowData.status === EscrowStatus.Created && (
          <div style={{ background: 'rgba(6,10,12,0.5)', border: '1px solid rgba(77,255,184,0.25)', borderRadius: 16, padding: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
            <div>
              <div style={{ fontSize: 15, color: '#eafff5', fontWeight: 500, marginBottom: 6 }}>You&apos;re assigned as worker</div>
              <div style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace" }}>Submit your finished repo to move this escrow into review.</div>
            </div>
            <button onClick={() => setModalOpen(true)} style={{ background: '#4dffb8', color: '#06120c', border: 'none', padding: '14px 28px', borderRadius: 100, fontWeight: 700, fontSize: 16, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Submit deliverable
            </button>
          </div>
        )}

        {canResolve && (
          <div style={{ background: 'rgba(6,10,12,0.5)', border: '1px solid rgba(77,159,255,0.25)', borderRadius: 16, padding: 22, marginBottom: 44 }}>
            {resolveTxState === 'idle' ? (
              <>
                <div style={{ fontSize: 15, color: '#eafff5', fontWeight: 500, marginBottom: 6 }}>
                  All agents have voted — ready to resolve
                </div>
                <div style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 16 }}>
                  This usually happens automatically within moments — use this only if it&apos;s been a while. Anyone can trigger it.
                </div>
                {resolveRaceMessage && (
                  <div style={{ fontSize: 14, color: '#4d9fff', marginBottom: 16 }}>{resolveRaceMessage}</div>
                )}
                {resolveWriteError && !isLikelyAlreadyHandledError(resolveWriteError) && (
                  <div style={{ fontSize: 14, color: '#ff9a9a', marginBottom: 16 }}>
                    {resolveWriteError.message.includes('User rejected') ? 'Transaction rejected in wallet' : 'Transaction failed, try again'}
                  </div>
                )}
                <button
                  onClick={handleResolve}
                  disabled={isResolveSubmitting}
                  style={{
                    background: isResolveSubmitting ? 'rgba(77,159,255,0.3)' : '#4d9fff',
                    color: '#03101f', border: 'none', padding: '14px 28px', borderRadius: 100, fontWeight: 700, fontSize: 16,
                    cursor: isResolveSubmitting ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {isResolveSubmitting ? 'Checking status...' : 'Resolve escrow'}
                </button>
              </>
            ) : (
              <TxLifecycleStatus
                txState={resolveTxState}
                txHash={resolveTxHash}
                explorerBase={EXPLORER_BASE}
                confirmedLabel="Escrow resolved"
                revertedLabel="No consensus was recorded."
                onClose={() => { setResolveRaceMessage(null); resetResolveWrite(); }}
              />
            )}
          </div>
        )}

        {(canFinalizeAfterChallengeWindow || canFinalizeAfterSeniorArbiterTimeout) && (
          <div style={{ background: 'rgba(6,10,12,0.5)', border: '1px solid rgba(77,255,184,0.25)', borderRadius: 16, padding: 22, marginBottom: 44 }}>
            {finalizeTxState === 'idle' ? (
              <>
                <div style={{ fontSize: 15, color: '#eafff5', fontWeight: 500, marginBottom: 6 }}>
                  {canFinalizeAfterChallengeWindow ? 'Challenge window closed — ready to finalize' : 'Senior Arbiter response window closed — ready to finalize'}
                </div>
                <div style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 16 }}>
                  This usually happens automatically within moments — use this only if it&apos;s been a while. Anyone can trigger it; funds don&apos;t move automatically once the window closes.
                </div>
                {finalizeRaceMessage && (
                  <div style={{ fontSize: 14, color: '#4d9fff', marginBottom: 16 }}>{finalizeRaceMessage}</div>
                )}
                {finalizeWriteError && !isLikelyAlreadyHandledError(finalizeWriteError) && (
                  <div style={{ fontSize: 14, color: '#ff9a9a', marginBottom: 16 }}>
                    {finalizeWriteError.message.includes('User rejected') ? 'Transaction rejected in wallet' : 'Transaction failed, try again'}
                  </div>
                )}
                <button
                  onClick={handleFinalize}
                  disabled={isFinalizeSubmitting}
                  style={{
                    background: isFinalizeSubmitting ? 'rgba(77,255,184,0.3)' : '#4dffb8',
                    color: '#06120c', border: 'none', padding: '14px 28px', borderRadius: 100, fontWeight: 700, fontSize: 16,
                    cursor: isFinalizeSubmitting ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {isFinalizeSubmitting ? 'Checking status...' : 'Finalize payout'}
                </button>
              </>
            ) : (
              <TxLifecycleStatus
                txState={finalizeTxState}
                txHash={finalizeTxHash}
                explorerBase={EXPLORER_BASE}
                confirmedLabel="Escrow finalized"
                revertedLabel="No funds were moved."
                onClose={() => { setFinalizeRaceMessage(null); resetFinalizeWrite(); }}
              />
            )}
          </div>
        )}

        {canReclaimAfterDeadline && (
          <div style={{ background: 'rgba(255,180,77,0.08)', border: '1px solid rgba(255,180,77,0.3)', borderRadius: 16, padding: 22, marginBottom: 44 }}>
            {reclaimTxState === 'idle' ? (
              <>
                <div style={{ fontSize: 15, color: '#eafff5', fontWeight: 500, marginBottom: 6 }}>
                  Worker missed the deadline
                </div>
                <div style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 16 }}>
                  The worker never submitted a deliverable before the deadline. You can reclaim your full deposit.
                </div>
                {reclaimRaceMessage && (
                  <div style={{ fontSize: 14, color: '#4d9fff', marginBottom: 16 }}>{reclaimRaceMessage}</div>
                )}
                {reclaimWriteError && !isLikelyAlreadyHandledError(reclaimWriteError) && (
                  <div style={{ fontSize: 14, color: '#ff9a9a', marginBottom: 16 }}>
                    {reclaimWriteError.message.includes('User rejected') ? 'Transaction rejected in wallet' : 'Transaction failed, try again'}
                  </div>
                )}
                <button
                  onClick={handleReclaim}
                  disabled={isReclaimSubmitting}
                  style={{
                    background: isReclaimSubmitting ? 'rgba(255,180,77,0.3)' : '#ffb44d',
                    color: '#2b1a03', border: 'none', padding: '14px 28px', borderRadius: 100, fontWeight: 700, fontSize: 16,
                    cursor: isReclaimSubmitting ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {isReclaimSubmitting ? 'Checking status...' : 'Reclaim funds'}
                </button>
              </>
            ) : (
              <TxLifecycleStatus
                txState={reclaimTxState}
                txHash={reclaimTxHash}
                explorerBase={EXPLORER_BASE}
                confirmedLabel="Funds reclaimed"
                revertedLabel="No funds were moved."
                onClose={() => { setReclaimRaceMessage(null); resetReclaimWrite(); }}
              />
            )}
          </div>
        )}

        {(escrowData.status === EscrowStatus.Resolved || escrowData.status === EscrowStatus.Refunded) && (isClient || isWorker) && (
          <div style={{ background: 'rgba(6,10,12,0.5)', border: '1px solid rgba(77,255,184,0.25)', borderRadius: 16, padding: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ fontSize: 15, color: '#eafff5', fontWeight: 500 }}>Escrow {escrowData.status === EscrowStatus.Resolved ? 'resolved' : 'refunded'}</div>
            {!alreadyLeftFeedback && (
              <button onClick={handleLeaveFeedback} style={{ background: '#4dffb8', color: '#06120c', border: 'none', padding: '13px 24px', borderRadius: 100, fontWeight: 700, fontSize: 15, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Leave feedback
              </button>
            )}
          </div>
        )}

        {isTerminalStatus && (isClient || isWorker) && (
          <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
            <FeedbackPanel title="Client → Worker" hasSubmitted={!!escrowData.hasClientFeedback} feedback={clientToWorkerFeedback} explorerBase={EXPLORER_BASE} />
            <FeedbackPanel title="Worker → Client" hasSubmitted={!!escrowData.hasWorkerFeedback} feedback={workerToClientFeedback} explorerBase={EXPLORER_BASE} />
          </div>
        )}

        {modalOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: 16 }}>
            <div style={{ background: '#0a1210', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, color: '#eafff5', fontWeight: 700, margin: 0 }}>Submit deliverable</h2>
                {/* Disabled mid-flight: closing here would detach the tx watcher before the
                    on-chain result is known, leaving the UI unable to reflect a broadcast tx. */}
                {(txState === 'approve' || txState === 'confirming') ? (
                  <span style={{ color: '#3a4a44', fontSize: 20, lineHeight: 1 }}>✕</span>
                ) : (
                  <span onClick={resetSubmitModal} style={{ color: '#6a8f80', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</span>
                )}
              </div>

              {txState === 'idle' && (
                <>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>Repo URL</div>
                    <input
                      value={repoUrl}
                      onChange={(e) => handleRepoUrlChange(e.target.value)}
                      disabled={verifying}
                      placeholder="https://github.com/owner/repo"
                      style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '14px', color: '#eafff5', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>Commit SHA</div>
                    <input
                      value={commitHash}
                      onChange={(e) => handleCommitHashChange(e.target.value)}
                      disabled={verifying}
                      placeholder="a1b2c3d..."
                      style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '14px', color: '#eafff5', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  <button
                    onClick={handleVerifyCommit}
                    disabled={verifying || !repoUrl || !commitHash}
                    style={{
                      width: '100%', border: 'none', padding: '14px 22px', borderRadius: 100, fontWeight: 700, fontSize: 15, marginBottom: 22,
                      background: verifying || !repoUrl || !commitHash ? 'rgba(255,255,255,0.06)' : '#4d9fff',
                      color: verifying || !repoUrl || !commitHash ? '#4a5550' : '#03101f',
                      cursor: verifying || !repoUrl || !commitHash ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {verifying ? 'Verifying...' : 'Verify commit'}
                  </button>

                  {verifyResult && verifyResult.verified && (
                    <div style={{ background: 'rgba(77,255,184,0.06)', border: '1px solid rgba(77,255,184,0.25)', borderRadius: 16, padding: 20, marginBottom: 22 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 11 }}>
                        <span style={{ color: '#4dffb8', fontSize: 18 }}>✓</span>
                        <span style={{ fontSize: 15, color: '#eafff5', fontWeight: 500 }}>Commit verified</span>
                      </div>
                      <div style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 14 }}>
                        {verifyResult.fileCount} files · last commit {verifyResult.lastCommitDate ? new Date(verifyResult.lastCommitDate).toLocaleString() : 'unknown'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(verifyResult.files ?? []).map((f) => (
                          <span key={f} style={{ fontSize: 13, color: '#a8d4c0', fontFamily: "'JetBrains Mono', monospace" }}>{f}</span>
                        ))}
                        {(verifyResult.fileCount ?? 0) > (verifyResult.files?.length ?? 0) && (
                          <span style={{ fontSize: 13, color: '#6a8f80', fontFamily: "'JetBrains Mono', monospace" }}>
                            +{(verifyResult.fileCount ?? 0) - (verifyResult.files?.length ?? 0)} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {verifyResult && !verifyResult.verified && (
                    <div style={{ background: 'rgba(255,180,77,0.08)', border: '1px solid rgba(255,180,77,0.3)', borderRadius: 16, padding: 20, marginBottom: 22 }}>
                      <div style={{ fontSize: 15, color: '#ffb44d', marginBottom: 11 }}>{verifyResult.error}</div>
                      <span
                        onClick={() => setVerifyResult(null)}
                        style={{ fontSize: 14, color: '#4d9fff', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Try again
                      </span>
                    </div>
                  )}

                  {isPastDeadline && (
                    <div style={{ fontSize: 14, color: '#ffb44d', marginBottom: 16 }}>
                      This escrow&apos;s deadline has passed — the contract no longer accepts a deliverable submission.
                    </div>
                  )}

                  {submitWriteError && (
                    <div style={{ fontSize: 14, color: '#ff9a9a', marginBottom: 16 }}>
                      {submitWriteError.message.includes('User rejected') ? 'Transaction rejected in wallet' : 'Transaction failed, try again'}
                    </div>
                  )}

                  <button
                    onClick={handleSubmitDeliverable}
                    disabled={!canSubmitDeliverable}
                    style={{
                      width: '100%', border: 'none', padding: '17px 22px', borderRadius: 100, fontWeight: 700, fontSize: 17,
                      background: canSubmitDeliverable ? '#4dffb8' : 'rgba(255,255,255,0.06)',
                      color: canSubmitDeliverable ? '#06120c' : '#4a5550',
                      cursor: canSubmitDeliverable ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {isPastDeadline ? 'Deadline passed' : canSubmitDeliverable ? 'Submit deliverable' : 'Verify before submitting'}
                  </button>
                </>
              )}

              {txState !== 'idle' && (
                <TxLifecycleStatus
                  txState={txState}
                  txHash={submitTxHash}
                  explorerBase={EXPLORER_BASE}
                  confirmedLabel="Deliverable submitted"
                  revertedLabel="The deliverable was not recorded."
                  onClose={resetSubmitModal}
                />
              )}
            </div>
          </div>
        )}

        {challengeModalOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
            <div style={{ background: '#0a0f0d', border: '1px solid rgba(255,180,77,0.25)', borderRadius: 20, padding: 32, width: 440, maxWidth: '90%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
                <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, color: '#eafff5', margin: 0 }}>Raise challenge</h2>
                {/* Disabled mid-flight: closing here would detach the tx watcher (and, while
                    saving, abandon the Supabase write) before the outcome is known. */}
                {(challengeSaving || challengeTxState === 'approve' || challengeTxState === 'confirming') ? (
                  <span style={{ color: '#3a4a44', fontSize: 22, lineHeight: 1 }}>✕</span>
                ) : (
                  <span onClick={resetChallengeModal} style={{ color: '#6a8f80', cursor: 'pointer', fontSize: 22 }}>✕</span>
                )}
              </div>

              {challengeTxState === 'idle' && !challengeSaving && (
                <>
                  <div style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 20, lineHeight: 1.5 }}>
                    This escalates escrow #{rawId} to the Senior Arbiter for a final, binding verdict. One-time only.
                  </div>
                  <label style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", display: 'block', marginBottom: 8 }}>Reason for challenge</label>
                  <textarea
                    value={challengeReason}
                    onChange={(e) => setChallengeReason(e.target.value.slice(0, 500))}
                    maxLength={500}
                    placeholder="Explain why the tentative outcome is incorrect..."
                    style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '14px', color: '#eafff5', fontFamily: "'Sora', sans-serif", fontSize: 15, outline: 'none', minHeight: 120, resize: 'none', boxSizing: 'border-box', marginBottom: 8 }}
                  />
                  <div style={{ textAlign: 'right', fontSize: 13, color: '#6a8f80', fontFamily: "'JetBrains Mono', monospace", marginBottom: 20 }}>
                    {challengeReason.length}/500
                  </div>
                  {challengeSubmitError && (
                    <div style={{ fontSize: 14, color: '#ff9a9a', marginBottom: 16 }}>{challengeSubmitError}</div>
                  )}
                  {challengeWriteError && (
                    <div style={{ fontSize: 14, color: '#ff9a9a', marginBottom: 16 }}>
                      {challengeWriteError.message.includes('User rejected') ? 'Transaction rejected in wallet' : 'Transaction failed, try again'}
                    </div>
                  )}
                  <button
                    disabled={challengeReason.trim().length === 0}
                    onClick={handleSubmitChallenge}
                    style={{ width: '100%', background: 'transparent', color: challengeReason.trim().length === 0 ? '#5a4a3a' : '#ffb44d', border: `1px solid ${challengeReason.trim().length === 0 ? 'rgba(255,180,77,0.15)' : 'rgba(255,180,77,0.4)'}`, padding: 15, borderRadius: 100, fontWeight: 700, fontSize: 16, cursor: challengeReason.trim().length === 0 ? 'not-allowed' : 'pointer' }}
                  >
                    Submit challenge
                  </button>
                </>
              )}

              {challengeSaving && (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{ width: 36, height: 36, border: '3px solid rgba(255,180,77,0.25)', borderTopColor: '#ffb44d', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
                  <div style={{ fontSize: 16, color: '#eafff5' }}>Saving challenge document</div>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}

              {!challengeSaving && challengeTxState !== 'idle' && (
                <TxLifecycleStatus
                  txState={challengeTxState}
                  txHash={challengeTxHash}
                  explorerBase={EXPLORER_BASE}
                  confirmedLabel="Challenge submitted"
                  revertedLabel="The challenge was not recorded."
                  onClose={resetChallengeModal}
                />
              )}
            </div>
          </div>
        )}

        {feedbackModalOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
            <div style={{ background: '#0a0f0d', border: '1px solid rgba(77,255,184,0.25)', borderRadius: 20, padding: 32, width: 440, maxWidth: '90%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
                <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, color: '#eafff5', margin: 0 }}>Leave feedback</h2>
                {(feedbackSaving || feedbackTxState === 'approve' || feedbackTxState === 'confirming') ? (
                  <span style={{ color: '#3a4a44', fontSize: 22, lineHeight: 1 }}>✕</span>
                ) : (
                  <span onClick={resetFeedbackModal} style={{ color: '#6a8f80', cursor: 'pointer', fontSize: 22 }}>✕</span>
                )}
              </div>

              {feedbackTxState === 'idle' && !feedbackSaving && (
                <>
                  <div style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 20 }}>
                    For {isClient ? 'worker' : 'client'} {truncate(isClient ? escrowData.worker : escrowData.client)} · escrow #{rawId}
                  </div>
                  <label style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", display: 'block', marginBottom: 11 }}>Rating</label>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} onClick={() => setFeedbackRating(n)} style={{ fontSize: 28, color: n <= feedbackRating ? '#4dffb8' : '#3a4a44', cursor: 'pointer' }}>★</span>
                    ))}
                  </div>
                  <label style={{ fontSize: 14, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", display: 'block', marginBottom: 8 }}>Message</label>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value.slice(0, 500))}
                    maxLength={500}
                    placeholder="Share your experience working together..."
                    style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '14px', color: '#eafff5', fontFamily: "'Sora', sans-serif", fontSize: 15, outline: 'none', minHeight: 110, resize: 'none', boxSizing: 'border-box', marginBottom: 8 }}
                  />
                  <div style={{ textAlign: 'right', fontSize: 13, color: '#6a8f80', fontFamily: "'JetBrains Mono', monospace", marginBottom: 20 }}>
                    {feedbackText.length}/500
                  </div>
                  {feedbackSubmitError && (
                    <div style={{ fontSize: 14, color: '#ff9a9a', marginBottom: 16 }}>{feedbackSubmitError}</div>
                  )}
                  {feedbackWriteError && (
                    <div style={{ fontSize: 14, color: '#ff9a9a', marginBottom: 16 }}>
                      {feedbackWriteError.message.includes('User rejected') ? 'Transaction rejected in wallet' : 'Transaction failed, try again'}
                    </div>
                  )}
                  <button
                    disabled={feedbackRating === 0}
                    onClick={handleSubmitFeedback}
                    style={{ width: '100%', background: feedbackRating === 0 ? 'rgba(255,255,255,0.04)' : '#4dffb8', color: feedbackRating === 0 ? '#4a5550' : '#06120c', border: 'none', padding: 15, borderRadius: 100, fontWeight: 700, fontSize: 16, cursor: feedbackRating === 0 ? 'not-allowed' : 'pointer' }}
                  >
                    Submit feedback
                  </button>
                </>
              )}

              {feedbackSaving && (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{ width: 36, height: 36, border: '3px solid rgba(77,255,184,0.25)', borderTopColor: '#4dffb8', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
                  <div style={{ fontSize: 16, color: '#eafff5' }}>Saving feedback message</div>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}

              {!feedbackSaving && feedbackTxState !== 'idle' && (
                <TxLifecycleStatus
                  txState={feedbackTxState}
                  txHash={feedbackTxHash}
                  explorerBase={EXPLORER_BASE}
                  confirmedLabel="Feedback submitted"
                  revertedLabel="The feedback was not recorded."
                  onClose={resetFeedbackModal}
                />
              )}
            </div>
          </div>
        )}

        {expandedReasoning && (
          <div
            onClick={() => setExpandedReasoning(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: '#0a0f0d', border: '1px solid rgba(77,255,184,0.25)', borderRadius: 20, padding: 32, width: 640, maxWidth: '90%', maxHeight: '80vh', overflowY: 'auto' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
                <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, color: '#eafff5', margin: 0 }}>{expandedReasoning.agent}&apos;s reasoning</h2>
                <span onClick={() => setExpandedReasoning(null)} style={{ color: '#6a8f80', cursor: 'pointer', fontSize: 22 }}>✕</span>
              </div>
              <Markdown text={expandedReasoning.text} color="#c4dcd0" fontSize={16} lineHeight={1.7} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
