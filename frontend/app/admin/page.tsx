'use client';

import { useAccount, useBlock, useReadContracts, useWriteContract } from 'wagmi';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { isAddress } from 'viem';
import { swarmEscrowConfig } from '@/lib/contract';
import { botChainTestnet } from '@/lib/chains';
import { EscrowStatus } from '@/lib/hooks/useEscrow';
import { useEscrowsByIds, EscrowWithId } from '@/lib/hooks/useEscrowsByIds';
import { useTxLifecycle } from '@/lib/hooks/useTxLifecycle';
import { STATUS_LABELS, truncate, sameAddress } from '@/lib/escrowFormat';
import { TxLifecycleStatus } from '@/components/TxLifecycleStatus';
import { StatusPill } from '@/components/EscrowUI';

const EXPLORER_BASE = botChainTestnet.blockExplorers.default.url;

type RescueState = 'terminal' | 'locked' | 'available';

/** Mirrors the contract's own per-status deadline selection (deadline / challengeDeadline /
 * seniorArbiterDeadline) so the UI's "rescue available" gating matches emergencyRescue's real
 * require() condition exactly. */
function relevantDeadline(escrow: EscrowWithId): bigint {
  switch (escrow.status) {
    case EscrowStatus.PendingChallenge:
      return escrow.challengeDeadline;
    case EscrowStatus.Challenged:
      return escrow.seniorArbiterDeadline;
    default:
      return escrow.deadline;
  }
}

function computeRescueState(escrow: EscrowWithId, blockTimestamp: bigint | undefined, emergencyDelay: bigint | undefined): RescueState {
  if (escrow.status === EscrowStatus.Resolved || escrow.status === EscrowStatus.Refunded) return 'terminal';
  if (blockTimestamp === undefined || emergencyDelay === undefined) return 'locked';
  return blockTimestamp > relevantDeadline(escrow) + emergencyDelay ? 'available' : 'locked';
}

type SetterFn = 'setChallengeWindow' | 'setSeniorArbiterWindow' | 'setEmergencyDelay' | 'setOracleAddress';

function validateParamValue(fn: SetterFn, value: string): string | null {
  if (fn === 'setOracleAddress') {
    return isAddress(value) ? null : 'Enter a valid address';
  }
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? null : 'Enter a positive whole number';
}

