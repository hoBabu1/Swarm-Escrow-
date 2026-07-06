# CLAUDE.md — Swarm Escrow

Guidance for Claude Code when working in this repo. Read this fully before making changes.

**Reviewer subagent discoverability:** Reviewer subagents live under `frontend/.claude/agents/`, which this harness does not scan for invocable subagent types (only root `.claude/agents/` is discovered). Never substitute self-review when a named reviewer can't be found — instead spawn a `general-purpose` agent per reviewer, instruct it to read that reviewer's `.md` file in full and adopt it verbatim as its persona, and treat its verdict as the actual independent review. Follow each persona's own restart rule after every fix.

## Project Overview

**Swarm Escrow** — a freelance/marketplace escrow smart contract for the **BOT Chain Builder Challenge #1** hackathon (AI Agent track, primary).

Instead of a human, DAO, or single AI judging submitted work, **three distinct AI agent roles vote 2-of-3** before funds are tentatively resolved. A **challenge window** then allows the losing party to dispute once, triggering a 4th **Senior Arbiter** AI role for a final, binding verdict.

- **Reviewer Agent** — checks the deliverable against the agreed spec
- **Fraud/Sanity Agent** — checks for gaming, fake submissions, or spec mismatch
- **Arbiter Agent** — only called if Reviewer and Fraud/Sanity disagree; casts the deciding vote
- **Senior Arbiter Agent** — only called if the losing party challenges the tentative outcome; casts the final, binding verdict

Each agent's verdict + a hash of its reasoning is stored on-chain. Full reasoning text, spec text, challenge documents, and feedback messages are stored off-chain (Supabase) and linked by hash, so anyone can verify what's on-chain matches what's displayed in the UI.

**Deliverable format (explicitly scoped):** a **public GitHub repo pinned to a specific commit SHA**. Private-repo / GitHub App support is **out of scope** for this hackathon — mention it only as a future roadmap item in the writeup, never imply it's supported now.

## Hard Constraints — Do Not Violate

