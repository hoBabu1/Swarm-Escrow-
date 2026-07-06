# Swarm Escrow — Demo Test Setup Guide

This guide sets up two GitHub repos to test the full escrow flow end-to-end:
one that should **pass** the oracle's review, one that should **fail** it.

Spec used for both (simple, easy for the AI reviewer to judge clearly):

> **Deliverable spec:** "Build a JavaScript function `isPalindrome(str)` that
> returns true if the input string is a palindrome (ignoring case and
> non-alphanumeric characters), false otherwise. Include a README explaining
> usage, and at least 3 test cases demonstrating it works."

---

## Repo 1 — "swarm-escrow-test-pass" (should PASS review)

This repo will contain a correct, complete implementation matching the spec exactly.

### Step 1 — Clone your empty repo locally

```bash
git clone https://github.com/<your-username>/swarm-escrow-test-pass.git
cd swarm-escrow-test-pass
```

### Step 2 — Claude Code prompt to generate the content

Run this inside that repo's folder in Claude Code:

```
Create a complete, correct implementation for this spec:

"Build a JavaScript function isPalindrome(str) that returns true if the
input string is a palindrome (ignoring case and non-alphanumeric
characters), false otherwise. Include a README explaining usage, and at
least 3 test cases demonstrating it works."

Requirements:
1. Create index.js exporting a working isPalindrome(str) function that
   correctly ignores case and strips non-alphanumeric characters before
   checking.
2. Create a test file (test.js or tests/index.test.js) with at least 3 test
   cases covering: a simple palindrome ("racecar"), a phrase-style
   palindrome with punctuation/spaces/mixed case ("A man, a plan, a canal:
   Panama"), and a clear non-palindrome ("hello").
3. Create a README.md explaining what the function does, how to run it, and
   how to run the tests.
4. Create a package.json with a "test" script that actually runs the tests.
5. Make sure the implementation is genuinely correct — trace through each
   test case by hand and confirm the function would actually return the
   right result for each.

This must be a real, working, correct implementation — not a stub or partial
attempt. This repo is being used to test that an AI review oracle correctly
APPROVES a deliverable that matches its spec.
```

### Step 3 — Push it

```bash
git add .
git commit -m "Implement isPalindrome per spec"
git push origin main
```

### Step 4 — Get the commit hash you'll submit

```bash
git rev-parse HEAD
```

Copy this full commit hash — you'll paste it into the "Submit deliverable" modal along with the repo URL.

---

## Repo 2 — "swarm-escrow-test-fail" (should FAIL review)

This repo will contain an **incomplete/missing-functionality** implementation — it exists and has code, but doesn't actually fulfill what the spec asked for.

### Step 1 — Clone your empty repo locally

```bash
git clone https://github.com/<your-username>/swarm-escrow-test-fail.git
cd swarm-escrow-test-fail
```

### Step 2 — Claude Code prompt to generate the content

Run this inside that repo's folder in Claude Code:

```
Create a DELIBERATELY INCOMPLETE implementation for this spec, for testing
purposes — I need this to plausibly fail an AI code review, not pass it.

Spec given to the (fake) worker was:
"Build a JavaScript function isPalindrome(str) that returns true if the
input string is a palindrome (ignoring case and non-alphanumeric
characters), false otherwise. Include a README explaining usage, and at
least 3 test cases demonstrating it works."

What to actually build (intentionally falling short of the spec):
1. Create index.js with an isPalindrome(str) function, but make it naive —
   it should ONLY do a direct reverse-string comparison with NO
   case-insensitivity and NO stripping of punctuation/spaces. This means it
   will incorrectly return false for "A man, a plan, a canal: Panama" even
   though that IS a valid palindrome once case/punctuation are ignored —
   this is the concrete functional gap a reviewer should catch.
2. Do NOT create a README.md at all.
3. Only include ONE test case (not the 3+ the spec asked for), and make it
   a trivial one like "racecar" that even the naive implementation passes,
   so the gap isn't obvious from the test alone — the reviewer needs to
   actually check the spec's stated requirements (case-insensitivity,
   punctuation-handling, 3+ tests, README) rather than just whether tests
   pass.
4. Include a package.json with a working "test" script (so it's not
   completely broken — it should look like real, submitted work, just
   incomplete against what was actually asked for).

This is intentionally a "plausible but incomplete" submission — the goal is
to test whether an AI review oracle correctly catches spec-mismatch (missing
README, insufficient test coverage, incorrect handling of
punctuation/case) rather than just checking "does code exist and run."
```

### Step 3 — Push it

```bash
git add .
git commit -m "Initial isPalindrome implementation"
git push origin main
```

### Step 4 — Get the commit hash

```bash
git rev-parse HEAD
```

---

## How to actually run the test through your frontend

1. **Create escrow #1 (for the passing repo):**
   - Connect your client wallet
   - Click "Create escrow"
   - Worker address: use your **worker test wallet** (a second wallet you control — see note below if you don't have one yet)
   - Amount: small test amount, e.g. `0.01 BOT`
   - Deadline: near-future, e.g. tomorrow (doesn't need to be far out for this test)
   - Deliverable spec: paste the exact spec text from the top of this doc
   - Submit, confirm the transaction

2. **Submit deliverable (as the worker, for escrow #1):**
   - Switch/connect the worker wallet
   - Go to that escrow's detail page
   - Click "Submit deliverable"
   - Repo URL: `https://github.com/<your-username>/swarm-escrow-test-pass`
   - Commit SHA: the hash from Repo 1 Step 4
   - Click "Verify commit" → should succeed and show the file list
   - Click "Submit deliverable" → confirm the transaction

3. **Wait for the oracle** to pick this up (per your polling interval, ~5-10s) and post its verdicts. Refresh the escrow detail page and confirm the Reviewer/FraudSanity/Arbiter cards show approval reasoning, and the tentative outcome favors the worker.

4. **Repeat steps 1-3 for escrow #2**, using the `swarm-escrow-test-fail` repo URL and its commit hash instead. This time, confirm the oracle's verdicts correctly flag the missing README, insufficient test coverage, and/or the punctuation-handling bug — and that the tentative outcome favors the client (rejection).

5. **Test the remaining flow on at least one of the two escrows:**
   - Let the challenge window run out naturally (or use your admin-configured short demo window) and confirm the new "Finalize payout" button actually pays out correctly
   - On the other escrow, try raising a challenge as the losing party, and confirm the Senior Arbiter flow triggers correctly

---

## One thing you'll need that isn't set up yet: a second wallet

You'll need **two separate wallets** to properly test the client/worker relationship (you can't be both client and worker on the same escrow in any meaningful way, since address checks like `isClient`/`isWorker`/`canChallenge` depend on them being different addresses).

- If you don't already have a second MetaMask account, create one now (Account → Add account, or import a fresh private key)
- Fund it with testnet BOT from the faucet: `https://faucet.botchain.ai/basic`
- Use this as your "worker" wallet throughout testing, and your main wallet as "client"

---

## Suggestion — one more thing worth testing if time allows

Consider a **third repo** where the commit hash you submit doesn't actually exist on the repo (typo'd hash, or a hash from a different repo entirely) — this tests that your `/api/verify-commit` route correctly rejects it with "Commit not found in this repository" and blocks submission, rather than silently allowing a bad submission through. This is a quick, low-effort test of a security-relevant path (the fraud-resistance you specifically built the verification step for) and worth 5 minutes if you have it.