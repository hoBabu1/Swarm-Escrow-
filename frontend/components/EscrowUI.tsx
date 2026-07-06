import { ReactNode } from 'react';
import { formatEther } from 'viem';
import { EscrowWithId } from '@/lib/hooks/useEscrowsByIds';
import { STATUS_LABELS } from '@/lib/escrowFormat';
import { EscrowStatus } from '@/lib/hooks/useEscrow';
import { MiniStepTracker } from './MiniStepTracker';

function formatCompactCountdown(ms: number) {
  if (ms <= 0) return '00:00:00';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

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

export function EscrowRowItem({
  escrow,
  counterpartyLabel,
  onClick,
  showStepTracker = false,
  now,
}: {
  escrow: EscrowWithId;
  counterpartyLabel: string;
  onClick: () => void;
  /** Dashboard rows show a compact step tracker alongside the status pill; other callers
   * (wallet lookup) keep the plain pill-only row. */
  showStepTracker?: boolean;
  /** Current time in ms, used to render the "Ends in" submission countdown for Created
   * escrows. Only needed by callers that pass showStepTracker (the dashboard). */
  now?: number;
}) {
  const showCountdown = escrow.status === EscrowStatus.Created && now !== undefined;

  return (
    <div onClick={onClick} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', gap: 16 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#eafff5', fontWeight: 500, marginBottom: 4 }}>Escrow #{escrow.id.toString()}</div>
        <div style={{ fontSize: 11, color: '#6a8f80', fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{counterpartyLabel}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        {showStepTracker && <MiniStepTracker status={escrow.status} />}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, color: '#eafff5', fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>{formatEther(escrow.amount)} BOT</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
            {showCountdown && (
              <span style={{ fontSize: 10, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace" }}>
                Ends in {formatCompactCountdown(Number(escrow.deadline) * 1000 - now!)}
              </span>
            )}
            <StatusPill status={STATUS_LABELS[escrow.status]} />
          </div>
        </div>
      </div>
    </div>
  );
}
