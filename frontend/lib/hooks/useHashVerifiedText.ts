import { useEffect, useState } from "react";
import { keccak256, toBytes } from "viem";
import { selectWithTxHashFallback } from "../selectWithTxHashFallback";
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
  txHash?: string | null;
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
      const { data, error: fetchError } = await selectWithTxHashFallback(table, JSON.parse(matchKey), textColumn);
      if (cancelled) return;

      if (fetchError) {
        setResult({ key: currentKey, error: "Failed to load text from Supabase" });
        return;
      }
      setResult({ key: currentKey, text: data?.[textColumn] ?? undefined, txHash: data?.tx_hash });
    })();

    return () => {
      cancelled = true;
    };
  }, [hasHash, currentKey, table, matchKey, textColumn]);

  const isCurrent = result?.key === currentKey;
  const effectiveText = hasHash && isCurrent ? result.text : undefined;
  const effectiveTxHash = hasHash && isCurrent ? (result.txHash ?? undefined) : undefined;
  const loading = hasHash && !isCurrent;
  const error = hasHash && isCurrent ? (result?.error ?? null) : null;

  const matchesHash =
    effectiveText !== undefined && onChainHash
      ? keccak256(toBytes(effectiveText)).toLowerCase() === onChainHash.toLowerCase()
      : undefined;

  return { text: effectiveText, txHash: effectiveTxHash, loading, error, matchesHash };
}
