// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SwarmEscrow
 * @notice Freelance/marketplace escrow for the BOT Chain Builder Challenge #1 hackathon.
 *
 * Instead of a human, DAO, or single AI judging submitted work, three distinct AI
 * agent roles vote 2-of-3 before escrowed funds are released or refunded:
 *   - Reviewer Agent      — checks the deliverable against the agreed spec
 *   - Fraud/Sanity Agent  — checks for gaming, fake submissions, or spec mismatch
 *   - Arbiter Agent       — only called if Reviewer and Fraud/Sanity disagree;
 *                           casts the deciding vote
 *
 * Each agent's verdict plus a hash of its reasoning is recorded on-chain. The full
 * reasoning text is stored off-chain (Supabase) and linked by that hash, so anyone
 * can verify the on-chain record matches what's displayed in the UI.
 *
 * Deliverables are scoped to a public GitHub repo pinned to a specific commit SHA;
 * private-repo / GitHub App support is out of scope for this hackathon.
 *
 * Escrowed funds are native BOT token only — no ERC-20 approve/transferFrom flow.
 */
contract SwarmEscrow {}
