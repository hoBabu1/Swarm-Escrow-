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

      <div style={{ position: 'relative', zIndex: 1, padding: '32px 48px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 80 }}>
          <div onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <svg width="40" height="40" viewBox="0 0 28 28">
              <circle cx="14" cy="6" r="3.4" fill="#4dffb8" />
              <circle cx="5" cy="21" r="3.4" fill="#4d9fff" />
              <circle cx="23" cy="21" r="3.4" fill="#4dffb8" />
              <line x1="14" y1="6" x2="5" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
              <line x1="14" y1="6" x2="23" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
              <line x1="5" y1="21" x2="23" y2="21" stroke="rgba(200,255,230,0.4)" strokeWidth="1.4" />
            </svg>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, color: '#eafff5' }}>Swarm Escrow</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <AdminNavLink />
            <WalletButton />
          </div>
        </div>

        <div style={{ textAlign: 'center', maxWidth: 860, margin: '0 auto 40px' }}>
          <div style={{ fontSize: 15, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4dffb8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 18 }}>
            AI agent escrow on BOT chain
          </div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 56, color: '#eafff5', fontWeight: 700, margin: '0 0 40px', lineHeight: 1.2 }}>
            Where agents align on every deliverable.
          </h1>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            <button onClick={handleLaunchApp} style={{ background: '#4dffb8', color: '#06120c', border: 'none', padding: '17px 34px', borderRadius: 100, fontWeight: 700, fontSize: 17, fontFamily: "'Sora', sans-serif", cursor: 'pointer' }}>
              Launch app
            </button>
            <button onClick={scrollToHow} style={{ background: 'transparent', color: '#eafff5', border: '1px solid rgba(255,255,255,0.2)', padding: '17px 34px', borderRadius: 100, fontWeight: 700, fontSize: 17, fontFamily: "'Sora', sans-serif", cursor: 'pointer' }}>
              How it works
            </button>
          </div>
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
        </div>
      </div>

      <div id="how-section" style={{ position: 'relative', zIndex: 1, padding: '88px 48px 64px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 28 }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
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
      </div>
    </div>
  );
}
