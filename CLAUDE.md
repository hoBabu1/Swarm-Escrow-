# CLAUDE.md — Swarm Escrow

Guidance for Claude Code when working in this repo. Read this fully before making changes.

## Project Overview

**Swarm Escrow** — a freelance/marketplace escrow smart contract for the **BOT Chain Builder Challenge #1** hackathon (AI Agent track, primary).

Instead of a human, DAO, or single AI judging submitted work, **three distinct AI agent roles vote 2-of-3** before funds are released or refunded:
- **Reviewer Agent** — checks the deliverable against the agreed spec
- **Fraud/Sanity Agent** — checks for gaming, fake submissions, or spec mismatch
- **Arbiter Agent** — only called if Reviewer and Fraud/Sanity disagree; casts the deciding vote

Each agent's verdict + a hash of its reasoning is stored on-chain. Full reasoning text is stored off-chain (Supabase) and linked by that hash, so anyone can verify what was recorded on-chain matches what's displayed in the UI.

**Deliverable format (explicitly scoped):** a **public GitHub repo pinned to a specific commit SHA**. Private-repo / GitHub App support is **out of scope** for this hackathon — mention it only as a future roadmap item in the writeup, never imply it's supported now.

## Hard Constraints — Do Not Violate

- **Escrow funds are native BOT token only.** No ERC-20, no `approve`/`transferFrom` flow. Use `payable` functions and `msg.value` / low-level `.call{value: ...}`.
- **Only the oracle wallet may call `submitVerdict`.** This must be enforced with proper access control (not just a comment) — this is the single most important access-control check in the contract.
- **No claims of "fully trustless AI verification"** anywhere in code comments, UI copy, or docs. The AI oracle pattern has a real centralization tradeoff (verdicts are computed off-chain). State this honestly wherever it's discussed.
- **No private-repo support.** Do not build GitHub App / OAuth flows. Public repo + pinned commit SHA only.
- **No database for on-chain state.** Contract state (escrow status, amounts, addresses) is always read live from the chain — never mirrored/cached as source of truth in Supabase. Supabase is *only* for full AI reasoning text (see below).
- **Single-agent dev workflow.** I (the user) review every step. Do not chain multiple autonomous agent calls together to write code without me reviewing the diff in between. If a task is complex, break it into smaller steps and pause for my review rather than looping autonomously.

## Tech Stack

| Layer | Choice |
|---|---|
| Smart contract | Solidity + **Foundry** (forge test, forge script for deploy — no Hardhat) |
| Static analysis | Slither (run before considering contract "done") |
| Contract libraries | OpenZeppelin (ReentrancyGuard, Ownable/AccessControl) — don't hand-roll these |
| Oracle/backend | Node.js + TypeScript |
| Chain interaction (oracle) | ethers.js v6 |
| AI calls | `@anthropic-ai/sdk` |
| GitHub fetching | Octokit |
| Frontend | Next.js |
| Frontend wallet/contract | wagmi + viem + RainbowKit |
| Off-chain reasoning storage | Supabase (one table, see schema below) |
| Package manager | npm (all JS/TS packages) |

## Repo Structure (monorepo)

```
swarm-escrow/
├── contracts/       # Foundry project — SwarmEscrow.sol, tests, deploy scripts
├── oracle/          # Node/TS — event listener, GitHub fetch, 3 AI agent calls, on-chain verdict posting
├── frontend/         # Next.js — create escrow, submit deliverable, live verdict status
├── supabase/         # SQL schema for reasoning-text storage
├── .env.example       # documents required env vars, never commit actual .env
├── .gitignore
└── CLAUDE.md
```

## Network Config

- **Testnet:** Chain ID 968, RPC `https://rpc.bohr.life`, faucet `https://faucet.botchain.ai/basic`
- **Mainnet:** Chain ID 677, RPC `https://rpc.botchain.ai` (only if time permits after testnet is solid — testnet is the primary target for the hackathon deadline)

## Contract — Escrow States

```
Created → DeliverableSubmitted → Voting → Resolved (Released | Refunded)
```

Core functions (naming/signatures to be finalized when we write the contract — do not invent function signatures beyond what's agreed in chat):
- `createEscrow(address worker, string specHash, uint256 deadline)` — payable, client deposits BOT
- `submitDeliverable(uint256 escrowId, string repoUrl, string commitHash)` — worker only
- `submitVerdict(uint256 escrowId, uint8 agentRole, bool approved, bytes32 reasoningHash)` — **oracle wallet only**
- `resolve(uint256 escrowId)` — triggers release/refund once 2-of-3 consensus reached

## Testing Requirements (Foundry)

- **Unit tests** covering every state transition and every access-control restriction (including the negative cases — e.g. non-oracle address calling `submitVerdict` must revert).
- **Fuzz tests** on deposit amounts, vote combinations, and timing/deadline edge cases.
- **Exactly 2 invariant tests**, minimum:
  1. Contract's BOT balance always equals the sum of all unresolved escrow amounts.
  2. No escrow can reach `Resolved` state without a recorded 2-of-3 agent consensus.
- Do not consider the contract done until `forge test` is fully green **and** Slither has been run with no unaddressed high/medium findings.

## Supabase Schema (reasoning text only)

One table, kept thin — do not expand scope beyond this without asking first:

```sql
create table verdicts (
  escrow_id bigint,
  agent_role text,       -- 'reviewer' | 'fraud_sanity' | 'arbiter'
  verdict boolean,
  reasoning_text text,
  reasoning_hash text,    -- must match the hash stored on-chain
  created_at timestamp default now()
);
```

## Environment Variables (`.env`, never commit)

```
ORACLE_PRIVATE_KEY=
ANTHROPIC_API_KEY=
RPC_URL_TESTNET=https://rpc.bohr.life
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

## AI Agent Calls

- **One Anthropic API key covers all 3 agent roles** — each is a separate API call with a different system prompt, not a separate account/key.
- Reviewer and Fraud/Sanity are always called. Arbiter is only called if they disagree — don't call it unconditionally, it wastes API budget for no reason.
- Budget is ~$5 total. Use Haiku for local dev/testing iterations; switch to Sonnet only for the final demo run, to conserve budget without needing to ask each time — but confirm with me before changing models mid-build if unsure.

## Build Sequence (do not skip ahead)

1. **Day 1:** Contract skeleton + deploy to testnet + manual (non-AI) verdict trigger. Prove deposit → submit → release/refund works end-to-end with real tx hashes before touching AI.
2. **Day 2:** Oracle script — GitHub fetch at pinned commit, 3 AI agent calls, post verdict on-chain for real.
3. **Day 3:** Bare functional frontend wired to the contract. Start 1-2 PR/bug bounty submissions in parallel (separate from this repo).
4. **Day 4:** Polish, demo recording, writeup, X showcase post, submission form.

Do not start frontend polish or CI/CD setup before Day 3 — contract and oracle correctness come first.

## When Unsure

If a requirement, naming convention, or design choice isn't explicitly covered above or in chat, **ask before assuming.** Do not silently pick a default for anything touching: fund movement logic, access control, escrow state machine, or what counts as "done" for a task.