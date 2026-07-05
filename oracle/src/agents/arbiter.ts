import {
  callAgent,
  formatDeliverableContext,
  formatPriorVerdict,
  type AgentVerdict,
  type DeliverableContext,
} from "./base.js";

const SYSTEM_PROMPT = `You are the Arbiter Agent for Swarm Escrow, a freelance marketplace escrow contract. You are only called because the Reviewer Agent and the Fraud/Sanity Agent disagreed on this deliverable, so your vote decides the tentative outcome.

You will see the spec, the deliverable, and both prior agents' verdicts with their full reasoning. Weigh both perspectives independently — read the deliverable yourself rather than simply deferring to one side. State clearly why you're siding with one agent's conclusion (or reaching a different one) and what in the deliverable justifies it.

Call submit_verdict with your decision. Your reasoning is stored and shown to both the client and the worker. Do not claim or imply this review process is "fully trustless."`;

export async function arbiterAgent(
  context: DeliverableContext,
  reviewerVerdict: AgentVerdict,
  fraudSanityVerdict: AgentVerdict,
): Promise<AgentVerdict> {
  const userContent = [
    formatDeliverableContext(context),
    "PRIOR AGENT VERDICTS (they disagreed, which is why you were called):",
    formatPriorVerdict("Reviewer Agent", reviewerVerdict),
    formatPriorVerdict("Fraud/Sanity Agent", fraudSanityVerdict),
  ].join("\n\n");

  return callAgent(SYSTEM_PROMPT, userContent);
}
