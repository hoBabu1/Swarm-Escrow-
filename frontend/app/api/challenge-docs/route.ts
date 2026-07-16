import { NextRequest, NextResponse } from 'next/server';
import { keccak256, toBytes } from 'viem';
import { getSwarmEscrowConfig } from '@/lib/contract';
import { getServerPublicClient, isSupportedChainId } from '@/lib/serverChain';
import { EscrowStatus, EscrowStructTuple, parseEscrowTuple } from '@/lib/hooks/useEscrow';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sameAddress } from '@/lib/escrowFormat';
import { createIpRateLimiter } from '@/lib/rateLimit';
import { verifyMinedTxOnContract } from '@/lib/verifyOnChainTx';

// Same single-process, per-IP limiter as escrow-specs — sufficient to blunt spam for this
// hackathon deployment without pulling in an external store.
const isRateLimited = createIpRateLimiter(60_000, 10);

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests, try again shortly' }, { status: 429 });
  }

  let body: {
    escrowId?: number | string;
    chainId?: number;
    challengerAddress?: string;
    documentText?: string;
    documentHash?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { escrowId, chainId, challengerAddress, documentText, documentHash } = body;

  if (escrowId === undefined || Number.isNaN(Number(escrowId))) {
    return NextResponse.json({ error: 'escrowId is required' }, { status: 400 });
  }
  if (!isSupportedChainId(chainId)) {
    return NextResponse.json({ error: 'chainId is required and must be a supported network' }, { status: 400 });
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
    const data = await getServerPublicClient(chainId).readContract({
      ...getSwarmEscrowConfig(chainId),
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
      {
        escrow_id: Number(escrowId),
        chain_id: chainId,
        challenger_address: challengerAddress,
        document_text: documentText,
        document_hash: documentHash,
      },
      { onConflict: 'escrow_id,chain_id' }
    );

  if (error) {
    return NextResponse.json({ error: 'Failed to store challenge document' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// Called after the challenge() tx confirms, to attach the tx hash to the row already written
// above (that write happens before the tx, since documentHash is an input to it, not a result).
export async function PATCH(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests, try again shortly' }, { status: 429 });
  }

  let body: { escrowId?: number | string; chainId?: number; txHash?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { escrowId, chainId, txHash } = body;
  if (escrowId === undefined || Number.isNaN(Number(escrowId))) {
    return NextResponse.json({ error: 'escrowId is required' }, { status: 400 });
  }
  if (!isSupportedChainId(chainId)) {
    return NextResponse.json({ error: 'chainId is required and must be a supported network' }, { status: 400 });
  }

  const verification = await verifyMinedTxOnContract(
    getServerPublicClient(chainId),
    txHash,
    getSwarmEscrowConfig(chainId).address
  );
  if (!verification.ok) {
    return NextResponse.json({ error: verification.message }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from('challenge_docs')
    .update({ tx_hash: txHash })
    .eq('escrow_id', Number(escrowId))
    .eq('chain_id', chainId);

  if (error) {
    return NextResponse.json({ error: 'Failed to store tx hash' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
