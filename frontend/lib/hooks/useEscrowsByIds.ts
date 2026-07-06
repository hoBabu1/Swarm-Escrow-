import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { swarmEscrowConfig } from "../contract";
import { EscrowStructTuple, ParsedEscrow, parseEscrowTuple } from "./useEscrow";

export type EscrowWithId = ParsedEscrow & { id: bigint };

/** Batches individual `escrows(id)` reads into a single multicall instead of one RPC round-trip per row. */
export function useEscrowsByIds(ids: readonly bigint[] | undefined) {
  // Keyed on the ids' own values (not array identity) so a fresh `[]`/undefined on every
  // render from the caller doesn't force useReadContracts to rebuild its contracts list.
  const idsKey = ids?.join(",") ?? "";
  const contracts = useMemo(
    () =>
      (ids ?? []).map((id) => ({
        ...swarmEscrowConfig,
        functionName: "escrows",
        args: [id],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey is the real dependency, ids is derived from it
    [idsKey]
  );

  const { data, isLoading, isError, error, refetch } = useReadContracts({
    contracts,
    query: { enabled: !!ids && ids.length > 0 },
  });

  const escrows: EscrowWithId[] = !ids
    ? []
    : (data ?? [])
        .map((result, i) =>
          result.status === "success" && result.result
            ? { ...parseEscrowTuple(result.result as unknown as EscrowStructTuple), id: ids[i] }
            : undefined
        )
        .filter((e): e is EscrowWithId => e !== undefined);

  return { escrows, isLoading, isError, error, refetch };
}
