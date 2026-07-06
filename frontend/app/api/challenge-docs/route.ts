import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, keccak256, toBytes } from 'viem';
import { botChainTestnet } from '@/lib/chains';
import { swarmEscrowConfig } from '@/lib/contract';
import { EscrowStatus, EscrowStructTuple, parseEscrowTuple } from '@/lib/hooks/useEscrow';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sameAddress } from '@/lib/escrowFormat';

const publicClient = createPublicClient({
  chain: botChainTestnet,
  transport: http(process.env.RPC_URL_TESTNET ?? botChainTestnet.rpcUrls.default.http[0]),
});

// Same single-process, per-IP limiter as escrow-specs — sufficient to blunt spam for this
// hackathon deployment without pulling in an external store.
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

  let body: { escrowId?: number | string; challengerAddress?: string; documentText?: string; documentHash?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { escrowId, challengerAddress, documentText, documentHash } = body;

  if (escrowId === undefined || Number.isNaN(Number(escrowId))) {
    return NextResponse.json({ error: 'escrowId is required' }, { status: 400 });
  }
  if (!challengerAddress || typeof challengerAddress !== 'string') {
    return NextResponse.json({ error: 'challengerAddress is required' }, { status: 400 });
  }
  if (!documentText || documentText.trim().length === 0) {
    return NextResponse.json({ error: 'documentText is required' }, { status: 400 });
  }
  if (!documentHash || typeof documentHash !== 'string') {
    return NextResponse.json({ error: 'documentHash is required' }, { status: 400 });
  }

  const computedHash = keccak256(toBytes(documentText));
  if (computedHash.toLowerCase() !== documentHash.toLowerCase()) {
    return NextResponse.json({ error: 'documentText does not match documentHash' }, { status: 400 });
  }

  // Unlike escrow-specs, there's no on-chain challengeReasoningHash to cross-check yet at this
  // point — this write happens BEFORE the challenge() tx (the hash is an input to that tx, not
  // a result of it). So the anti-fabrication check here is against the escrow's real on-chain
  // state instead: only the actual losing party, on an escrow that's actually still challengeable,
  // may write a challenge doc for it.
  let escrow;
  try {
    const data = await publicClient.readContract({
      ...swarmEscrowConfig,
      functionName: 'escrows',
      args: [BigInt(escrowId)],
    });
    escrow = parseEscrowTuple(data as unknown as EscrowStructTuple);
  } catch {
    return NextResponse.json({ error: "Couldn't verify escrow on-chain, try again" }, { status: 502 });
  }

  if (escrow.status !== EscrowStatus.PendingChallenge) {
    return NextResponse.json({ error: 'This escrow is not in its challenge window' }, { status: 400 });
  }
  if (escrow.hasChallenged) {
    return NextResponse.json({ error: 'This escrow has already been challenged' }, { status: 400 });
  }

  const losingPartyAddress = escrow.tentativeApproved ? escrow.client : escrow.worker;
  if (!sameAddress(losingPartyAddress, challengerAddress)) {
    return NextResponse.json({ error: 'Only the losing party may raise a challenge on this escrow' }, { status: 403 });
  }

  const { error } = await getSupabaseAdmin()
    .from('challenge_docs')
    .upsert(
      { escrow_id: Number(escrowId), challenger_address: challengerAddress, document_text: documentText, document_hash: documentHash },
      { onConflict: 'escrow_id' }
    );

  if (error) {
    return NextResponse.json({ error: 'Failed to store challenge document' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
