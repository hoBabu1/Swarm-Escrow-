'use client';

import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useEffect, useRef, useState } from 'react';
import { isAddress } from 'viem';
import { WalletButton } from '@/components/WalletButton';
import { AdminNavLink } from '@/components/AdminNavLink';

const steps = [
  ['01', 'Create escrow', 'Client funds the job with native BOT and sets terms.'],
  ['02', 'Worker delivers', 'Worker submits the deliverable on-chain.'],
  ['03', 'Agents review', 'Reviewer, FraudSanity and Arbiter vote 2-of-3.'],
  ['04', 'Challenge window', 'Losing party can escalate to the Senior Arbiter.'],
  ['05', 'Funds released', 'Payout finalizes automatically once settled.'],
];

const TOPUSER_WALLET_ADDRESS = '0x096DD3EBFab85c85309477DDf3A18FC31ecBa33a';

/** Small decorative header for the "How it works" section: 3 dots (Reviewer,
 * FraudSanity, Arbiter) pulse in sequence, then converge/fade into a
 * checkmark, looping — echoes the ReviewingIndicator pulse used on the
 * escrow detail page, just scaled up as an illustrative accent. */
function AgentConsensusAnimation() {
  const dotColors = ['#4dffb8', '#4d9fff', '#4dffb8'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <div style={{ position: 'relative', width: 140, height: 70 }}>
        {dotColors.map((color, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: `${i * 50}px`,
              top: 0,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: color,
              boxShadow: `0 0 12px ${color}`,
              animation: `agentPulse 2.4s ease-in-out ${i * 0.3}s infinite`,
            }}
          />
        ))}
        <span
          style={{
            position: 'absolute',
            left: '43px',
            top: 40,
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: 'rgba(77,255,184,0.12)',
            border: '1px solid rgba(77,255,184,0.4)',
            color: '#4dffb8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 700,
            animation: 'agentCheck 2.4s ease-in-out infinite',
          }}
        >
          ✓
        </span>
      </div>
      <p style={{ fontSize: 13, color: '#6a8f80', margin: 0, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>
        Agents review independently, then reach consensus.
      </p>
      <style>{`
        @keyframes agentPulse {
          0%, 62%, 100% { opacity: 0.3; transform: scale(0.75) translateY(0); }
          20% { opacity: 1; transform: scale(1.15) translateY(0); }
          45% { opacity: 0.7; transform: scale(0.9) translateY(18px); }
        }
        @keyframes agentCheck {
          0%, 55% { opacity: 0; transform: scale(0.6); }
          70%, 90% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.6); }
        }
      `}</style>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { openConnectModal, connectModalOpen } = useConnectModal();
  const [openStep, setOpenStep] = useState<number | null>(null);
  const [lookupAddr, setLookupAddr] = useState('');
  const wantsLaunch = useRef(false);

  useEffect(() => {
    if (wantsLaunch.current && isConnected) {
      wantsLaunch.current = false;
      router.push('/dashboard');
    }
  }, [isConnected, router]);

  useEffect(() => {
    if (!connectModalOpen && !isConnected) {
      wantsLaunch.current = false;
    }
  }, [connectModalOpen, isConnected]);

  const handleLaunchApp = () => {
    if (!isConnected) {
      wantsLaunch.current = true;
      openConnectModal?.();
      return;
    }
    router.push('/dashboard');
  };

  const scrollToHow = () => {
    document.getElementById('how-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  const addressValid = lookupAddr.length === 0 || isAddress(lookupAddr);

  return (
    <div style={{ background: '#060a0c', position: 'relative', minHeight: '100vh', fontFamily: "'Sora', sans-serif" }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', height: 520, zIndex: 0 }}>
        <div style={{ position: 'absolute', width: 420, height: 420, borderRadius: '50%', top: -180, left: -100, background: 'radial-gradient(circle, rgba(77,255,184,0.16), transparent 70%)', filter: 'blur(30px)' }} />
        <div style={{ position: 'absolute', width: 380, height: 380, borderRadius: '50%', top: -140, right: -120, background: 'radial-gradient(circle, rgba(77,159,255,0.16), transparent 70%)', filter: 'blur(30px)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, padding: '24px 16px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 60 }}>
          <div onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <svg width="36" height="36" viewBox="0 0 28 28">
              <circle cx="14" cy="6" r="3.4" fill="#4dffb8" />
              <circle cx="5" cy="21" r="3.4" fill="#4d9fff" />
              <circle cx="23" cy="21" r="3.4" fill="#4dffb8" />
              <line x1="14" y1="6" x2="5" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
              <line x1="14" y1="6" x2="23" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
              <line x1="5" y1="21" x2="23" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
            </svg>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700, color: '#eafff5' }}>Swarm Escrow</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <AdminNavLink />
            <WalletButton />
          </div>
        </div>

        <div style={{ textAlign: 'center', maxWidth: 860, margin: '0 auto 40px' }}>
          <div style={{ fontSize: 15, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4dffb8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 18 }}>
            AI agent escrow on BOT chain
          </div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 'clamp(32px, 8vw, 56px)', color: '#eafff5', fontWeight: 700, margin: '0 0 40px', lineHeight: 1.2 }}>
            Where agents align on every deliverable.
          </h1>

          <div className="hero-cta-row" style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={scrollToHow} className="hero-cta-btn" style={{ background: 'transparent', color: '#eafff5', border: '1px solid rgba(255,255,255,0.2)', padding: '17px 34px', borderRadius: 100, fontWeight: 700, fontSize: 17, fontFamily: "'Sora', sans-serif", cursor: 'pointer' }}>
              How it works
            </button>
            <button onClick={handleLaunchApp} className="hero-cta-btn" style={{ background: '#4dffb8', color: '#06120c', border: 'none', padding: '17px 34px', borderRadius: 100, fontWeight: 700, fontSize: 17, fontFamily: "'Sora', sans-serif", cursor: 'pointer' }}>
              Launch app
            </button>
            <a
              href="https://faucet.botchain.ai/basic"
              target="_blank"
              rel="noopener noreferrer"
              className="hero-cta-btn"
              style={{ background: 'transparent', color: '#eafff5', border: '1px solid rgba(255,255,255,0.2)', padding: '17px 34px', borderRadius: 100, fontWeight: 700, fontSize: 17, fontFamily: "'Sora', sans-serif", cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
            >
              Get testnet BOT →
            </a>
          </div>
          <style>{`
            @media (max-width: 640px) {
              .hero-cta-row { flex-direction: column; }
              .hero-cta-btn { width: 100%; box-sizing: border-box; }
            }
          `}</style>
        </div>

        <div style={{ maxWidth: 640, margin: '52px auto 0', background: 'rgba(6,10,12,0.5)', border: '1px solid rgba(77,255,184,0.25)', borderRadius: 18, padding: 30, backdropFilter: 'blur(6px)' }}>
          <div style={{ fontSize: 15, color: '#8fb5a8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 14 }}>Look up any wallet</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <input
              value={lookupAddr}
              onChange={(e) => setLookupAddr(e.target.value)}
              placeholder="0x..."
              style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '14px 16px', color: '#eafff5', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, outline: 'none' }}
            />
            <button
              disabled={!addressValid || lookupAddr.length === 0}
              onClick={() => router.push(`/wallet/${lookupAddr}`)}
              style={{ background: '#4d9fff', color: '#03101f', border: 'none', padding: '14px 26px', borderRadius: 8, fontWeight: 700, fontSize: 15, fontFamily: "'Sora', sans-serif", cursor: 'pointer', whiteSpace: 'nowrap', opacity: !addressValid || lookupAddr.length === 0 ? 0.5 : 1 }}
            >
              View history
            </button>
          </div>
          {!addressValid && <p style={{ color: '#ff9a9a', fontSize: 14, marginTop: 12 }}>Enter a valid address</p>}
          <div style={{ marginTop: 14 }}>
            <button
              onClick={() => router.push(`/wallet/${TOPUSER_WALLET_ADDRESS}`)}
              style={{ background: 'none', border: 'none', padding: 0, color: '#6a8f80', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              Check topuser →
            </button>
          </div>
        </div>
      </div>

      <div id="how-section" style={{ position: 'relative', zIndex: 1, padding: '88px 16px 64px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 28 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', gap: 48, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div style={{ fontSize: 15, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6a8f80', fontFamily: "'JetBrains Mono', monospace", marginBottom: 18 }}>How it works</div>
            {steps.map((s, i) => (
              <div key={i} onClick={() => setOpenStep(openStep === i ? null : i)} style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '20px 0', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 17, color: '#eafff5' }}>
                    <span style={{ color: '#4dffb8', marginRight: 12 }}>{s[0]}</span>{s[1]}
                  </span>
                  <span style={{ color: '#6a8f80', fontSize: 18, transform: openStep === i ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▾</span>
                </div>
                <div style={{ maxHeight: openStep === i ? 80 : 0, overflow: 'hidden', transition: 'max-height 0.2s ease' }}>
                  <p style={{ fontSize: 16, color: '#a8d4c0', margin: '14px 0 0', lineHeight: 1.5 }}>{s[2]}</p>
                </div>
              </div>
            ))}
          </div>
          <div style={{ flex: '0 0 220px', display: 'flex', justifyContent: 'center', paddingTop: 36 }}>
            <AgentConsensusAnimation />
          </div>
        </div>
      </div>
    </div>
  );
}
