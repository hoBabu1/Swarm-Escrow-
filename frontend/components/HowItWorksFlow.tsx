export default function HowItWorksFlow() {
  return (
    <section className="w-full py-16">
      <h2 className="text-center text-2xl md:text-3xl font-bold text-[#eafff6] mb-10" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        Working mechanism
      </h2>
      <div className="max-w-[680px] mx-auto">
        <svg width="100%" viewBox="0 0 680 1128" role="img" aria-labelledby="how-it-works-title how-it-works-desc">
          <title id="how-it-works-title">Swarm Escrow lifecycle diagram</title>
          <desc id="how-it-works-desc">Flowchart showing the escrow lifecycle from creation through three AI agent evaluations to a 2-of-3 consensus, then a branch into an uncontested finalize path or a challenge and senior arbiter path, both ending in funds moving.</desc>

          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M2 1L8 5L2 9" fill="none" stroke="#4dffb8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>

          {/* Node 1 */}
          <rect x="200" y="40" width="280" height="56" rx="8" fill="#0d1416" stroke="#2a3a3d" strokeWidth="0.5" />
          <text x="340" y="58" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill="#eafff6">Client creates escrow</text>
          <text x="340" y="76" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#9fb0ac">Funds locked on-chain</text>
          <line x1="340" y1="96" x2="340" y2="156" stroke="#4dffb8" strokeWidth="1.5" markerEnd="url(#arrow)" />

          {/* Node 2 */}
          <rect x="200" y="156" width="280" height="56" rx="8" fill="#0d1416" stroke="#2a3a3d" strokeWidth="0.5" />
          <text x="340" y="174" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill="#eafff6">Worker submits deliverable</text>
          <text x="340" y="192" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#9fb0ac">Repo URL and commit hash</text>
          <line x1="340" y1="212" x2="340" y2="272" stroke="#4dffb8" strokeWidth="1.5" markerEnd="url(#arrow)" />

          {/* Node 3 */}
          <rect x="200" y="272" width="280" height="56" rx="8" fill="#0d1416" stroke="#2a3a3d" strokeWidth="0.5" />
          <text x="340" y="290" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill="#eafff6">Oracle fetches the repo</text>
          <text x="340" y="308" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#9fb0ac">At the exact submitted commit</text>

          {/* Fan out to 3 agents */}
          <path d="M340 328 L340 365 L140 365 L140 400" fill="none" stroke="#4dffb8" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <path d="M340 328 L340 400" fill="none" stroke="#4dffb8" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <path d="M340 328 L340 365 L520 365 L520 400" fill="none" stroke="#4dffb8" strokeWidth="1.5" markerEnd="url(#arrow)" />

          {/* 3 agent nodes */}
          <rect x="50" y="400" width="180" height="56" rx="8" fill="rgba(77,255,184,0.08)" stroke="#4dffb8" strokeWidth="0.5" />
          <text x="140" y="418" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill="#4dffb8">Reviewer</text>
          <text x="140" y="436" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#7fd9b8">Spec compliance check</text>

          <rect x="250" y="400" width="180" height="56" rx="8" fill="rgba(77,159,255,0.08)" stroke="#4d9fff" strokeWidth="0.5" />
          <text x="340" y="418" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill="#4d9fff">FraudSanity</text>
          <text x="340" y="436" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#8fbfec">Fraud and spam filter</text>

          <rect x="450" y="400" width="180" height="56" rx="8" fill="rgba(255,138,101,0.08)" stroke="#ff8a65" strokeWidth="0.5" />
          <text x="540" y="418" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill="#ff8a65">Arbiter</text>
          <text x="540" y="436" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#e0ab97">Tie-break and synthesis</text>

          {/* Converge to consensus */}
          <path d="M140 456 L140 490 L340 490 L340 520" fill="none" stroke="#4dffb8" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <path d="M340 456 L340 520" fill="none" stroke="#4dffb8" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <path d="M540 456 L540 490 L340 490 L340 520" fill="none" stroke="#4dffb8" strokeWidth="1.5" markerEnd="url(#arrow)" />

          {/* Node 5 */}
          <rect x="220" y="520" width="240" height="56" rx="8" fill="#0d1416" stroke="#2a3a3d" strokeWidth="0.5" />
          <text x="340" y="538" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill="#eafff6">2-of-3 consensus</text>
          <text x="340" y="556" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#9fb0ac">Verdict reached</text>
          <line x1="340" y1="576" x2="340" y2="636" stroke="#4dffb8" strokeWidth="1.5" markerEnd="url(#arrow)" />

          {/* Node 6 */}
          <rect x="220" y="636" width="240" height="56" rx="8" fill="#0d1416" stroke="#2a3a3d" strokeWidth="0.5" />
          <text x="340" y="654" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill="#eafff6">resolve() called</text>
          <text x="340" y="672" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#9fb0ac">Challenge window opens</text>

          {/* Fan out to 2 branches */}
          <path d="M340 692 L340 725 L200 725 L200 752" fill="none" stroke="#4dffb8" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <path d="M340 692 L340 725 L480 725 L480 752" fill="none" stroke="#4dffb8" strokeWidth="1.5" markerEnd="url(#arrow)" />

          {/* Left branch */}
          <rect x="70" y="752" width="260" height="56" rx="8" fill="#0d1416" stroke="#2a3a3d" strokeWidth="0.5" />
          <text x="200" y="770" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill="#eafff6">No challenge raised</text>
          <text x="200" y="788" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#9fb0ac">Window lapses</text>
          <line x1="200" y1="808" x2="200" y2="852" stroke="#4dffb8" strokeWidth="1.5" markerEnd="url(#arrow)" />

          <rect x="70" y="852" width="260" height="56" rx="8" fill="rgba(77,255,184,0.08)" stroke="#4dffb8" strokeWidth="0.5" />
          <text x="200" y="870" textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="500" fill="#4dffb8">finalizeAfterChallengeWindow()</text>
          <text x="200" y="888" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#7fd9b8">Funds move to worker</text>

          {/* Right branch */}
          <rect x="350" y="752" width="260" height="56" rx="8" fill="#0d1416" stroke="#2a3a3d" strokeWidth="0.5" />
          <text x="480" y="770" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill="#eafff6">Losing party challenges</text>
          <text x="480" y="788" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#9fb0ac">One-time on-chain call</text>
          <line x1="480" y1="808" x2="480" y2="852" stroke="#4dffb8" strokeWidth="1.5" markerEnd="url(#arrow)" />

          <rect x="350" y="852" width="260" height="56" rx="8" fill="rgba(255,138,101,0.08)" stroke="#ff8a65" strokeWidth="0.5" />
          <text x="480" y="870" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill="#ff8a65">Senior Arbiter reviews</text>
          <text x="480" y="888" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#e0ab97">A 4th, separate role</text>
          <line x1="480" y1="908" x2="480" y2="952" stroke="#4dffb8" strokeWidth="1.5" markerEnd="url(#arrow)" />

          <rect x="350" y="952" width="260" height="56" rx="8" fill="rgba(255,138,101,0.08)" stroke="#ff8a65" strokeWidth="0.5" />
          <text x="480" y="970" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill="#ff8a65">Timeout resolves case</text>
          <text x="480" y="988" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#e0ab97">Or senior verdict decides</text>

          {/* Converge to terminal */}
          <line x1="200" y1="908" x2="330" y2="1032" stroke="#4dffb8" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <line x1="480" y1="1008" x2="350" y2="1032" stroke="#4dffb8" strokeWidth="1.5" markerEnd="url(#arrow)" />

          {/* Terminal */}
          <rect x="220" y="1032" width="240" height="56" rx="8" fill="rgba(77,255,184,0.12)" stroke="#4dffb8" strokeWidth="1" />
          <text x="340" y="1050" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill="#4dffb8">Funds move</text>
          <text x="340" y="1068" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#7fd9b8">Escrow resolved</text>
        </svg>
      </div>
    </section>
  );
}