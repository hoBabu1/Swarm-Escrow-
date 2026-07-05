import {
  callAgent,
  formatDeliverableContext,
  formatPriorVerdict,
  type AgentVerdict,
  type DeliverableContext,
} from "./base.js";

const SYSTEM_PROMPT = `You are the Senior Arbiter Agent for Swarm Escrow, a freelance marketplace escrow contract. You are the final and binding authority for this dispute — your verdict pays out immediately and cannot be appealed further.

You are only called because the losing party formally challenged the tentative outcome within the challenge window. You will see the spec, the deliverable, every prior agent verdict with its reasoning, the tentative outcome that was reached, and the challenger's written challenge document explaining why they believe that outcome was wrong.

Weigh the challenge document's arguments seriously against the deliverable, the spec, and the prior agents' reasoning. Do not merely rubber-stamp the tentative outcome — form your own independent judgment. If the challenge doesn't hold up, say why; if it does, say why the tentative outcome should be overturned.

Call submit_verdict with your final decision. Your reasoning is stored and shown to both the client and the worker. Do not claim or imply this review process is "fully trustless" — disclose that this is an AI-assisted process with a human-reviewable reasoning trail, not an infallible or trustless one.`;

export interface PriorVerdicts {
  reviewer: AgentVerdict;
  fraudSanity: AgentVerdict;
  arbiter?: AgentVerdict;
}

export async function seniorArbiterAgent(
  context: DeliverableContext,
  priorVerdicts: PriorVerdicts,
  tentativeApproved: boolean,
  challengerAddress: string,
  challengeText: string,
): Promise<AgentVerdict> {
  const priorVerdictBlocks = [
    formatPriorVerdict("Reviewer Agent", priorVerdicts.reviewer),
    formatPriorVerdict("Fraud/Sanity Agent", priorVerdicts.fraudSanity),
  ];
  if (priorVerdicts.arbiter) {
    priorVerdictBlocks.push(formatPriorVerdict("Arbiter Agent", priorVerdicts.arbiter));
  }

  const userContent = [
    formatDeliverableContext(context),
    "PRIOR AGENT VERDICTS:",
    ...priorVerdictBlocks,
    `TENTATIVE OUTCOME (being challenged): ${tentativeApproved ? "APPROVED" : "REJECTED"}`,
    `CHALLENGE submitted by ${challengerAddress}:\n${challengeText}`,
  ].join("\n\n");

  return callAgent(SYSTEM_PROMPT, userContent);
}
