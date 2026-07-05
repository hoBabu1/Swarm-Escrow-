import { keccak256, toUtf8Bytes } from "ethers";
import { contract } from "../contract/client.js";
import { getVerdict, getSeniorArbiterVote } from "../contract/reads.js";
import { AgentRole } from "../contract/types.js";
import { insertVerdict, getVerdicts, SupabaseRepositoryError, DUPLICATE_INSERT_CODE } from "../supabase/repository.js";
import type { AgentRoleLabel } from "../supabase/types.js";
import type { AgentVerdict } from "../agents/base.js";

const AGENT_ROLE_LABELS: Record<AgentRole, AgentRoleLabel> = {
  [AgentRole.Reviewer]: "reviewer",
  [AgentRole.FraudSanity]: "fraud_sanity",
  [AgentRole.Arbiter]: "arbiter",
};

const SENIOR_ARBITER_LABEL: AgentRoleLabel = "senior_arbiter";

export function reasoningHashOf(reasoningText: string): string {
  return keccak256(toUtf8Bytes(reasoningText));
}

export interface SubmitResult {
  // False when this call found the verdict already recorded on-chain and
  // skipped straight to (idempotently) backfilling Supabase — i.e. no new
  // transaction was sent.
  submittedOnChain: boolean;
  txHash?: string;
}

// Idempotency guard: on-chain vote state is the single source of truth (per
// CLAUDE.md, never mirrored elsewhere). If a verdict is already recorded,
// this is a safe no-op UNLESS the reasoning we were just asked to submit
// hashes differently than what's already on-chain — that would mean the
// same agent role is being asked to vote twice with different reasoning,
// which is a real bug (e.g. non-deterministic re-generation on retry), not a
// safe retry, so it fails loudly instead of silently accepting either value.
async function ensureSupabaseRow(
  escrowId: bigint,
  label: AgentRoleLabel,
  verdict: AgentVerdict,
  reasoningHash: string,
): Promise<void> {
  try {
    await insertVerdict({
      escrow_id: Number(escrowId),
      agent_role: label,
      verdict: verdict.approved,
      reasoning_text: verdict.reasoningText,
      reasoning_hash: reasoningHash,
    });
  } catch (err) {
    if (err instanceof SupabaseRepositoryError && err.code === DUPLICATE_INSERT_CODE) {
      const existing = await getVerdicts(Number(escrowId));
      const match = existing.find((v) => v.agent_role === label);
      // Compare BOTH the hash and the approved boolean — a hash-only check
      // would treat a retry carrying a different approved value (while
      // somehow still hashing the same reasoning text) as a safe no-op and
      // silently leave a mismatched `approved` in Supabase with nothing on
      // either side to catch it.
      if (
        !match ||
        match.reasoning_hash.toLowerCase() !== reasoningHash.toLowerCase() ||
        match.verdict !== verdict.approved
      ) {
        throw new Error(
          `Supabase already has a verdict row for escrow ${escrowId} role ${label} that does NOT match what was just computed (reasoning_hash and/or approved differ). Refusing to proceed silently — this is a real inconsistency, not a safe retry.`,
        );
      }
      return; // already backfilled with matching content — safe idempotent no-op
    }
    throw err;
  }
}

export async function submitAgentVerdict(
  escrowId: bigint,
  role: AgentRole,
  verdict: AgentVerdict,
): Promise<SubmitResult> {
  const label = AGENT_ROLE_LABELS[role];
  const reasoningHash = reasoningHashOf(verdict.reasoningText);

  const existing = await getVerdict(escrowId, role);
  if (existing.hasVoted) {
    // Compare BOTH the hash and the approved boolean before treating this as
    // a safe idempotent retry — a hash-only check would let a request
    // carrying a different `approved` value slip through undetected if it
    // somehow still hashed the same, silently diverging on-chain truth from
    // whatever gets written to Supabase next.
    if (
      existing.reasoningHash.toLowerCase() !== reasoningHash.toLowerCase() ||
      existing.approved !== verdict.approved
    ) {
      throw new Error(
        `Escrow ${escrowId} role ${label} already has an on-chain verdict (approved=${existing.approved}, reasoningHash ${existing.reasoningHash}) that does NOT match what was just computed (approved=${verdict.approved}, reasoningHash ${reasoningHash}). Refusing to submit — this indicates non-deterministic re-generation or a real bug, not a safe retry.`,
      );
    }
    await ensureSupabaseRow(escrowId, label, verdict, reasoningHash);
    return { submittedOnChain: false };
  }

  const tx = await contract.submitVerdict(escrowId, role, verdict.approved, reasoningHash);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`submitVerdict for escrow ${escrowId} role ${label} failed or reverted (tx: ${tx.hash})`);
  }

  await ensureSupabaseRow(escrowId, label, verdict, reasoningHash);
  return { submittedOnChain: true, txHash: tx.hash };
}

export async function submitSeniorArbiterVerdict(escrowId: bigint, verdict: AgentVerdict): Promise<SubmitResult> {
  const reasoningHash = reasoningHashOf(verdict.reasoningText);

  const existing = await getSeniorArbiterVote(escrowId);
  if (existing.hasVoted) {
    if (
      existing.reasoningHash.toLowerCase() !== reasoningHash.toLowerCase() ||
      existing.approved !== verdict.approved
    ) {
      throw new Error(
        `Escrow ${escrowId} senior arbiter verdict already exists on-chain (approved=${existing.approved}, reasoningHash ${existing.reasoningHash}) that does NOT match what was just computed (approved=${verdict.approved}, reasoningHash ${reasoningHash}). Refusing to submit — this indicates non-deterministic re-generation or a real bug, not a safe retry.`,
      );
    }
    await ensureSupabaseRow(escrowId, SENIOR_ARBITER_LABEL, verdict, reasoningHash);
    return { submittedOnChain: false };
  }

  const tx = await contract.submitSeniorArbiterVerdict(escrowId, verdict.approved, reasoningHash);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`submitSeniorArbiterVerdict for escrow ${escrowId} failed or reverted (tx: ${tx.hash})`);
  }

  await ensureSupabaseRow(escrowId, SENIOR_ARBITER_LABEL, verdict, reasoningHash);
  return { submittedOnChain: true, txHash: tx.hash };
}
