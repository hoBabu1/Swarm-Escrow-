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

// Same single-process, per-IP limiter as escrow-specs/challenge-docs — sufficient to blunt
// spam for this hackathon deployment without pulling in an external store.
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

  let body: { escrowId?: number | string; senderAddress?: string; messageText?: string; messageHash?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { escrowId, senderAddress, messageText, messageHash } = body;

  if (escrowId === undefined || Number.isNaN(Number(escrowId))) {
    return NextResponse.json({ error: 'escrowId is required' }, { status: 400 });
  }
  if (!senderAddress || typeof senderAddress !== 'string') {
    return NextResponse.json({ error: 'senderAddress is required' }, { status: 400 });
  }
  if (!messageText || messageText.trim().length === 0) {
    return NextResponse.json({ error: 'messageText is required' }, { status: 400 });
  }
  if (!messageHash || typeof messageHash !== 'string') {
    return NextResponse.json({ error: 'messageHash is required' }, { status: 400 });
  }

  const computedHash = keccak256(toBytes(messageText));
  if (computedHash.toLowerCase() !== messageHash.toLowerCase()) {
    return NextResponse.json({ error: 'messageText does not match messageHash' }, { status: 400 });
  }

  // Same reasoning as challenge-docs: this write happens BEFORE the leaveFeedback() tx (the
  // hash is an input to that tx), so there's no on-chain messageHash to cross-check yet.
  // Instead we verify the escrow is actually terminal, the sender is actually a party to it,
  // and that party hasn't already left feedback on it.
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

  if (escrow.status !== EscrowStatus.Resolved && escrow.status !== EscrowStatus.Refunded) {
    return NextResponse.json({ error: 'Feedback can only be left after an escrow is resolved or refunded' }, { status: 400 });
  }

  const isClient = sameAddress(escrow.client, senderAddress);
  const isWorker = sameAddress(escrow.worker, senderAddress);
  if (!isClient && !isWorker) {
    return NextResponse.json({ error: 'Only the client or worker on this escrow may leave feedback' }, { status: 403 });
  }
  if ((isClient && escrow.hasClientFeedback) || (isWorker && escrow.hasWorkerFeedback)) {
    return NextResponse.json({ error: 'Feedback has already been left for this escrow by this address' }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from('feedback_messages')
    .upsert(
      { escrow_id: Number(escrowId), sender_address: senderAddress, message_text: messageText, message_hash: messageHash },
      { onConflict: 'escrow_id,sender_address' }
    );

  if (error) {
    return NextResponse.json({ error: 'Failed to store feedback message' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
