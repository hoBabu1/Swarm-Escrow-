import { ReactNode } from 'react';
import { formatEther } from 'viem';
import { EscrowWithId } from '@/lib/hooks/useEscrowsByIds';
import { STATUS_LABELS } from '@/lib/escrowFormat';

/** Shared status → (background, text) color pairs, used anywhere an escrow status renders
 * as a pill (dashboard, wallet lookup, admin). */
export const STATUS_COLORS: Record<string, [string, string]> = {
  'Resolved': ['rgba(77,255,184,0.12)', '#4dffb8'],
  'Refunded': ['rgba(168,212,192,0.12)', '#a8d4c0'],
  'Pending challenge': ['rgba(77,159,255,0.12)', '#4d9fff'],
  'Challenged': ['rgba(255,180,77,0.12)', '#ffb44d'],
  'Awaiting review': ['rgba(255,255,255,0.08)', '#a8d4c0'],
  'Awaiting submission': ['rgba(255,255,255,0.08)', '#8fb5a8'],
};

export function StatusPill({ status }: { status: string }) {
  const [bg, color] = STATUS_COLORS[status] || STATUS_COLORS['Awaiting submission'];
  return (
    <span style={{ background: bg, color, fontSize: 10, padding: '4px 10px', borderRadius: 100, fontFamily: "'JetBrains Mono', monospace" }}>
      {status}
    </span>
  );
}

export function StatCard({ label, value, accent }: { label: string; value: ReactNode; accent: string }) {
  return (
    <div style={{ background: 'rgba(6,10,12,0.5)', border: `1px solid ${accent}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 10, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, color: '#eafff5', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}

export function EscrowRowItem({ escrow, counterpartyLabel, onClick }: { escrow: EscrowWithId; counterpartyLabel: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}>
      <div>
        <div style={{ fontSize: 13, color: '#eafff5', fontWeight: 500, marginBottom: 4 }}>Escrow #{escrow.id.toString()}</div>
        <div style={{ fontSize: 11, color: '#6a8f80', fontFamily: "'JetBrains Mono', monospace" }}>{counterpartyLabel}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, color: '#eafff5', fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>{formatEther(escrow.amount)} BOT</div>
        <StatusPill status={STATUS_LABELS[escrow.status]} />
      </div>
    </div>
  );
}
