import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, keccak256, toBytes } from 'viem';
import { botChainTestnet } from '@/lib/chains';
import { swarmEscrowConfig } from '@/lib/contract';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const publicClient = createPublicClient({
  chain: botChainTestnet,
  transport: http(process.env.RPC_URL_TESTNET ?? botChainTestnet.rpcUrls.default.http[0]),
});

// Very small in-memory per-IP limiter — this is a single Next.js server process for a
// hackathon deployment, not a multi-instance one, so this is sufficient to blunt spam
// without pulling in an external store.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length >= RATE_LIMIT_MAX_REQUESTS;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests, try again shortly' }, { status: 429 });
  }

  let body: { escrowId?: number | string; specText?: string; specHash?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { escrowId, specText, specHash } = body;

  if (escrowId === undefined || Number.isNaN(Number(escrowId))) {
    return NextResponse.json({ error: 'escrowId is required' }, { status: 400 });
  }
  if (!specText || specText.trim().length === 0) {
    return NextResponse.json({ error: 'specText is required' }, { status: 400 });
  }
  if (!specHash || typeof specHash !== 'string') {
    return NextResponse.json({ error: 'specHash is required' }, { status: 400 });
  }

  const computedHash = keccak256(toBytes(specText));
  if (computedHash.toLowerCase() !== specHash.toLowerCase()) {
    return NextResponse.json({ error: 'specText does not match specHash' }, { status: 400 });
  }

  // Cross-check against the real on-chain specHash for this escrowId — without this, any
  // unauthenticated caller could insert a self-consistent (but fabricated) row for an escrow
  // that isn't theirs, or for an ID that doesn't exist yet.
  let onChainSpecHash: string;
  try {
    const escrow = await publicClient.readContract({
      ...swarmEscrowConfig,
      functionName: 'escrows',
      args: [BigInt(escrowId)],
    });
    onChainSpecHash = escrow[3];
  } catch {
    return NextResponse.json({ error: "Couldn't verify escrow on-chain, try again" }, { status: 502 });
  }

  if (onChainSpecHash.toLowerCase() !== specHash.toLowerCase()) {
    return NextResponse.json({ error: 'specHash does not match the on-chain escrow' }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from('escrow_specs')
    .upsert({ escrow_id: Number(escrowId), spec_text: specText, spec_hash: specHash }, { onConflict: 'escrow_id' });

  if (error) {
    return NextResponse.json({ error: 'Failed to store spec text' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
