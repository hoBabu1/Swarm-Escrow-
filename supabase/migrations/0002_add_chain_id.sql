-- Adds chain_id so rows from different networks (BOT Chain testnet=968,
-- mainnet=677) don't collide on escrow_id — escrow IDs are a per-contract
-- counter, so escrow #3 on testnet and escrow #3 on mainnet are unrelated
-- escrows that would otherwise overwrite each other's row. Existing rows
-- predate mainnet and are backfilled as testnet (968) via the default.
-- Run this against the Supabase project manually (SQL editor or
-- `supabase db push`) — there is no CI/CD pipeline wired to apply
-- migrations automatically for this project.

alter table escrow_specs add column if not exists chain_id bigint not null default 968;
alter table challenge_docs add column if not exists chain_id bigint not null default 968;
alter table feedback_messages add column if not exists chain_id bigint not null default 968;
alter table verdicts add column if not exists chain_id bigint not null default 968;
