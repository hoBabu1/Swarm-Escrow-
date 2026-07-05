import { AgentRole, Status } from "../contract/types.js";
import { getEscrow, getAllVerdicts, getSeniorArbiterVote } from "../contract/reads.js";
import { getEscrowSpecs, getChallengeDocs, getVerdicts } from "../supabase/repository.js";
import { fetchRepoAtCommit } from "../github/fetch.js";
import { seniorArbiterAgent, type PriorVerdicts } from "../agents/index.js";
import type { DeliverableContext } from "../agents/base.js";
import { submitSeniorArbiterVerdict } from "../verdict/submit.js";
import { logger } from "../lib/logger.js";
import type { ChallengeRaisedEvent } from "../contract/events.js";

export async function handleChallengeRaised(event: ChallengeRaisedEvent): Promise<void> {
  const escrowId = event.escrowId;
  const logCtx = { escrowId: escrowId.toString() };
  try {
    logger.info("challenge_raised_received", { ...logCtx, challenger: event.challenger, block: event.blockNumber });

    const escrow = await getEscrow(escrowId);
    if (escrow.status !== Status.Challenged) {
      logger.info("challenge_skip_wrong_status", { ...logCtx, status: escrow.status });
      return;
    }

    const seniorExisting = await getSeniorArbiterVote(escrowId);
    if (seniorExisting.hasVoted) {
      logger.info("challenge_skip_already_voted", logCtx);
      return;
    }

    const specRows = await getEscrowSpecs(Number(escrowId));
    const specText = specRows[0]?.spec_text;
    if (!specText) {
      logger.error("challenge_missing_spec_text", logCtx);
      return;
    }

    const challengeDocRows = await getChallengeDocs(Number(escrowId));
    const challengeText = challengeDocRows[0]?.document_text;
    if (!challengeText) {
      logger.error("challenge_missing_document_text", logCtx);
      return;
    }

    const [{ files, truncated, skippedForSize }, allVerdicts, verdictRows] = await Promise.all([
      fetchRepoAtCommit(escrow.repoUrl, escrow.commitHash),
      getAllVerdicts(escrowId),
      getVerdicts(Number(escrowId)),
    ]);
    if (truncated) {
      logger.warn("challenge_repo_content_truncated", { ...logCtx, skippedCount: skippedForSize.length });
    }

    const reasoningFor = (label: "reviewer" | "fraud_sanity" | "arbiter"): string =>
      verdictRows.find((r) => r.agent_role === label)?.reasoning_text ?? "";

    const priorVerdicts: PriorVerdicts = {
      reviewer: { approved: allVerdicts[AgentRole.Reviewer].approved, reasoningText: reasoningFor("reviewer") },
      fraudSanity: {
        approved: allVerdicts[AgentRole.FraudSanity].approved,
        reasoningText: reasoningFor("fraud_sanity"),
      },
      ...(allVerdicts[AgentRole.Arbiter].hasVoted
        ? { arbiter: { approved: allVerdicts[AgentRole.Arbiter].approved, reasoningText: reasoningFor("arbiter") } }
        : {}),
    };

    const context: DeliverableContext = {
      specText,
      repoUrl: escrow.repoUrl,
      commitHash: escrow.commitHash,
      files,
    };

    const verdict = await seniorArbiterAgent(
      context,
      priorVerdicts,
      escrow.tentativeApproved,
      event.challenger,
      challengeText,
    );
    await submitSeniorArbiterVerdict(escrowId, verdict);
    logger.info("senior_arbiter_verdict_submitted", { ...logCtx, approved: verdict.approved });
  } catch (err) {
    logger.error("challenge_processing_failed", {
      ...logCtx,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