- **Escrow funds are native BOT token only.** No ERC-20, no `approve`/`transferFrom` flow. Use `payable` functions and `msg.value` / low-level `.call{value: ...}`.
- **Only the oracle wallet may call `submitVerdict` and `submitSeniorArbiterVerdict`.** Enforced with proper access control, not just a comment.
- **No claims of "fully trustless AI verification"** anywhere in code comments, UI copy, or docs. The AI oracle pattern has a real centralization tradeoff (verdicts computed off-chain, and an owner emergency rescue path exists). State this honestly wherever it's discussed.
- **No private-repo support.** Public repo + pinned commit SHA only.
- **No database for on-chain state.** Contract state is always read live from the chain — never mirrored/cached as source of truth in Supabase. Supabase is only for off-chain text linked by on-chain hashes (spec, reasoning, challenge docs, feedback messages).
- **Single-agent dev workflow.** User reviews every step. Do not chain multiple autonomous agent calls together without pausing for review on anything touching fund movement or access control.
- **The original 3-agent voting logic (`Verdict[3]`, `resolve()`'s 2-of-3 tally) must never be altered or resized to accommodate new roles.** The Senior Arbiter's verdict is stored completely separately.
- **The emergency owner rescue function may only ever send funds to that specific escrow's recorded `client` or `worker` address** — never an arbitrary address, and never before its extra safety buffer has elapsed.

## Tech Stack

| Layer | Choice |
|---|---|
| Smart contract | Solidity + **Foundry** (forge test, forge script for deploy — no Hardhat) |
| Static analysis | Slither (run before considering contract "done") |
| Contract libraries | OpenZeppelin (ReentrancyGuard, Ownable) — don't hand-roll these |
| Oracle/backend | Node.js + TypeScript, deployed as a persistent worker on **Render** |
| Chain interaction (oracle) | ethers.js v6 |
| AI calls | `@anthropic-ai/sdk` |
| GitHub fetching | Octokit |
| Frontend | Next.js |
| Frontend wallet/contract | wagmi + viem + RainbowKit |
| Off-chain text storage | Supabase |
| Package manager | npm (all JS/TS packages) |

## Repo Structure (monorepo, single git repo at root)

```
swarm-escrow/
├── contracts/       # Foundry project — SwarmEscrow.sol, tests, deploy scripts
├── oracle/          # Node/TS — polling loop, GitHub fetch, 4 AI agent calls, on-chain verdict posting
├── frontend/        # Next.js — create escrow, submit deliverable, challenge, live status, dashboard
├── supabase/        # SQL schema for off-chain text storage
├── .env.example
├── .gitignore
└── CLAUDE.md
```

## Network Config

- **Testnet:** Chain ID 968, RPC `https://rpc.bohr.life`, faucet `https://faucet.botchain.ai/basic`
- **Mainnet:** Chain ID 677, RPC `https://rpc.botchain.ai` (only if time permits after testnet is solid)

## Contract — Full State Machine

```
Created → DeliverableSubmitted → PendingChallenge → Resolved | Refunded
                                        ↓ (losing party challenges, one-time, within challengeWindow)
                                   Challenged → Resolved | Refunded
                                        ↓ (oracle never responds within seniorArbiterDeadline)
                                   (falls back to original tentative outcome)
```

Any non-terminal escrow can, as a last resort, be moved to a terminal state by the owner via `emergencyRescue`, gated behind an extra safety buffer beyond all other deadlines.

**Enums:**
```solidity
enum Status { Created, DeliverableSubmitted, PendingChallenge, Challenged, Resolved, Refunded }
enum AgentRole { Reviewer, FraudSanity, Arbiter }
```

**Core functions:**
- `createEscrow(address worker, bytes32 specHash, uint256 deadline)` — payable, client deposits BOT. Also records the escrow ID under both `clientEscrows[client]` and `workerEscrows[worker]`.
- `submitDeliverable(uint256 escrowId, string repoUrl, string commitHash)` — worker only.
- `submitVerdict(uint256 escrowId, AgentRole agentRole, bool approved, bytes32 reasoningHash)` — oracle-only. Records one vote. Does NOT resolve.
- `resolve(uint256 escrowId)` — callable by anyone. Once 2-of-3 consensus exists, computes the **tentative** outcome, sets status to `PendingChallenge`, starts `challengeDeadline = block.timestamp + challengeWindow`. Does NOT transfer funds yet.
- `challenge(uint256 escrowId, bytes32 reasoningHash)` — callable ONCE, only by the losing party (if tentative outcome was approve, loser is client; if reject, loser is worker), only before `challengeDeadline`. Sets status to `Challenged`, starts `seniorArbiterDeadline`.
- `submitSeniorArbiterVerdict(uint256 escrowId, bool approved, bytes32 reasoningHash)` — oracle-only, only when status is `Challenged`. Final and binding — pays out immediately per `approved`.
- `resolveAfterSeniorArbiterTimeout(uint256 escrowId)` — callable by anyone, only when status is `Challenged` and `block.timestamp > seniorArbiterDeadline`. Falls back to the original tentative outcome (challenging can never make funds unrecoverable).
- `finalizeAfterChallengeWindow(uint256 escrowId)` — callable by anyone, only when status is `PendingChallenge` and `block.timestamp > challengeDeadline` (i.e. nobody challenged). Pays out per the tentative outcome.
- `reclaimAfterDeadline(uint256 escrowId)` — client only. Callable if `block.timestamp > deadline` and status is still `Created` or `DeliverableSubmitted` (never reached consensus at all). Refunds full deposit.
- `emergencyRescue(uint256 escrowId, address payable recipient)` — **owner only**. Requires status is not already `Resolved`/`Refunded`, requires `recipient == escrow.client || recipient == escrow.worker` (never an arbitrary address), requires `block.timestamp > escrow.deadline + emergencyDelay` (an extra owner-configurable buffer on top of every other deadline, ensuring this can never preempt the normal paths). Pays the full escrow amount to `recipient`, sets a terminal status, `nonReentrant`, checks-effects-interactions. This is a deliberate, disclosed centralization tradeoff — a genuine last-resort safety valve, not a routine path.
- `setChallengeWindow(uint256)`, `setSeniorArbiterWindow(uint256)`, `setEmergencyDelay(uint256)`, `setOracleAddress(address)` — owner-only setters. `owner` is the deployer (OpenZeppelin `Ownable`), separate from `oracleAddress`.
- `getClientEscrows(address)`, `getWorkerEscrows(address)` — public view functions returning all escrow IDs for that address (powers the wallet-connect earnings/history dashboard).
- `leaveFeedback(uint256 escrowId, bytes32 messageHash)` — callable once per side, only after a terminal status (`Resolved`/`Refunded`). Client and worker each get exactly one feedback message to the other.

**Spec, reasoning, challenge docs, and feedback storage:** all follow the same pattern — hash on-chain (`bytes32`), full text in Supabase, linked by that hash.

**Deadline/timeout hierarchy (all owner-configurable, short values for testnet demo, stated production values in the writeup):**
1. `deadline` — original escrow deadline (client can reclaim if worker never submits or agents never reach initial consensus)
2. `challengeWindow` — production target: 3 days
3. `seniorArbiterWindow` — window for the oracle to respond after a challenge, before the tentative outcome stands by default
4. `emergencyDelay` — additional buffer on top of `deadline`, before the owner's last-resort rescue becomes callable

## Testing Requirements (Foundry)

- Unit tests covering every state transition and every access-control restriction across the FULL state machine, including all new challenge/rescue paths and their negative cases (wrong caller, wrong state, double-challenge, double-feedback, finalize-before-window, senior-arbiter-called-without-challenge, emergency-rescue-to-wrong-address, emergency-rescue-before-buffer, etc).
- Fuzz tests on deposit amounts, vote combinations, and all timing/deadline edge cases across every window.
- Exactly 2 core invariants, rewritten to hold across the full state machine:
  1. Contract's BOT balance always equals the sum of all escrow amounts not yet in a terminal (`Resolved`/`Refunded`) state.
  2. No escrow reaches `Resolved` or `Refunded` unless EITHER (a) it recorded 2-of-3 consensus among Reviewer/FraudSanity/Arbiter and was never successfully challenged, OR (b) a valid Senior Arbiter verdict was recorded following a valid challenge, OR (c) the senior-arbiter-timeout fallback paid out the original tentative verdict, OR (d) the owner's emergency rescue path was used (a separate, explicitly-flagged bypass).
- Do not consider the contract done until `forge test` is fully green and Slither has no unaddressed high/medium findings.

## Supabase Schema

```sql
create table verdicts (
  escrow_id bigint,
  agent_role text,       -- 'reviewer' | 'fraud_sanity' | 'arbiter' | 'senior_arbiter'
  verdict boolean,
  reasoning_text text,
  reasoning_hash text,
  tx_hash text,           -- submitVerdict/submitSeniorArbiterVerdict tx hash, nullable (oracle not yet wired to set this)
  created_at timestamp default now()
);

create table escrow_specs (
  escrow_id bigint,
  spec_text text,
  spec_hash text,
  tx_hash text,           -- createEscrow tx hash, nullable for rows written before this column existed
  created_at timestamp default now()
);

create table challenge_docs (
  escrow_id bigint,
  challenger_address text,
  document_text text,
  document_hash text,
  tx_hash text,           -- challenge() tx hash, set via a follow-up PATCH once the tx confirms
  created_at timestamp default now()
);

create table feedback_messages (
  escrow_id bigint,
  sender_address text,   -- client or worker address
  message_text text,
  message_hash text,
  tx_hash text,           -- leaveFeedback() tx hash, set via a follow-up PATCH once the tx confirms
  created_at timestamp default now()
);
```

## Environment Variables (`.env`, never commit)

ORACLE_PRIVATE_KEY=
ANTHROPIC_API_KEY=
RPC_URL_TESTNET=https://rpc.bohr.life
CONTRACT_ADDRESS=0xc45d948467Dd39278a456D4341C00C14F31300b2
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
POLL_INTERVAL_SECONDS=10

On Render, these are set in the platform's environment variable dashboard, not committed to `.env`.

## Oracle Design Decisions

- **Detection method:** polling every 5-10 seconds against the testnet RPC — no confirmed WebSocket endpoint. Acceptable latency for demo purposes.
- **GitHub fetch scope:** all files at the pinned commit SHA, excluding `node_modules`, `.git`, build artifacts, lockfiles, and binary/image files, with a reasonable total size cap.
- **Deployment:** persistent worker process on Render, not local-only.
- **One oracle wallet, not one per agent.** All AI roles (including Senior Arbiter) are different prompts/system messages, submitted on-chain by the same oracle wallet.
- **One Anthropic API key covers all agent roles.** Reviewer and Fraud/Sanity always run; Arbiter only runs on disagreement; Senior Arbiter only runs on a challenge.

## AI Agent Calls

- Reviewer and Fraud/Sanity always called on a new submission. Arbiter only if they disagree. Senior Arbiter only if a challenge is raised.
- Budget ~$5 total. Use Haiku for local dev/testing iterations; Sonnet for the final demo run. Confirm before changing models if unsure.

## Build Sequence

1. **Day 1:** Core contract (createEscrow, submitDeliverable, submitVerdict, resolve, reclaimAfterDeadline) — done, tested, not yet deployed.
2. **Day 1 (extended):** Challenge/dispute window, Senior Arbiter, per-address history, feedback, emergency rescue — in progress.
3. **Day 1 (final):** Deploy to testnet, manual end-to-end test without AI in the loop.
4. **Day 2:** Oracle script — GitHub fetch, all 4 AI agent roles, on-chain verdict posting, deployed to Render.
5. **Day 3:** Frontend (including wallet-connect earnings/history dashboard powered by getClientEscrows/getWorkerEscrows). Start 1-2 PR/bug bounty submissions in parallel.
6. **Day 4:** Polish, demo recording, writeup (explicitly disclosing the AI-oracle and emergency-rescue centralization tradeoffs), X showcase post, submission form.

## When Unsure

If a requirement, naming convention, or design choice isn't explicitly covered above or in chat, ask before assuming. Do not silently pick a default for anything touching: fund movement logic, access control, escrow state machine, or what counts as "done" for a task.