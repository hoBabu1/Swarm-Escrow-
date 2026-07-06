import { EscrowStatus } from '@/lib/hooks/useEscrow';
import { computeStepInfo, STEP_LABELS } from '@/lib/stepTracker';

/** Compact dot/segment version of the escrow-detail page's step tracker, for dashboard rows —
 * shares computeStepInfo so both trackers always agree on which step is "current". No text
 * labels at this scale; the row's existing StatusPill already carries that information. */
export function MiniStepTracker({ status }: { status: EscrowStatus }) {
  const { currentIndex, isTerminal } = computeStepInfo(status);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {STEP_LABELS.map((label, i) => {
        const done = i < currentIndex || isTerminal;
        const current = i === currentIndex && !isTerminal;
        return (
          <div
            key={label}
            title={label}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: done ? '#4dffb8' : current ? '#4d9fff' : 'rgba(255,255,255,0.12)',
            }}
          />
        );
      })}
    </div>
  );
}
