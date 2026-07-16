import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { sameAddress } from "../escrowFormat";

export interface ReceivedFeedbackRow {
  escrowId: number;
  senderAddress: string;
  text: string;
}

interface FetchResult {
  key: string;
  rows: ReceivedFeedbackRow[];
  error?: string;
}

const RATING_PREFIX = /^(\d)\/5/;

export interface AddressFeedbackSummary {
  rows: ReceivedFeedbackRow[];
  average: number | null;
  count: number;
  loading: boolean;
  error: string | null;
}

/**
 * Single source of truth for "feedback this address has received": one Supabase fetch of
 * feedback_messages for the given escrow IDs, filtered to exclude rows the address sent
 * itself (so what's left is guaranteed sent by the counterparty on each of those escrows).
 * Both the numeric rating average (dashboard/wallet stat cards) and the raw feedback list
 * (wallet page's "Feedback received" panel) are derived from this one round trip instead of
 * two hooks independently querying the same table with the same filter.
 *
 * Keyed the same way as useHashVerifiedText: the result is tagged with the query key it
 * answers, so "still loading the current query" is distinguishable from "finished loading a
 * stale one" without setState at the top of the effect.
 */
export function useAddressFeedback(
  address: string | undefined,
  escrowIds: readonly bigint[],
  chainId: number,
  direction: "received" | "sent" = "received"
): AddressFeedbackSummary {
  const idsKey = escrowIds.join(",");
  const hasQuery = !!address && escrowIds.length > 0;
  const currentKey = `${address ?? ""}|${idsKey}|${chainId}|${direction}`;

  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    if (!hasQuery) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("feedback_messages")
        .select("escrow_id, message_text, sender_address")
        .eq("chain_id", chainId)
        .in("escrow_id", idsKey.split(",").map(Number));

      if (cancelled) return;

      if (error) {
        setResult({ key: currentKey, rows: [], error: "Couldn't load feedback" });
        return;
      }

      const rows: ReceivedFeedbackRow[] = (data ?? [])
        .filter((row) =>
          direction === "received"
            ? !sameAddress(row.sender_address as string, address)
            : sameAddress(row.sender_address as string, address)
        )
        .map((row) => ({
          escrowId: row.escrow_id as number,
          senderAddress: row.sender_address as string,
          text: row.message_text as string,
        }));

      setResult({ key: currentKey, rows });
    })();

    return () => {
      cancelled = true;
    };
  }, [hasQuery, currentKey, idsKey, address, chainId, direction]);

  if (!hasQuery) {
    return { rows: [], average: null, count: 0, loading: false, error: null };
  }

  const isCurrent = result?.key === currentKey;
  if (!isCurrent) {
    return { rows: [], average: null, count: 0, loading: true, error: null };
  }

  const ratings = result.rows
    .map((row) => RATING_PREFIX.exec(row.text)?.[1])
    .filter((v): v is string => v !== undefined)
    .map(Number);
  const count = ratings.length;
  const average = count > 0 ? ratings.reduce((a, b) => a + b, 0) / count : null;

  return { rows: result.rows, average, count, loading: false, error: result.error ?? null };
}
