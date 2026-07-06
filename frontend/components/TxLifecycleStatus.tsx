import { ReactNode } from 'react';
import { TxLifecycleState } from '@/lib/hooks/useTxLifecycle';

interface Props {
  txState: Extract<TxLifecycleState, 'approve' | 'confirming' | 'confirmed' | 'reverted'>;
  txHash: `0x${string}` | undefined;
  explorerBase: string;
  confirmedLabel: string;
  revertedLabel: string;
  onClose: () => void;
  /** Optional extra content (e.g. a warning) rendered between the confirmed label and its link/button. */
  confirmedExtra?: ReactNode;
  closeLabel?: string;
}

/**
 * Shared approve/confirming/confirmed/reverted body for a tx-driven modal. Every write flow
 * in this app (createEscrow, submitDeliverable, challenge, leaveFeedback, emergencyRescue,
 * admin setters) renders the same four states around a real `useTxLifecycle` result — this
 * is the single place that markup lives instead of being copy-pasted per flow.
 */
export function TxLifecycleStatus({ txState, txHash, explorerBase, confirmedLabel, revertedLabel, onClose, confirmedExtra, closeLabel = 'Back to escrow' }: Props) {
  if (txState === 'approve') {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>👛</div>
        <div style={{ fontSize: 13, color: '#eafff5' }}>Approve in wallet</div>
      </div>
    );
  }

  if (txState === 'confirming') {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ width: 28, height: 28, border: '3px solid rgba(77,159,255,0.25)', borderTopColor: '#4d9fff', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ fontSize: 13, color: '#eafff5', marginBottom: 8 }}>Confirming on-chain</div>
        <a href={`${explorerBase}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#4d9fff', fontFamily: "'JetBrains Mono', monospace", textDecoration: 'underline' }}>
          view transaction ↗
        </a>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (txState === 'confirmed') {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ color: '#4dffb8', fontSize: 28, marginBottom: 12 }}>✓</div>
        <div style={{ fontSize: 13, color: '#eafff5', marginBottom: 8 }}>{confirmedLabel}</div>
        <a href={`${explorerBase}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#4d9fff', fontFamily: "'JetBrains Mono', monospace", textDecoration: 'underline', display: 'block', marginBottom: 16 }}>
          view transaction ↗
        </a>
        {confirmedExtra}
        <button onClick={onClose} style={{ background: '#4dffb8', color: '#06120c', border: 'none', padding: '9px 20px', borderRadius: 100, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
          {closeLabel}
        </button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div style={{ color: '#ff9a9a', fontSize: 28, marginBottom: 12 }}>✕</div>
      <div style={{ fontSize: 13, color: '#eafff5', marginBottom: 8 }}>Transaction reverted on-chain</div>
      <div style={{ fontSize: 11, color: '#8fb5a8', marginBottom: 16 }}>{revertedLabel}</div>
      <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', color: '#eafff5', border: 'none', padding: '9px 20px', borderRadius: 100, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
        Close
      </button>
    </div>
  );
}
