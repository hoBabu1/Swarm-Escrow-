-- Adds tx_hash columns so displayed hash-verified content can link to the exact
-- on-chain transaction that set it. Run this against the Supabase project manually
-- (via the SQL editor or `supabase db push`) — there is no CI/CD pipeline wired to
-- apply migrations automatically for this project.

alter table escrow_specs add column if not exists tx_hash text;
alter table challenge_docs add column if not exists tx_hash text;
alter table feedback_messages add column if not exists tx_hash text;
alter table verdicts add column if not exists tx_hash text;
