import { ReactNode } from 'react';
import { formatEther } from 'viem';
import { Star } from 'lucide-react';
import { EscrowWithId } from '@/lib/hooks/useEscrowsByIds';
import { STATUS_LABELS } from '@/lib/escrowFormat';
import { EscrowStatus } from '@/lib/hooks/useEscrow';
import { MiniStepTracker } from './MiniStepTracker';

/** Compact 5-star row for a single escrow's received rating — rounds to the nearest whole
 * star (no half-stars in this condensed card view). */
function StarRating({ rating }: { rating: number }) {
  const filledCount = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={17}
          fill={i < filledCount ? '#ffd166' : 'none'}
          color={i < filledCount ? '#ffd166' : 'rgba(255,255,255,0.15)'}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
}

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
    <span style={{ background: bg, color, fontSize: 13, padding: '5px 13px', borderRadius: 100, fontFamily: "'JetBrains Mono', monospace" }}>
      {status}
    </span>
  );
}

export function StatCard({ label, value, accent }: { label: string; value: ReactNode; accent: string }) {
  return (
    <div style={{ background: 'rgba(6,10,12,0.5)', border: `1px solid ${accent}`, borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 13, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, color: '#eafff5', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}

export function EscrowRowItem({
  escrow,
  counterpartyLabel,
  onClick,
  showStepTracker = false,
  now,
  actionNeeded = false,
  ratingReceived,
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
  /** True when this escrow's deadline has passed with no deliverable submitted and the
   * connected wallet is the client — surfaces a badge pointing at the reclaim action on
   * the detail page, without duplicating the button here. */
  actionNeeded?: boolean;
  /** The star rating the connected wallet's role on THIS escrow received from the
   * counterparty, if that feedback has been left yet — omitted entirely otherwise. */
  ratingReceived?: number;
}) {
  const showCountdown = escrow.status === EscrowStatus.Created && now !== undefined;

  return (
    <div onClick={onClick} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '19px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', gap: 22 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, color: '#eafff5', fontWeight: 500, marginBottom: 5 }}>Escrow #{escrow.id.toString()}</div>
          <div style={{ fontSize: 15, color: '#6a8f80', fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{counterpartyLabel}</div>
        </div>
        {ratingReceived !== undefined && <StarRating rating={ratingReceived} />}
      </div>
      {showStepTracker && (
        <div style={{ flexShrink: 0, margin: '0 11px' }}>
          <MiniStepTracker status={escrow.status} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 17, color: '#eafff5', fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>{formatEther(escrow.amount)} BOT</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, justifyContent: 'flex-end' }}>
            {showCountdown && (
              <span style={{ fontSize: 13, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace" }}>
                Ends in {formatCompactCountdown(Number(escrow.deadline) * 1000 - now!)}
              </span>
            )}
            {actionNeeded && (
              <span style={{ background: 'rgba(255,180,77,0.15)', color: '#ffb44d', fontSize: 13, padding: '5px 13px', borderRadius: 100, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                Action needed
              </span>
            )}
            <StatusPill status={STATUS_LABELS[escrow.status]} />
          </div>
        </div>
      </div>
    </div>
  );
}
