-- Widens the uniqueness that escrow_specs/challenge_docs/feedback_messages upserts rely on
-- (via onConflict) to include chain_id, now that escrow_id alone can collide across networks.
-- verdicts is NOT touched here — its duplicate-guard is an app-level check-then-insert in
-- oracle/src/supabase/repository.ts, not a DB constraint/upsert.
--
-- IMPORTANT: this assumes the existing unique constraints use Postgres's default naming
-- convention (<table>_<col(s)>_key), since they aren't defined in any migration file in this
-- repo — they were added directly in the Supabase dashboard/SQL editor when these tables were
-- first created. Before running this, verify the actual constraint names with:
--
--   select conname, conrelid::regclass, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid in ('escrow_specs'::regclass, 'challenge_docs'::regclass, 'feedback_messages'::regclass)
--     and contype = 'u';
--
-- ...and adjust the `drop constraint if exists` names below to match if they differ.

alter table escrow_specs drop constraint if exists escrow_specs_escrow_id_key;
alter table escrow_specs add constraint escrow_specs_escrow_id_chain_id_key unique (escrow_id, chain_id);

alter table challenge_docs drop constraint if exists challenge_docs_escrow_id_key;
alter table challenge_docs add constraint challenge_docs_escrow_id_chain_id_key unique (escrow_id, chain_id);

alter table feedback_messages drop constraint if exists feedback_messages_escrow_id_sender_address_key;
alter table feedback_messages
  add constraint feedback_messages_escrow_id_chain_id_sender_address_key
  unique (escrow_id, chain_id, sender_address);
