import { EscrowStatus } from '@/lib/hooks/useEscrow';
import { computeStepInfo, STEP_LABELS, STEP_COLORS } from '@/lib/stepTracker';

/** Compact version of the escrow-detail page's StepTracker, for dashboard rows — shares
 * computeStepInfo AND STEP_COLORS so both trackers always agree on which step is "current"
 * and always use the same per-phase color logic, just at dashboard-row scale. */
export function MiniStepTracker({ status }: { status: EscrowStatus }) {
  const { currentIndex, isTerminal, labelOverride } = computeStepInfo(status);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {STEP_LABELS.map((stepLabel, i) => {
        const done = i < currentIndex || isTerminal;
        const current = i === currentIndex && !isTerminal;
        const reached = done || current;
        const phaseColor = STEP_COLORS[i];
        const label = i === 2 && labelOverride ? labelOverride : stepLabel;
        return (
          <div key={stepLabel} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 34 }}>
              <div style={{
                width: 13, height: 13, borderRadius: '50%', flexShrink: 0,
                background: reached ? phaseColor : 'rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: reached ? '#06120c' : '#6a8f80',
                fontSize: 7, fontWeight: 700,
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 8, color: reached ? phaseColor : '#6a8f80', marginTop: 3, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center', lineHeight: 1.1 }}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div style={{ width: 12, height: 1.5, flexShrink: 0, background: i < currentIndex ? phaseColor : 'rgba(255,255,255,0.1)', marginBottom: 10 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