function ParamField({ label, fn, currentValue, onConfirmed }: { label: string; fn: SetterFn; currentValue: string | undefined; onConfirmed: () => void }) {
  // null = user hasn't typed in this field yet — display currentValue as it arrives from the
  // chain. Once the user types, their input always wins; we never resync over it via an effect.
  const [userValue, setUserValue] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const value = userValue ?? currentValue ?? '';

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
  const { txState, isConfirmed } = useTxLifecycle(txHash, isPending);

  useEffect(() => {
    if (isConfirmed) onConfirmed();
  }, [isConfirmed, onConfirmed]);

  const error = touched ? validateParamValue(fn, value) : null;

  const handleUpdate = () => {
    setTouched(true);
    if (validateParamValue(fn, value) !== null) return;
    writeContract({
      ...swarmEscrowConfig,
      functionName: fn,
      args: fn === 'setOracleAddress' ? [value as `0x${string}`] : [BigInt(value)],
    });
  };

  const busy = txState === 'approve' || txState === 'confirming';

  return (
    <div style={{ background: 'rgba(6,10,12,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={value}
          onChange={(e) => {
            setUserValue(e.target.value);
            // Only reset a finished (confirmed/reverted) write once, on the keystroke that
            // starts a fresh edit — not on every keystroke, which would call wagmi's reset()
            // far more than needed since it's already a no-op once txState is back to idle.
            if (txState !== 'idle') reset();
          }}
          onBlur={() => setTouched(true)}
          disabled={busy}
          style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${error ? '#ff9a9a' : 'rgba(255,255,255,0.12)'}`, borderRadius: 8, padding: '8px 10px', color: '#eafff5', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, outline: 'none', minWidth: 0 }}
        />
        <button
          onClick={handleUpdate}
          disabled={busy}
          style={{ background: busy ? 'rgba(255,255,255,0.08)' : '#4dffb8', color: busy ? '#4a5550' : '#06120c', border: 'none', padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
        >
          {txState === 'approve' ? 'Approve...' : txState === 'confirming' ? 'Confirming...' : 'Update'}
        </button>
      </div>
      {error && <div style={{ fontSize: 10, color: '#ff9a9a', marginTop: 6 }}>{error}</div>}
      {writeError && !error && (
        <div style={{ fontSize: 10, color: '#ff9a9a', marginTop: 6 }}>
          {writeError.message.includes('User rejected') ? 'Transaction rejected in wallet' : 'Transaction failed, try again'}
        </div>
      )}
      {txState === 'reverted' && <div style={{ fontSize: 10, color: '#ff9a9a', marginTop: 6 }}>Transaction reverted on-chain</div>}
      {isConfirmed && <div style={{ fontSize: 10, color: '#4dffb8', marginTop: 6 }}>Updated</div>}
    </div>
  );
}

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();

  // All 6 of these are static/rarely-changing contract params — one multicall instead of
  // six separate RPC round-trips.
  const { data: adminReadsData, refetch: refetchAdminReads } = useReadContracts({
    contracts: [
      { ...swarmEscrowConfig, functionName: 'owner' },
      { ...swarmEscrowConfig, functionName: 'escrowCounter' },
      { ...swarmEscrowConfig, functionName: 'challengeWindow' },
      { ...swarmEscrowConfig, functionName: 'seniorArbiterWindow' },
      { ...swarmEscrowConfig, functionName: 'emergencyDelay' },
      { ...swarmEscrowConfig, functionName: 'oracleAddress' },
    ],
  });

  const ownerData = adminReadsData?.[0]?.status === 'success' ? adminReadsData[0].result : undefined;
  const escrowCounterData = adminReadsData?.[1]?.status === 'success' ? adminReadsData[1].result : undefined;
  const challengeWindowData = adminReadsData?.[2]?.status === 'success' ? adminReadsData[2].result : undefined;
  const seniorArbiterWindowData = adminReadsData?.[3]?.status === 'success' ? adminReadsData[3].result : undefined;
  const emergencyDelayData = adminReadsData?.[4]?.status === 'success' ? adminReadsData[4].result : undefined;
  const oracleAddressData = adminReadsData?.[5]?.status === 'success' ? adminReadsData[5].result : undefined;

  const owner = ownerData as `0x${string}` | undefined;
  const ownerResolved = owner !== undefined;
  const isOwner = ownerResolved && sameAddress(address, owner);

  useEffect(() => {
    if (isConnected && ownerResolved && !isOwner) {
      router.push('/');
    }
  }, [isConnected, ownerResolved, isOwner, router]);

  const escrowCount = escrowCounterData !== undefined ? Number(escrowCounterData as bigint) : 0;
  const allIds = useMemo(() => Array.from({ length: escrowCount }, (_, i) => BigInt(i)), [escrowCount]);
  const { escrows, refetch: refetchEscrows } = useEscrowsByIds(allIds);

  // Rescue gating only needs a rough "has enough time passed" check, not live-block accuracy —
  // watching every new block here would be a steady stream of RPC calls for an admin-only,
  // low-traffic page. A 30s staleTime is plenty.
  const { data: block } = useBlock({ query: { staleTime: 30_000 } });
  const blockTimestamp = block?.timestamp;
  const emergencyDelay = emergencyDelayData as bigint | undefined;

  const [rescueTarget, setRescueTarget] = useState<EscrowWithId | null>(null);
  const [rescueRecipient, setRescueRecipient] = useState<'client' | 'worker' | null>(null);
  const { writeContract: writeRescue, data: rescueTxHash, isPending: isRescuePending, error: rescueWriteError, reset: resetRescue } = useWriteContract();
  const { txState: rescueTxState, isConfirmed: isRescueConfirmed } = useTxLifecycle(rescueTxHash, isRescuePending);

  useEffect(() => {
    if (isRescueConfirmed) {
      refetchEscrows();
    }
  }, [isRescueConfirmed, refetchEscrows]);

  if (!isConnected) {
    return (
      <div style={{ background: '#060a0c', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Sora', sans-serif" }}>
        <p style={{ color: '#6a8f80', fontSize: 13 }}>Connect the owner wallet to access this page.</p>
      </div>
    );
  }

  // Owner read still in flight — show a loading state rather than the admin panel, so a
  // non-owner wallet never sees a content flash before isOwner actually resolves to false.
  if (!ownerResolved) {
    return (
      <div style={{ background: '#060a0c', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Sora', sans-serif" }}>
        <p style={{ color: '#6a8f80', fontSize: 13 }}>Checking owner access...</p>
      </div>
    );
  }

  if (!isOwner) {
    return null;
  }

  const openRescueConfirm = (escrow: EscrowWithId) => {
    setRescueTarget(escrow);
    setRescueRecipient(null);
    resetRescue();
  };

  const closeRescueConfirm = () => {
    setRescueTarget(null);
    setRescueRecipient(null);
    resetRescue();
  };

  const handleConfirmRescue = () => {
    if (!rescueTarget || !rescueRecipient) return;
    const recipient = rescueRecipient === 'client' ? rescueTarget.client : rescueTarget.worker;
    writeRescue({
      ...swarmEscrowConfig,
      functionName: 'emergencyRescue',
      args: [rescueTarget.id, recipient],
    });
  };

  return (
    <div style={{ background: '#060a0c', position: 'relative', minHeight: '100vh', fontFamily: "'Sora', sans-serif" }}>
      <div style={{ position: 'relative', zIndex: 1, padding: '24px 32px', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <svg width="26" height="26" viewBox="0 0 28 28">
            <circle cx="14" cy="6" r="3.4" fill="#4dffb8" />
            <circle cx="5" cy="21" r="3.4" fill="#4d9fff" />
            <circle cx="23" cy="21" r="3.4" fill="#4dffb8" />
            <line x1="14" y1="6" x2="5" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
            <line x1="14" y1="6" x2="23" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
            <line x1="5" y1="21" x2="23" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
          </svg>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700, color: '#eafff5' }}>Swarm Escrow</span>
          <span style={{ background: 'rgba(255,180,77,0.12)', color: '#ffb44d', fontSize: 10, padding: '4px 10px', borderRadius: 100, fontFamily: "'JetBrains Mono', monospace", marginLeft: 6 }}>
            Admin only
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#6a8f80', fontFamily: "'JetBrains Mono', monospace", marginBottom: 28 }}>
          Connected as owner · {truncate(address || '')}
        </div>

        <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6a8f80', fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 }}>
          Contract parameters
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 32 }}>
          <ParamField
            label="Challenge window (seconds)"
            fn="setChallengeWindow"
            currentValue={challengeWindowData !== undefined ? String(challengeWindowData) : undefined}
            onConfirmed={() => refetchAdminReads()}
          />
          <ParamField
            label="Senior arbiter window (seconds)"
            fn="setSeniorArbiterWindow"
            currentValue={seniorArbiterWindowData !== undefined ? String(seniorArbiterWindowData) : undefined}
            onConfirmed={() => refetchAdminReads()}
          />
          <ParamField
            label="Emergency delay (seconds)"
            fn="setEmergencyDelay"
            currentValue={emergencyDelayData !== undefined ? String(emergencyDelayData) : undefined}
            onConfirmed={() => refetchAdminReads()}
          />
          <ParamField
            label="Oracle address"
            fn="setOracleAddress"
            currentValue={oracleAddressData !== undefined ? String(oracleAddressData) : undefined}
            onConfirmed={() => refetchAdminReads()}
          />
        </div>

        <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6a8f80', fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 }}>
          All escrows · emergency rescue
        </div>
        <div style={{ background: 'rgba(6,10,12,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
          {escrows.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#6a8f80', fontSize: 12 }}>No escrows yet.</div>
          ) : (
            escrows.map((e, i) => {
              const rescueState = computeRescueState(e, blockTimestamp, emergencyDelay);
              return (
                <div
                  key={e.id.toString()}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: i < escrows.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none', flexWrap: 'wrap', gap: 10 }}
                >
                  <div>
                    <div style={{ fontSize: 13, color: '#eafff5', fontWeight: 500, marginBottom: 4 }}>Escrow #{e.id.toString()}</div>
                    <div style={{ fontSize: 11, color: '#6a8f80', fontFamily: "'JetBrains Mono', monospace" }}>
                      {(Number(e.amount) / 1e18).toFixed(2)} BOT · client {truncate(e.client)} · worker {truncate(e.worker)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <StatusPill status={STATUS_LABELS[e.status]} />
                    {rescueState === 'terminal' && (
                      <button disabled style={{ background: 'rgba(255,255,255,0.04)', color: '#4a5550', border: '1px solid rgba(255,255,255,0.08)', padding: '7px 14px', borderRadius: 100, fontWeight: 700, fontSize: 11, cursor: 'not-allowed', whiteSpace: 'nowrap' }}>
                        Terminal
                      </button>
                    )}
                    {rescueState === 'locked' && (
                      <button disabled style={{ background: 'rgba(255,255,255,0.04)', color: '#4a5550', border: '1px solid rgba(255,255,255,0.08)', padding: '7px 14px', borderRadius: 100, fontWeight: 700, fontSize: 11, cursor: 'not-allowed', whiteSpace: 'nowrap' }}>
                        Rescue locked
                      </button>
                    )}
                    {rescueState === 'available' && (
                      <button onClick={() => openRescueConfirm(e)} style={{ background: 'transparent', color: '#ff9a9a', border: '1px solid rgba(255,154,154,0.4)', padding: '7px 14px', borderRadius: 100, fontWeight: 700, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Rescue available
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {rescueTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: '#0a0f0d', border: '1px solid rgba(255,154,154,0.3)', borderRadius: 16, padding: 24, width: 380, maxWidth: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, color: '#eafff5', margin: 0 }}>Emergency rescue #{rescueTarget.id.toString()}</h2>
              {(rescueTxState === 'approve' || rescueTxState === 'confirming') ? (
                <span style={{ color: '#3a4a44', fontSize: 18, lineHeight: 1 }}>✕</span>
              ) : (
                <span onClick={closeRescueConfirm} style={{ color: '#6a8f80', cursor: 'pointer', fontSize: 18 }}>✕</span>
              )}
            </div>

            {rescueTxState === 'idle' && (
              <>
                <div style={{ fontSize: 11, color: '#ffb44d', fontFamily: "'JetBrains Mono', monospace", marginBottom: 16, lineHeight: 1.5 }}>
                  This is a last-resort bypass of the normal state machine. Funds go directly to whichever address you pick below — never anywhere else.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#eafff5', cursor: 'pointer' }}>
                    <input type="radio" checked={rescueRecipient === 'client'} onChange={() => setRescueRecipient('client')} />
                    client {truncate(rescueTarget.client)}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#eafff5', cursor: 'pointer' }}>
                    <input type="radio" checked={rescueRecipient === 'worker'} onChange={() => setRescueRecipient('worker')} />
                    worker {truncate(rescueTarget.worker)}
                  </label>
                </div>
                {rescueWriteError && (
                  <div style={{ fontSize: 11, color: '#ff9a9a', marginBottom: 12 }}>
                    {rescueWriteError.message.includes('User rejected') ? 'Transaction rejected in wallet' : 'Transaction failed, try again'}
                  </div>
                )}
                <button
                  disabled={!rescueRecipient}
                  onClick={handleConfirmRescue}
                  style={{ width: '100%', background: rescueRecipient ? '#ff9a9a' : 'rgba(255,255,255,0.06)', color: rescueRecipient ? '#1a0606' : '#4a5550', border: 'none', padding: 11, borderRadius: 100, fontWeight: 700, fontSize: 13, cursor: rescueRecipient ? 'pointer' : 'not-allowed' }}
                >
                  Confirm rescue
                </button>
              </>
            )}

            {rescueTxState !== 'idle' && (
              <TxLifecycleStatus
                txState={rescueTxState}
                txHash={rescueTxHash}
                explorerBase={EXPLORER_BASE}
                confirmedLabel="Rescue completed"
                revertedLabel="No funds were moved."
                onClose={closeRescueConfirm}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
