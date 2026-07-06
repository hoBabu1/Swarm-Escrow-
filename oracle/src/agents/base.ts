import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import type { RepoFile } from "../github/fetch.js";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// ============================================================================
// MODEL STRING — set here for local dev/testing per CLAUDE.md's AI budget
// guidance (~$5 total). Swap to "claude-sonnet-5" for the final demo run.
// Confirm before changing if unsure (CLAUDE.md: "AI Agent Calls").
// ============================================================================
export const AGENT_MODEL: string = "claude-haiku-4-5-20251001";

if (AGENT_MODEL !== "claude-sonnet-5") {
  console.warn(
    "\n" +
      "==================================================================\n" +
      `  AGENT_MODEL is "${AGENT_MODEL}" (Haiku, dev/testing only).\n` +
      "  This MUST be swapped to \"claude-sonnet-5\" in oracle/src/agents/base.ts\n" +
      "  before the final demo recording.\n" +
      "==================================================================\n",
  );
}

const MAX_TOKENS = 1024;

const VERDICT_TOOL: Anthropic.Tool = {
  name: "submit_verdict",
  description: "Submit your verdict on this escrow deliverable.",
  input_schema: {
    type: "object",
    properties: {
      approved: {
        type: "boolean",
        description: "true to approve the deliverable (release payment to the worker), false to reject it (refund the client)",
      },
      reasoning: {
        type: "string",
        description:
          "Your full reasoning for this verdict. This is stored (as a hash on-chain, full text off-chain) and shown to both the client and worker, so be specific and concrete.",
      },
    },
    required: ["approved", "reasoning"],
  },
};

export interface AgentVerdict {
  approved: boolean;
  reasoningText: string;
}

// Shared by Arbiter and Senior Arbiter, both of which need to show one or
// more prior agents' verdicts (with full reasoning) to the model.
export function formatPriorVerdict(role: string, verdict: AgentVerdict): string {
  return `${role} verdict: ${verdict.approved ? "APPROVED" : "REJECTED"}\n${role} reasoning: ${verdict.reasoningText}`;
}

export interface DeliverableContext {
  specText: string;
  repoUrl: string;
  commitHash: string;
  files: RepoFile[];
}

export function formatDeliverableContext(context: DeliverableContext): string {
  const fileBlocks = context.files
    .map((f) => `--- FILE: ${f.path} ---\n${f.content}`)
    .join("\n\n");
  return [
    `SPEC:\n${context.specText}`,
    `REPO: ${context.repoUrl}`,
    `PINNED COMMIT: ${context.commitHash}`,
    `DELIVERABLE FILES (${context.files.length}):\n${fileBlocks}`,
  ].join("\n\n");
}

// Shared call path for all 4 agent roles: forces a submit_verdict tool call
// so output parsing is a structured field read, not prose/JSON scraping.
export async function callAgent(systemPrompt: string, userContent: string): Promise<AgentVerdict> {
  const response = await anthropic.messages.create({
    model: AGENT_MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
    tools: [VERDICT_TOOL],
    tool_choice: { type: "tool", name: "submit_verdict" },
  });

  // If the model hits MAX_TOKENS mid-generation, the tool_use input can still
  // be structurally valid (a shorter, but well-typed, non-empty string) even
  // though it's actually a truncated cut-off of what the model intended to
  // say. Since reasoning text is stored and shown to both parties as the
  // audit trail for the verdict, silently accepting a truncated version would
  // misrepresent the process rather than just look a bit terse — fail loudly
  // instead so this surfaces as a retry/tuning problem, not a quiet data
  // quality bug.
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      `Agent response was cut off by max_tokens (${MAX_TOKENS}) before completing its verdict; reasoning would be truncated`,
    );
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "submit_verdict",
  );
  if (!toolUse) {
    throw new Error("Agent response did not include a submit_verdict tool call");
  }

  const input = toolUse.input as { approved?: unknown; reasoning?: unknown };
  if (typeof input.approved !== "boolean" || typeof input.reasoning !== "string" || input.reasoning.trim() === "") {
    throw new Error(`Agent returned a malformed verdict: ${JSON.stringify(input)}`);
  }

  return { approved: input.approved, reasoningText: input.reasoning };
}
