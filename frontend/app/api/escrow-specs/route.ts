import { NextRequest, NextResponse } from 'next/server';
import { keccak256, toBytes } from 'viem';
import { getSwarmEscrowConfig } from '@/lib/contract';
import { getServerPublicClient, isSupportedChainId } from '@/lib/serverChain';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createIpRateLimiter } from '@/lib/rateLimit';
import { verifyMinedTxOnContract } from '@/lib/verifyOnChainTx';
import { EscrowStructTuple, parseEscrowTuple } from '@/lib/hooks/useEscrow';

// Very small in-memory per-IP limiter — this is a single Next.js server process for a
// hackathon deployment, not a multi-instance one, so this is sufficient to blunt spam
// without pulling in an external store.
const isRateLimited = createIpRateLimiter(60_000, 10);

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests, try again shortly' }, { status: 429 });
  }

  let body: { escrowId?: number | string; chainId?: number; specText?: string; specHash?: string; txHash?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { escrowId, chainId, specText, specHash, txHash } = body;

  if (escrowId === undefined || Number.isNaN(Number(escrowId))) {
    return NextResponse.json({ error: 'escrowId is required' }, { status: 400 });
  }
  if (!isSupportedChainId(chainId)) {
    return NextResponse.json({ error: 'chainId is required and must be a supported network' }, { status: 400 });
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
    const data = await getServerPublicClient(chainId).readContract({
      ...getSwarmEscrowConfig(chainId),
      functionName: 'escrows',
      args: [BigInt(escrowId)],
    });
    onChainSpecHash = parseEscrowTuple(data as unknown as EscrowStructTuple).specHash;
  } catch {
    return NextResponse.json({ error: "Couldn't verify escrow on-chain, try again" }, { status: 502 });
  }

  if (onChainSpecHash.toLowerCase() !== specHash.toLowerCase()) {
    return NextResponse.json({ error: 'specHash does not match the on-chain escrow' }, { status: 400 });
  }

  // txHash is optional here (unlike challenge-docs/feedback-messages' PATCH routes) — if the
  // caller supplies one, we only attach it once it checks out, same anti-fabrication standard
  // as every other on-chain-linked value this route already verifies above. But a failed check
  // (e.g. the RPC node the server hits hasn't caught up yet with a tx that just confirmed
  // client-side) must not block saving the spec text itself — that's already independently
  // verified via the hash match and on-chain specHash cross-check above. So we just drop the
  // tx_hash link rather than rejecting the whole save.
  let verifiedTxHash: string | null = null;
  if (txHash !== undefined) {
    const verification = await verifyMinedTxOnContract(
      getServerPublicClient(chainId),
      txHash,
      getSwarmEscrowConfig(chainId).address
    );
    if (verification.ok) {
      verifiedTxHash = txHash as string;
    }
  }

  let { error } = await getSupabaseAdmin()
    .from('escrow_specs')
    .upsert(
      { escrow_id: Number(escrowId), chain_id: chainId, spec_text: specText, spec_hash: specHash, tx_hash: verifiedTxHash },
      { onConflict: 'escrow_id,chain_id' }
    );

  // Same fallback intent as selectWithTxHashFallback on the read side — if the tx_hash
  // migration hasn't been applied to this project yet, still store the spec text itself rather
  // than losing it entirely just because the link-to-tx column is missing. Note the code differs
  // from the read path: a raw SQL select against a missing column returns Postgres's own 42703,
  // but an insert/upsert with an unrecognized JSON key is rejected by PostgREST's schema-cache
  // validation instead, which reports PGRST204 ("Could not find the column ... in the schema
  // cache") — confirmed by reproducing the exact error directly against the live table.
  if (error?.code === '42703' || error?.code === 'PGRST204') {
    ({ error } = await getSupabaseAdmin()
      .from('escrow_specs')
      .upsert(
        { escrow_id: Number(escrowId), spec_text: specText, spec_hash: specHash },
        { onConflict: 'escrow_id' }
      ));
  }

  if (error) {
    return NextResponse.json({ error: 'Failed to store spec text' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
