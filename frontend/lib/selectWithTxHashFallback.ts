import { supabase } from './supabase';

/**
 * Selects `textColumn` plus `tx_hash` from `table` filtered by `match`, falling back to a
 * text-only select if Supabase returns 42703 ("column does not exist") — i.e. the tx_hash
 * migration hasn't been applied to this project yet. Degrades to "no link shown" instead of
 * breaking the whole query.
 */
export async function selectWithTxHashFallback(table: string, match: Record<string, string | number>, textColumn: string) {
  const buildQuery = (columns: string) => {
    let query = supabase.from(table).select(columns);
    for (const [key, value] of Object.entries(match)) {
      query = query.eq(key, value);
    }
    return query;
  };

  let { data, error } = await buildQuery(`${textColumn}, tx_hash`).maybeSingle();
  if (error?.code === '42703') {
    ({ data, error } = await buildQuery(textColumn).maybeSingle());
  }
  return { data: data as Record<string, string | null> | null, error };
}
