# Swarm Escrow

AI swarm consensus escrow for freelance/marketplace work on BOT Chain — instead of a single human or AI judging a deliverable, three independent AI agent roles vote 2-of-3 before funds are tentatively released, with a challenge window and a binding Senior Arbiter for disputes.

Built for the **BOT Chain Builder Challenge #1** hackathon (AI Agent track).

## Core concept

A client funds an escrow in native BOT. A worker submits a deliverable as a **public GitHub repo pinned to a commit SHA**. Instead of manual review, four AI agent roles (all Claude, called by one oracle service) judge it:

- **Reviewer** — checks the deliverable against the agreed spec
- **Fraud/Sanity** — checks for gaming, fake submissions, or spec mismatch
- **Arbiter** — only called if Reviewer and Fraud/Sanity disagree; casts the deciding vote
- **Senior Arbiter** — only called if the losing party disputes the tentative outcome within the challenge window; casts a final, binding verdict

Each agent's verdict, plus a hash of its full reasoning, is recorded on-chain. The full reasoning text (and the spec, challenge documents, and feedback messages) lives off-chain in Supabase, linked by that hash — so anyone can verify the on-chain record matches what's shown in the UI.

**Honest disclosure:** this is *not* "fully trustless AI verification." Verdicts are computed off-chain by one oracle wallet that is the only address allowed to call `submitVerdict`/`submitSeniorArbiterVerdict` — a real centralization dependency. The contract also has a last-resort `emergencyRescue` function, callable only by the contract owner, only after every other deadline (plus an extra safety buffer) has passed, and only payable to that escrow's own recorded client or worker address — never an arbitrary address. Both of these are deliberate, disclosed tradeoffs, not incidental gaps.

## Architecture

```
swarm-escrow/
├── contracts/   Foundry — SwarmEscrow.sol, unit/fuzz/invariant tests, deploy script
├── oracle/      Node.js + TypeScript — polls the chain, fetches the repo, runs the
│                4 AI agent roles, posts verdicts on-chain. Deployed as a persistent
│                worker on Render.
├── frontend/    Next.js — create escrow, submit deliverable, challenge, live status,
│                wallet-connect earnings/history dashboard
├── supabase/    SQL schema for off-chain text (specs, reasoning, challenge docs, feedback)
└── CLAUDE.md    Full project/engineering spec this repo was built against
```

**Contract state machine:**

```
Created → DeliverableSubmitted → PendingChallenge → Resolved | Refunded
                                       ↓ (losing party challenges, once, within the window)
                                  Challenged → Resolved | Refunded
                                       ↓ (oracle never responds in time)
                                  falls back to the original tentative outcome
```

Any non-terminal escrow can, as a genuine last resort, be moved to a terminal state via the owner's `emergencyRescue`.

## Live deployment

| | |
|---|---|
| Network | BOT Chain **testnet**, chain ID `968`, RPC `https://rpc.bohr.life` |
| Contract | `0xc45d948467Dd39278a456D4341C00C14F31300b2` |
| Oracle | Node.js worker deployed on Render (persistent background service; polls every few seconds) |
| Frontend | *TODO — not yet deployed publicly; run locally per below for now* |

> Note: I couldn't confirm a live block explorer URL for BOT Chain testnet or a deployed frontend URL — fill these in once known rather than have me guess one.

## Running locally

### Prerequisites

- Node.js >= 20, npm
- [Foundry](https://book.getfoundry.sh/) (`forge`, `cast`)
- A BOT Chain testnet wallet funded from the [faucet](https://faucet.botchain.ai/basic)
- An Anthropic API key
- A Supabase project (for off-chain spec/reasoning/challenge/feedback text)

### Contracts

```bash
cd contracts
forge build
forge test          # unit + fuzz + invariant suite
```

See `contracts/DEPLOY.md` for the full deploy walkthrough (encrypted keystore setup, demo timing overrides, oracle address configuration).

### Oracle

```bash
cd oracle
npm install
cp ../.env.example .env   # fill in ORACLE_PRIVATE_KEY, ANTHROPIC_API_KEY, RPC_URL_TESTNET,
                          # CONTRACT_ADDRESS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
                          # POLL_INTERVAL_SECONDS
npm run dev          # tsx watch — local dev
npm run build && npm start   # production build, matches what Render runs
```

The oracle polls the contract for `DeliverableSubmitted` and challenge events, fetches the pinned commit from GitHub via Octokit, runs the relevant Claude agent role(s), and posts the verdict transaction. It also runs a persistent HTTP health-check endpoint (required by Render's free Web Service tier) alongside the polling loop, not instead of it.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Needs its own `.env.local` with the contract address, RPC URL, Supabase URL/anon key, and a WalletConnect project ID for RainbowKit.

## Tech stack

| Layer | Choice |
|---|---|
| Smart contract | Solidity + Foundry |
| Static analysis | Slither |
| Contract libraries | OpenZeppelin (`ReentrancyGuard`, `Ownable`) |
| Oracle/backend | Node.js + TypeScript, `ethers.js` v6, `@anthropic-ai/sdk`, Octokit |
| Frontend | Next.js, wagmi + viem + RainbowKit |
| Off-chain text storage | Supabase |

## Testing

- `contracts/test/SwarmEscrow.t.sol` — unit tests covering every state transition and access-control restriction across the full state machine (wrong caller, wrong state, double-challenge, double-feedback, finalize-before-window, senior-arbiter-called-without-challenge, emergency-rescue-to-wrong-address, emergency-rescue-before-buffer, and similar negative cases).
- `contracts/test/SwarmEscrowFuzz.t.sol` — fuzz tests over deposit amounts, vote combinations, and timing/deadline edge cases.
- `contracts/test/SwarmEscrowInvariant.t.sol` (+ `handlers/`) — the two core invariants: the contract's BOT balance always equals the sum of all non-terminal escrow amounts, and no escrow reaches a terminal state without a valid path there (2-of-3 consensus unchallenged, a valid Senior Arbiter verdict, a senior-arbiter timeout fallback, or the explicitly-flagged emergency rescue bypass).
- `contracts/MANUAL_TEST_RUN.md` documents a full manual end-to-end pass against the deployed testnet contract (create → submit → vote → resolve) using disposable client/worker/oracle wallets, before the oracle service existed.
- Development used a multi-persona Claude Code review pipeline (contract-reviewer and other reviewer subagents under `frontend/.claude/agents/`) to check each chunk of contract and application code as it was written.

## Known limitations (disclosed by design)

- **Oracle centralization.** All four agent verdicts are posted by a single oracle wallet. If that wallet is unavailable, escrows can still resolve via the timeout/fallback paths, but no *new* verdicts can be recorded until it's back.
- **Emergency rescue is a real owner override.** It can only ever pay out to that escrow's own client or worker, and only after every other deadline plus an extra buffer has elapsed — but it is still a centralized bypass, not a trustless mechanism, and is documented as such rather than hidden.
- **Public repos only.** Deliverables must be a public GitHub repo pinned to a commit SHA. Private-repo/GitHub App support is out of scope for this hackathon and is a future roadmap item, not something currently supported.
- **No on-chain state caching.** Supabase only stores off-chain text (spec, reasoning, challenge docs, feedback) linked by on-chain hash — it is never the source of truth for escrow state, which is always read live from the chain.

## License

Not yet decided.
