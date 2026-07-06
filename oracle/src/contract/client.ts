import { Contract, JsonRpcProvider, Wallet, type ContractTransactionResponse } from "ethers";
import { env } from "../config/env.js";
import abi from "./SwarmEscrow.abi.json" with { type: "json" };

export const provider = new JsonRpcProvider(env.RPC_URL_TESTNET);

// Signs and pays gas for submitVerdict/submitSeniorArbiterVerdict (chunk 6).
// Access control for those calls is enforced on-chain (onlyOracle modifier);
// this wallet is also used read-only for polling/reads elsewhere.
export const oracleWallet = new Wallet(env.ORACLE_PRIVATE_KEY, provider);

// Plain ethers handle: only use this for generic operations ethers itself
// types well (queryFilter, filters, runner, etc). ethers-v6's Contract type
// declares ABI methods via a dynamic index signature, which — combined with
// this project's `noUncheckedIndexedAccess` — makes every dynamic method
// resolve as possibly-undefined. `contract` below (the typed view) is the
// path of least resistance for calling escrows/verdicts/submitVerdict/etc.;
// reach for `rawContract` only when you specifically need ethers' own
// generic contract API.
export const rawContract = new Contract(env.CONTRACT_ADDRESS, abi, oracleWallet);

interface RawEscrow {
  client: string;
  worker: string;
  amount: bigint;
  specHash: string;
  deadline: bigint;
  status: bigint;
  repoUrl: string;
  commitHash: string;
  tentativeApproved: boolean;
  challengeDeadline: bigint;
  hasChallenged: boolean;
  seniorArbiterDeadline: bigint;
  challengeReasoningHash: string;
  hasClientFeedback: boolean;
  hasWorkerFeedback: boolean;
}

interface RawVote {
  hasVoted: boolean;
  approved: boolean;
  reasoningHash: string;
}

// Hand-written typed surface for the exact subset of SwarmEscrow.sol this
// oracle calls (no typechain codegen in the stack — CLAUDE.md doesn't list
// it, so this keeps the dependency list as specified while still avoiding
// `any` at call sites). Deliberately standalone (not derived from ethers'
// `Contract` type) to avoid the index-signature/noUncheckedIndexedAccess
// friction above. Keep in sync with contracts/src/SwarmEscrow.sol.
export interface SwarmEscrowMethods {
  escrows(escrowId: bigint): Promise<RawEscrow>;
  verdicts(escrowId: bigint, role: number): Promise<RawVote>;
  seniorArbiterVotes(escrowId: bigint): Promise<RawVote>;
  submitVerdict(
    escrowId: bigint,
    agentRole: number,
    approved: boolean,
    reasoningHash: string,
  ): Promise<ContractTransactionResponse>;
  submitSeniorArbiterVerdict(
    escrowId: bigint,
    approved: boolean,
    reasoningHash: string,
  ): Promise<ContractTransactionResponse>;
  resolve(escrowId: bigint): Promise<ContractTransactionResponse>;
  finalizeAfterChallengeWindow(escrowId: bigint): Promise<ContractTransactionResponse>;
  resolveAfterSeniorArbiterTimeout(escrowId: bigint): Promise<ContractTransactionResponse>;
  escrowCounter(): Promise<bigint>;
}

export const contract = rawContract as unknown as SwarmEscrowMethods;
