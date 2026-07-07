# Swarm Escrow

**AI Agent Escrow on BOT Chain — where agents align on every deliverable.**

Swarm Escrow is a freelance/marketplace escrow contract where **three independent AI agents vote 2-of-3** on whether a submitted deliverable meets its spec, before funds are released or refunded. Every verdict and its reasoning is hashed on-chain, so the outcome is auditable and tamper-evident — not a single opaque "AI said so" judgment.

- 🌐 **Live app:** [https://swarm-escrow.vercel.app/](https://swarm-escrow.vercel.app/)
- 🐙 **Repo:** [https://github.com/hoBabu1/Swarm-Escrow-](https://github.com/hoBabu1/Swarm-Escrow-)
- 🐦 **X:** [https://x.com/SwarmEscrow](https://x.com/SwarmEscrow) · builder: [https://x.com/thedhanyosmi](https://x.com/thedhanyosmi)
- 🎥 **Demo video:** _[paste YouTube link here]_
- 🏆 **Submission:** BOT Chain Builder Challenge #1 — **AI Agent track** (primary) + **Open track**
- ⛓️ **Network:** BOT Chain **testnet only** (Chain ID 968)

---

## Table of contents

1. [The problem](#the-problem)
2. [How it works — the big picture](#how-it-works--the-big-picture)
3. [The AI agents — how decisions are actually made](#the-ai-agents--how-decisions-are-actually-made)
4. [Escrow lifecycle (state machine)](#escrow-lifecycle-state-machine)
5. [Smart contract](#smart-contract)
6. [Oracle service](#oracle-service)
7. [Frontend](#frontend)
8. [Data & security model](#data--security-model)
9. [Tech stack](#tech-stack)
10. [Try it yourself — a full walkthrough](#try-it-yourself--a-full-walkthrough)
11. [Known limitations & honest disclosures](#known-limitations--honest-disclosures)
12. [Deployed addresses](#deployed-addresses)
13. [Repo structure](#repo-structure)

---

## The problem

Freelance/marketplace escrow today comes down to two bad options: a human arbiter (slow, expensive, subjective) or a single AI judge (fast, but a single point of failure and a single point of bias — one model's one-shot opinion decides whether you get paid).

Swarm Escrow takes a third path: **treat deliverable review like a small jury**, not a single judge. Three differently-focused AI agents each independently evaluate the same submission, and the contract only acts when a majority (2-of-3) agrees — the same quorum principle used in multi-sig wallets, applied to subjective/qualitative review instead of just signatures.

---

## How it works — the big picture

```
Client creates escrow (funds locked)
        │
        ▼
Worker submits deliverable (repo URL + commit hash)
        │
        ▼
Oracle fetches the repo at that exact commit
        │
        ▼
   ┌────────────┬────────────┬────────────┐
   │  Reviewer  │ FraudSanity│  Arbiter   │   ← 3 independent AI evaluations
   └────────────┴────────────┴────────────┘
        │
        ▼
2-of-3 verdict reaches consensus (approved / rejected)
        │
        ▼
resolve() called → tentative outcome + challenge window opens
        │
        ├── No challenge raised → finalizeAfterChallengeWindow() → funds move
        │
        └── Losing party challenges → Senior Arbiter (4th, human-configurable) reviews
                    │
                    ▼
            resolveAfterSeniorArbiterTimeout() / senior verdict → funds move
```

Every step above — resolve, finalize, challenge escalation — is a **public, human-callable function**. The oracle calls these automatically as a convenience, but if the oracle is ever down, slow, or asleep, anyone (client, worker, or a third party) can trigger the same functions manually from the frontend. The AI oracle is a helper, not a gatekeeper with exclusive access.

---

## The AI agents — how decisions are actually made

This is the part that matters most for the AI Agent track, so here it is in concrete, non-hand-wavy terms. **This is not "AI looks at the code and decides."** It's three separately-prompted evaluations against fixed inputs, combined through an on-chain quorum rule.

### Shared inputs (same for all three agents)

- The deliverable spec text (the client's original requirements, linked on-chain via `specHash`, full text in Supabase)
- The worker's submitted `repoUrl` + `commitHash`
- The actual repository content fetched by the oracle **at that exact commit** — not "latest main," specifically the pinned commit, so a worker can't change the repo after submission and have it silently re-graded differently

### Shared output format (same for all three agents)

- `approved: boolean`
- `reasoning: string` — a plain-text explanation, hashed and stored on-chain (`bytes32`), full text kept in Supabase for the frontend to display

### What each agent specifically evaluates

**1. Reviewer — spec-compliance scoring**
Checks whether the delivered code actually implements what the spec describes: are the stated requirements present (specific functions, expected behavior, required files like a README or test suite), does it look like a genuine, working attempt at the stated task. This is the "does this match what was asked for" pass.

**2. FraudSanity — fraud/spam filter**
A **separate** pass from quality judgment. Checks whether this is a genuine attempt at all, versus an empty repo, placeholder/lorem-ipsum content, an unrelated public repo pasted in to game the system, or other clearly bad-faith submissions. This exists specifically so a technically "low quality but genuine" submission isn't confused with a submission designed to defraud the escrow.

**3. Arbiter — synthesis/tie-break**
Weighs the Reviewer and FraudSanity findings together and produces the deciding vote when the first two disagree, or gives an independent holistic read when the situation is borderline (e.g., partially complete work, ambiguous spec language).

### The quorum rule (why this isn't "one AI decides")

- The contract stores all three verdicts as `Verdict[3]`, indexed `0 = Reviewer`, `1 = FraudSanity`, `2 = Arbiter`.
- `resolve()` only proceeds once **2 of the 3** verdicts agree on approve/reject.
- No single agent's opinion can move funds. If all three actually disagreed 1-1-1 in a way that blocked consensus, the escrow simply cannot resolve via this path — it would fall to the dispute/Senior Arbiter mechanism instead.
- Verdict reasoning is hashed on-chain (tamper-evident, can't be quietly rewritten after the fact) with the human-readable text stored off-chain for actual review.

### The escalation path (deterministic, not arbitrary re-runs)

If the losing party disagrees with the 2-of-3 outcome, they get exactly **one** on-chain `challenge()` call during a fixed challenge window. This doesn't trigger the same three agents to just try again — it escalates to a **4th, separate Senior Arbiter** role, a distinct on-chain verdict slot (`seniorArbiterVotes`) reserved for disputed cases only. If the Senior Arbiter doesn't respond within its own window, `resolveAfterSeniorArbiterTimeout()` resolves the case by default rule rather than leaving funds stuck indefinitely.

### One-line summary for judges/writeup

> *"Three independently-prompted AI evaluations against the same fixed inputs (spec text + pinned commit), combined via an on-chain 2-of-3 quorum — with a deterministic, separate escalation path for disputes. No single model output ever directly moves funds."*

---

## Escrow lifecycle (state machine)

| Status | What's true here | Who can act |
|---|---|---|
| `Created` | Client funded escrow, worker hasn't submitted yet | Worker submits deliverable; client can `reclaimAfterDeadline()` if worker misses the deadline (client-only, contract-enforced) |
| `Submitted` | Worker submitted repo + commit; oracle is evaluating | Oracle (or anyone) submits verdicts as they come in |
| `PendingChallenge` | 2-of-3 verdict reached, tentative outcome set, challenge window open | Losing party may `challenge()` once; otherwise anyone can `finalizeAfterChallengeWindow()` once the window lapses |
| `Challenged` | A challenge was raised; awaiting Senior Arbiter | Senior Arbiter submits verdict; otherwise anyone can `resolveAfterSeniorArbiterTimeout()` once that window lapses |
| `Resolved` | Worker paid | — terminal |
| `Refunded` | Client refunded | — terminal |

---

## Smart contract

- **Language:** Solidity, built and tested with Foundry
- **Testing:** 83/83 tests passing — 72 unit tests, 9 fuzz tests (256 runs each), 2 invariant tests (128k calls each)
- **Static analysis:** Slither clean — no High or Medium severity findings
- **Security-audited patterns reused** rather than custom/novel implementations (OpenZeppelin), following the project's own "reuse audited code over reinventing it" principle

**Key functions:**

- `createEscrow(address worker, bytes32 specHash, uint256 deadline)` — payable, client locks funds. Note: `repoUrl`/`commitHash` are deliberately **not** part of this call — they don't exist yet at creation time. They're submitted later by the worker.
- `submitDeliverable(escrowId, repoUrl, commitHash)` — worker submits their work
- `submitVerdict(escrowId, agentIndex, approved, reasoningHash)` — oracle submits each of the 3 agent verdicts
- `resolve(escrowId)` — triggered once 2-of-3 consensus is reached; sets tentative outcome, opens challenge window
- `challenge(escrowId, reasonHash)` — losing party only, one-time
- `submitSeniorArbiterVerdict(...)` — separate Senior Arbiter verdict slot for disputed cases
- `finalizeAfterChallengeWindow(escrowId)` — unrestricted, any caller, moves funds once the challenge window lapses with no challenge
- `resolveAfterSeniorArbiterTimeout(escrowId)` — unrestricted, any caller, resolves by default if the Senior Arbiter doesn't respond in time
- `reclaimAfterDeadline(escrowId)` — **client-only**, contract-enforced; lets the client recover funds if the worker never submits
- `getClientEscrows(address)` / `getWorkerEscrows(address)` — read helpers for the dashboard
- One-time post-resolution feedback (star rating + text): hash stored on-chain, full text in Supabase
- `emergencyRescue(escrowId)` — **owner-only, last-resort safety valve**. Can only ever send funds to that specific escrow's own client or worker (never an arbitrary address), and is gated behind a status-dependent deadline check plus an additional emergency delay on top of that — so it can never race ahead of an active challenge window. This exists purely as a circuit-breaker for genuinely stuck funds, not a routine admin lever.

**Important design decision — funds never move automatically:** After any deadline or window lapses, someone has to actually call the relevant `finalize*`/`resolve*` function. This is intentional — no hidden keeper-only privilege, no funds silently sweeping on a block timestamp. The oracle does this automatically as a convenience, but the functions are public specifically so a human can always do it too.

---

## Oracle service

A Node.js/TypeScript service that acts as the automated (but never exclusive) trigger for the on-chain agent workflow.

**What it does:**

1. Polls on-chain events (`DeliverableSubmitted`, `ChallengeRaised`, etc.) and scans all escrows (`escrowId` 0 through `escrowCounter`, since the contract intentionally has no `getAllEscrows` — this loop is the agreed workaround) for anything that needs action
2. On a new deliverable submission: fetches the repo at the exact submitted commit hash from GitHub
3. Runs the three agent evaluations (Reviewer, FraudSanity, Arbiter) — same Anthropic API key, three different system prompts defining each role
4. Submits each verdict on-chain (`submitVerdict`), idempotently — checking **both** the reasoning hash and the approved boolean before resubmitting, so a partial retry can't silently produce a different fund outcome
5. Once 2-of-3 consensus is reached, automatically calls `resolve()`
6. Continuously scans for expired `PendingChallenge` escrows (auto-calls `finalizeAfterChallengeWindow`) and expired `Challenged` escrows with no Senior Arbiter response (auto-calls `resolveAfterSeniorArbiterTimeout`)
7. All oracle-wallet transaction sends route through a shared transaction-lock/mutex, preventing nonce collisions between the event-driven listener and the deadline-driven scan timer running concurrently

**Model:** Claude, via the Anthropic API. *(Development used a faster/cheaper model for iteration speed; production/demo runs on Claude Sonnet 5.)*

**Resilience note:** every action the oracle auto-triggers is also manually triggerable by a human from the frontend — the oracle is a convenience layer, not a single point of failure for fund movement (see [Known limitations](#known-limitations--honest-disclosures) for the one exception).

---

## Frontend

Built with Next.js, wired end-to-end to the live testnet contract — no mock data.

**Pages:**

- **Landing page** — hero, wallet connect + balance, "Look up any wallet" search (public, read-only, no wallet connection required), demo/whale wallet shortcuts, testnet faucet link, "How it works" walkthrough
- **Dashboard** — real on-chain reads via `getClientEscrows`/`getWorkerEscrows`, stat cards (earned, paid out, active, locked BOT), client/worker tabs, create-escrow flow with full validation
- **Escrow detail page** — full status timeline/step tracker, deliverable spec panel, live agent verdict cards (Reviewer/FraudSanity/Arbiter + Senior Arbiter when applicable) with rendered reasoning text, status-driven countdown timers, submit-deliverable flow with **server-side GitHub commit verification** (rejects a submission if the commit hash doesn't actually exist in that repo — a direct anti-fraud check before the AI even runs), challenge flow, feedback flow, and manual fallback buttons for every resolve/finalize function as a safety net against oracle downtime
- **Wallet lookup page** — fully public, no wallet required, reuses the same escrow-card component as the dashboard
- **Admin page** — owner-only (gated by a real on-chain `owner()` read, not just a hidden route), config controls for challenge window / Senior Arbiter window / emergency delay / oracle address, contract-wide "locked funds" stat, full escrow list, and the `emergencyRescue` control gated behind an explicit client/worker-only confirmation (never a free-text address field)

---

## Data & security model

- **On-chain:** funds, verdict hashes, reasoning hashes, escrow status, deadlines — anything that needs to be trustless and tamper-evident
- **Off-chain (Supabase):** the actual human-readable text behind those hashes (spec details, verdict reasoning, challenge explanations, feedback text) — because storing full text on-chain would be prohibitively expensive and isn't needed for trustlessness, only the hash is
- **Write path:** all Supabase writes (spec text, verdict text, challenge text, feedback text) go through server-side Next.js API routes using a service-role key — never a public anon-key insert policy. This keeps frontend writes consistent with the same security model the oracle already uses for its own writes.
- **Read path:** Supabase Row-Level Security is enabled on all four tables (`verdicts`, `escrow_specs`, `challenge_docs`, `feedback_messages`) — public read-only `SELECT`, no anonymous insert/update/delete.

---

## Tech stack

| Layer | Tools |
|---|---|
| Smart contract | Solidity, Foundry (forge test, fuzz, invariant), OpenZeppelin |
| Oracle | Node.js, TypeScript, Anthropic API (Claude), Supabase client, Render (hosting) |
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, wagmi + viem, RainbowKit, TanStack Query |
| Data | Supabase (Postgres + RLS) |
| Chain | BOT Chain testnet (Chain ID 968) |

---

## Try it yourself — a full walkthrough

You don't need to deploy anything — the live app is already wired to the deployed testnet contract. Here's exactly how to run through the full flow, including two pre-built demo repos (one designed to **pass** review, one designed to **fail** it) so you can see both outcomes without waiting on a real freelancer.

### What you'll need

- MetaMask (or another wallet) added to **BOT Chain testnet** — Chain ID `968`, RPC `https://rpc.bohr.life`
- **Two** wallet addresses — one acting as the "client," one as the "worker" (the contract requires these to be different addresses; you can add a second account in MetaMask for this)
- Testnet BOT in both wallets — get some from the faucet linked on the landing page, or directly

### Step 1 — Create an escrow (as the client)

1. Go to [swarm-escrow.vercel.app](https://swarm-escrow.vercel.app/) and connect your **client** wallet
2. Click **Launch app** → **Create escrow**
3. Fill in:
   - **Worker address:** your second (worker) wallet address
   - **Amount:** a small test amount, e.g. `0.01 BOT`
   - **Deadline:** any near-future date/time
   - **Deliverable spec:** paste this exact spec text —
     > *"Build a JavaScript function `isPalindrome(str)` that returns true if the input string is a palindrome (ignoring case and non-alphanumeric characters), false otherwise. Include a README explaining usage, and at least 3 test cases demonstrating it works."*
4. Submit and confirm the transaction — funds are now locked on-chain

### Step 2 — Submit the "passing" deliverable (as the worker)

1. Switch to your **worker** wallet
2. Open the escrow you just created, click **Submit deliverable**
3. Enter:
   - **Repo URL:** `https://github.com/hoBabu1/botChain-Hackathon-success-repo1`
   - **Commit hash:** `3ed056b79ffdfc7e9065acb472c40b6e62539719`
4. Click **Verify commit** — this hits a live GitHub check and confirms the commit actually exists in that repo before letting you submit
5. Click **Submit deliverable** and confirm the transaction

### Step 3 — Watch the agents work

Within roughly 5–10 seconds, the oracle picks up the submission automatically. Refresh the escrow detail page — you'll see the Reviewer, FraudSanity, and Arbiter verdict cards populate one by one with their reasoning, followed by the 2-of-3 consensus outcome (this repo is a genuine, correct implementation, so expect approval and a tentative payout to the worker).

### Step 4 — Try the "failing" case

Repeat Steps 1–2 in a fresh escrow, but this time submit:
- **Repo URL:** `https://github.com/hoBabu1/swarm-escrow-test-fail`
- **Commit hash:** `bfd0d4d7c3328afc89066c054bd8eed73587e7fc`

This repo deliberately falls short of the spec (no case/punctuation handling, missing README, only one shallow test case) — watch the agents catch these specific gaps in their reasoning, rather than just checking "does code exist and run."

### Step 5 — See the rest of the lifecycle

- Let the challenge window run out naturally and confirm the **Finalize payout** button (or automatic oracle trigger) correctly settles funds
- On either escrow, try raising a **challenge** as the losing party and watch the Senior Arbiter panel appear
- Leave feedback (star rating + text) once an escrow is resolved
- Use the **Wallet lookup** page (no wallet connection needed) to view any address's full escrow history, including your own or the demo/whale wallet shortcuts on the landing page

---

## Known limitations & honest disclosures

We'd rather be upfront about these than have them discovered later:

1. **Oracle centralization.** A single oracle wallet currently submits all AI verdicts and triggers auto-resolution. If that wallet were compromised or acted maliciously, it could submit false verdicts (though it still can't move funds solo — 2-of-3 quorum and the challenge/Senior Arbiter path remain as checks). **To move toward decentralizing this**, our planned direction is a DVN-style model — similar to how cross-chain messaging protocols (e.g. LayerZero's Decentralized Verifier Networks) use multiple independent, permissionless verifiers instead of one trusted relayer. The long-term goal is multiple independent oracle operators each running their own agent instances, with on-chain agreement required across operators, not just across the three agent roles within one operator.
2. **`emergencyRescue` is a genuine last resort, not a routine lever.** It's owner-only, can only ever send funds to that escrow's own client or worker, and is gated behind status-dependent deadlines plus an additional delay — but it is still an owner-privileged function, and we want that fact stated plainly rather than glossed over.
3. **Oracle deploy script has the oracle address hardcoded** rather than read from an environment variable. Not a functional bug, but redeploying with a different oracle wallet currently requires editing the script directly rather than just changing a config value.
4. **Public-repo-only scope.** The deliverable verification flow currently only supports public GitHub repositories pinned to a commit hash. Private repos (e.g. via a GitHub App with proper access) are explicitly out of scope for this submission.
5. **Testnet only.** Everything described here — contract, oracle, frontend — is deployed and tested exclusively on BOT Chain testnet. No mainnet deployment exists at this time.

---

## Deployed addresses

**BOT Chain testnet (Chain ID 968)**

| | |
|---|---|
| Escrow contract | `0xc45d948467Dd39278a456D4341C00C14F31300b2` |
| Deploy transaction | `0xd89b554d819f68e0c4cec052185e600dbe090d55e110b482212abaae6ebb467f` |
| Explorer | [scan.bohr.life](https://scan.bohr.life/) |

---

## Repo structure

```
Swarm-Escrow-/
├── contracts/     — Solidity contract + Foundry tests
├── oracle/        — AI agent oracle service (Node.js/TypeScript)
├── frontend/      — Next.js app (this is what powers the live site)
└── supabase/      — schema/migrations for off-chain data
```

---

## Submission info

- **Track:** AI Agent (primary) · Open track
- **Live app:** https://swarm-escrow.vercel.app/
- **Repo:** https://github.com/hoBabu1/Swarm-Escrow-
- **X:** https://x.com/SwarmEscrow
- **Builder:** [@thedhanyosmi](https://x.com/thedhanyosmi) — solo build
- **Demo video:** _[paste YouTube link here]_