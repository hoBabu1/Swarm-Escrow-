import { AgentRole, Status } from "../contract/types.js";
import { getEscrow, getVerdict } from "../contract/reads.js";
import type { VerdictStruct } from "../contract/types.js";
import { getEscrowSpecs, getVerdicts } from "../supabase/repository.js";
import { fetchRepoAtCommit } from "../github/fetch.js";
import { reviewerAgent, fraudSanityAgent, arbiterAgent } from "../agents/index.js";
import type { AgentVerdict, DeliverableContext } from "../agents/base.js";
import { submitAgentVerdict } from "../verdict/submit.js";
import { tryAutoResolve } from "./autoResolve.js";
import { logger } from "../lib/logger.js";
import type { DeliverableSubmittedEvent } from "../contract/events.js";
import { env } from "../config/env.js";

type ReviewOrFraudRole = AgentRole.Reviewer | AgentRole.FraudSanity;

// Splits "get this role's verdict" from "submit it on-chain": the AI call
// (expensive, no wallet interaction) is safe to parallelize across roles;
// the on-chain submission is not (single oracle wallet, no nonce mutex — see
// verdict/submit.ts), so callers must submit sequentially, one at a time.
async function computeOrFetchVerdict(
  escrowId: bigint,
  role: ReviewOrFraudRole,
  label: "reviewer" | "fraud_sanity",
  existing: VerdictStruct,
  context: DeliverableContext,
): Promise<{ verdict: AgentVerdict; needsSubmit: boolean }> {
  if (!existing.hasVoted) {
    const verdict = role === AgentRole.Reviewer ? await reviewerAgent(context) : await fraudSanityAgent(context);
    return { verdict, needsSubmit: true };
  }
  // Already voted on-chain (e.g. this event was replayed after a restart) —
  // reuse the stored reasoning text rather than re-spending on the AI call.
  const rows = await getVerdicts(Number(escrowId), env.CHAIN_ID);
  const row = rows.find((r) => r.agent_role === label);
  if (!row) {
    throw new Error(
      `On-chain verdict exists for escrow ${escrowId} role ${label} but no matching Supabase row was found (missing off-chain reasoning text)`,
    );
  }
  return { verdict: { approved: row.verdict, reasoningText: row.reasoning_text }, needsSubmit: false };
}

export async function handleDeliverableSubmitted(event: DeliverableSubmittedEvent): Promise<void> {
  const escrowId = event.escrowId;
  const logCtx = { escrowId: escrowId.toString() };
  try {
    logger.info("deliverable_submitted_received", {
      ...logCtx,
      repoUrl: event.repoUrl,
      commitHash: event.commitHash,
      block: event.blockNumber,
    });

    const escrow = await getEscrow(escrowId);
    if (escrow.status !== Status.DeliverableSubmitted) {
      // Already progressed past this state (a replayed historical event, or
      // resolve()/challenge already happened) — nothing to do.
      logger.info("deliverable_skip_wrong_status", { ...logCtx, status: escrow.status });
      return;
    }

    const [reviewerExisting, fraudSanityExisting, arbiterExisting] = await Promise.all([
      getVerdict(escrowId, AgentRole.Reviewer),
      getVerdict(escrowId, AgentRole.FraudSanity),
      getVerdict(escrowId, AgentRole.Arbiter),
    ]);

    const reviewerFraudSanityDone = reviewerExisting.hasVoted && fraudSanityExisting.hasVoted;
    const noArbiterNeeded = reviewerExisting.approved === fraudSanityExisting.approved;
    if (reviewerFraudSanityDone && (noArbiterNeeded || arbiterExisting.hasVoted)) {
      logger.info("deliverable_skip_already_complete", logCtx);
      await tryAutoResolve(escrowId);
      return;
    }

    const specRows = await getEscrowSpecs(Number(escrowId), env.CHAIN_ID);
    const specText = specRows[0]?.spec_text;
    if (!specText) {
      logger.error("deliverable_missing_spec_text", logCtx);
      return;
    }

    const { files, truncated, skippedForSize } = await fetchRepoAtCommit(escrow.repoUrl, escrow.commitHash);
    if (truncated) {
      logger.warn("deliverable_repo_content_truncated", { ...logCtx, skippedCount: skippedForSize.length });
    }

    const context: DeliverableContext = {
      specText,
      repoUrl: escrow.repoUrl,
      commitHash: escrow.commitHash,
      files,
    };

    // allSettled, not all: if one AI call fails after the other already
    // succeeded, we still want to submit the successful one on-chain rather
    // than discard already-paid-for output just because its sibling failed.
    const [reviewerSettled, fraudSanitySettled] = await Promise.allSettled([
      computeOrFetchVerdict(escrowId, AgentRole.Reviewer, "reviewer", reviewerExisting, context),
      computeOrFetchVerdict(escrowId, AgentRole.FraudSanity, "fraud_sanity", fraudSanityExisting, context),
    ]);

    if (reviewerSettled.status === "fulfilled" && reviewerSettled.value.needsSubmit) {
      await submitAgentVerdict(escrowId, AgentRole.Reviewer, reviewerSettled.value.verdict);
      logger.info("agent_verdict_submitted", {
        ...logCtx,
        role: "reviewer",
        approved: reviewerSettled.value.verdict.approved,
      });
    }
    if (fraudSanitySettled.status === "fulfilled" && fraudSanitySettled.value.needsSubmit) {
      await submitAgentVerdict(escrowId, AgentRole.FraudSanity, fraudSanitySettled.value.verdict);
      logger.info("agent_verdict_submitted", {
        ...logCtx,
        role: "fraud_sanity",
        approved: fraudSanitySettled.value.verdict.approved,
      });
    }

    if (reviewerSettled.status === "rejected" || fraudSanitySettled.status === "rejected") {
      // Can't check disagreement without both sides. The side that
      // succeeded is already submitted above; the failed side will be
      // retried on the next tick/restart (computeOrFetchVerdict reuses
      // whichever already voted, so no wasted re-spend on the good side).
      if (reviewerSettled.status === "rejected") {
        logger.error("reviewer_agent_failed", { ...logCtx, error: String(reviewerSettled.reason) });
      }
      if (fraudSanitySettled.status === "rejected") {
        logger.error("fraud_sanity_agent_failed", { ...logCtx, error: String(fraudSanitySettled.reason) });
      }
      return;
    }

    const reviewerVerdict = reviewerSettled.value.verdict;
    const fraudSanityVerdict = fraudSanitySettled.value.verdict;

    if (reviewerVerdict.approved !== fraudSanityVerdict.approved && !arbiterExisting.hasVoted) {
      logger.info("deliverable_disagreement_calling_arbiter", logCtx);
      const arbiterVerdict = await arbiterAgent(context, reviewerVerdict, fraudSanityVerdict);
      await submitAgentVerdict(escrowId, AgentRole.Arbiter, arbiterVerdict);
      logger.info("agent_verdict_submitted", { ...logCtx, role: "arbiter", approved: arbiterVerdict.approved });
    }

    await tryAutoResolve(escrowId);

    logger.info("deliverable_processing_complete", logCtx);
  } catch (err) {
    // Never let one escrow's failure propagate up to the poller and block
    // its tick for other events in the same batch (see contract/events.ts) —
    // log it and move on; this escrow is safely retried on a future
    // tick/restart since every step above is idempotent.
    logger.error("deliverable_processing_failed", {
      ...logCtx,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
