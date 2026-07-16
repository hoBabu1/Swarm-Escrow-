import { supabase } from "./client.js";
import type { Database } from "./types.js";
import { assertBytes32Hex } from "../lib/hash.js";

type TableName = keyof Database["public"]["Tables"];
type Row<T extends TableName> = Database["public"]["Tables"][T]["Row"];
type Insert<T extends TableName> = Database["public"]["Tables"][T]["Insert"];

// Synthetic code for the check-then-insert duplicate guard below (distinct
// from a real Postgrest/Postgres error code, since this is a pre-emptive
// application-level check, not a DB unique-constraint violation). Exported
// so callers can match on `err.code` instead of parsing `err.message`.
export const DUPLICATE_INSERT_CODE = "DUPLICATE_INSERT";

export class SupabaseRepositoryError extends Error {
  // Postgrest error code (e.g. "23505" unique violation, "PGRST..." etc) for
  // errors that originate from Supabase itself, or DUPLICATE_INSERT_CODE for
  // this module's own pre-insert duplicate check. Lets callers distinguish
  // failure categories without re-parsing the message string.
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "SupabaseRepositoryError";
  }
}

// supabase-js's generic `.from()` can't distribute a union table-name generic
// across its overloads, so the cross-table union is boxed to `any` right at
// the client call and immediately re-asserted to the precise Insert<T>/Row<T>
// shape below. Every exported function below has a concrete, non-generic
// signature, so callers never see `any` — only these three helpers do.
async function insertRow<T extends TableName>(table: T, row: Insert<T>): Promise<Row<T>> {
  const { data, error } = await (supabase.from(table as never) as any).insert(row).select().single();
  if (error) {
    throw new SupabaseRepositoryError(`Supabase insert into "${table}" failed: ${error.message}`, error.code);
  }
  return data as Row<T>;
}

async function selectByEscrowId<T extends TableName>(table: T, escrowId: number, chainId: number): Promise<Row<T>[]> {
  // escrow_id is a Solidity uint256 / ethers v6 bigint at the call site;
  // callers must Number(escrowId) before calling in (safe — escrow IDs are a
  // small sequential counter, well under Number.MAX_SAFE_INTEGER).
  // escrow_id alone is not unique across networks (each chain's contract
  // counts escrows from 0 independently), so chain_id is always required
  // alongside it to avoid reading another network's row by mistake.
  const { data, error } = await (supabase.from(table as never) as any)
    .select("*")
    .eq("escrow_id", escrowId)
    .eq("chain_id", chainId);
  if (error) {
    throw new SupabaseRepositoryError(`Supabase select from "${table}" failed: ${error.message}`, error.code);
  }
  return data as Row<T>[];
}

// Check-then-insert, not atomic — a benign TOCTOU race exists if two calls
// for the same key ran concurrently. Acceptable here: the oracle's polling
// loop is single-process/single-flight (chunk 3+), so this is a backstop
// against restarts/replays, not the primary idempotency guarantee.
async function assertNoExistingRow<T extends TableName>(
  table: T,
  match: Record<string, string | number>,
  duplicateDescription: string,
): Promise<void> {
  const { data, error } = await (supabase.from(table as never) as any).select("id").match(match);
  if (error) {
    throw new SupabaseRepositoryError(`Supabase duplicate-check on "${table}" failed: ${error.message}`, error.code);
  }
  if (data && data.length > 0) {
    throw new SupabaseRepositoryError(
      `Duplicate insert rejected: ${duplicateDescription} already recorded.`,
      DUPLICATE_INSERT_CODE,
    );
  }
}

export async function insertVerdict(row: Insert<"verdicts">): Promise<Row<"verdicts">> {
  assertBytes32Hex(row.reasoning_hash, "reasoning_hash");
  await assertNoExistingRow(
    "verdicts",
    { escrow_id: row.escrow_id, chain_id: row.chain_id, agent_role: row.agent_role },
    `verdict for escrow ${row.escrow_id} on chain ${row.chain_id} / role ${row.agent_role}`,
  );
  return insertRow("verdicts", row);
}
export const getVerdicts = (escrowId: number, chainId: number) => selectByEscrowId("verdicts", escrowId, chainId);

export async function insertEscrowSpec(row: Insert<"escrow_specs">): Promise<Row<"escrow_specs">> {
  assertBytes32Hex(row.spec_hash, "spec_hash");
  await assertNoExistingRow(
    "escrow_specs",
    { escrow_id: row.escrow_id, chain_id: row.chain_id },
    `spec for escrow ${row.escrow_id} on chain ${row.chain_id}`,
  );
  return insertRow("escrow_specs", row);
}
export const getEscrowSpecs = (escrowId: number, chainId: number) =>
  selectByEscrowId("escrow_specs", escrowId, chainId);

export async function insertChallengeDoc(row: Insert<"challenge_docs">): Promise<Row<"challenge_docs">> {
  assertBytes32Hex(row.document_hash, "document_hash");
  await assertNoExistingRow(
    "challenge_docs",
    { escrow_id: row.escrow_id, chain_id: row.chain_id },
    `challenge doc for escrow ${row.escrow_id} on chain ${row.chain_id}`,
  );
  return insertRow("challenge_docs", row);
}
export const getChallengeDocs = (escrowId: number, chainId: number) =>
  selectByEscrowId("challenge_docs", escrowId, chainId);

export async function insertFeedbackMessage(row: Insert<"feedback_messages">): Promise<Row<"feedback_messages">> {
  assertBytes32Hex(row.message_hash, "message_hash");
  await assertNoExistingRow(
    "feedback_messages",
    { escrow_id: row.escrow_id, chain_id: row.chain_id, sender_address: row.sender_address },
    `feedback for escrow ${row.escrow_id} on chain ${row.chain_id} from ${row.sender_address}`,
  );
  return insertRow("feedback_messages", row);
}
export const getFeedbackMessages = (escrowId: number, chainId: number) =>
  selectByEscrowId("feedback_messages", escrowId, chainId);
