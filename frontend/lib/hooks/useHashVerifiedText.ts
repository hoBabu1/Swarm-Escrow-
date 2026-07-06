import { useEffect, useState } from "react";
import { keccak256, toBytes } from "viem";
import { supabase } from "../supabase";
import { ZERO_HASH } from "./useEscrow";

interface Params {
  table: string;
  match: Record<string, string | number>;
  textColumn: string;
  onChainHash: `0x${string}` | undefined;
}

interface FetchResult {
  key: string;
  text?: string;
  error?: string;
}

/**
 * Fetches off-chain text linked to an on-chain hash and reports whether the fetched
 * text actually hashes to that on-chain value — callers must surface `matchesHash === false`
 * as a visible warning rather than silently trusting Supabase content.
 */
export function useHashVerifiedText({ table, match, textColumn, onChainHash }: Params) {
  const matchKey = JSON.stringify(match);
  const hasHash = !!onChainHash && onChainHash.toLowerCase() !== ZERO_HASH;
  // Keying the stored result by every input lets us tell "still loading the current
  // query" apart from "finished loading a stale one" without setState at effect start.
  const currentKey = `${table}|${matchKey}|${textColumn}|${onChainHash ?? ""}`;

  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    if (!hasHash) return;
    let cancelled = false;

    (async () => {
      let query = supabase.from(table).select(textColumn);
      for (const [key, value] of Object.entries(JSON.parse(matchKey) as Record<string, string | number>)) {
        query = query.eq(key, value);
      }
      const { data, error: fetchError } = await query.maybeSingle();
      if (cancelled) return;

      if (fetchError) {
        setResult({ key: currentKey, error: "Failed to load text from Supabase" });
        return;
      }
      const row = data as Record<string, string> | null;
      setResult({ key: currentKey, text: row?.[textColumn] });
    })();

    return () => {
      cancelled = true;
    };
  }, [hasHash, currentKey, table, matchKey, textColumn]);

  const isCurrent = result?.key === currentKey;
  const effectiveText = hasHash && isCurrent ? result.text : undefined;
  const loading = hasHash && !isCurrent;
  const error = hasHash && isCurrent ? (result?.error ?? null) : null;

  const matchesHash =
    effectiveText !== undefined && onChainHash
      ? keccak256(toBytes(effectiveText)).toLowerCase() === onChainHash.toLowerCase()
      : undefined;

  return { text: effectiveText, loading, error, matchesHash };
}
