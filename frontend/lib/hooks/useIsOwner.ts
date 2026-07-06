import { useAccount, useReadContract } from "wagmi";
import { swarmEscrowConfig } from "../contract";
import { sameAddress } from "../escrowFormat";

/** Single shared "is this wallet the contract owner" check (one `owner()` read + a
 * sameAddress compare) — reused by every page's admin nav link and by the admin page's
 * own access gate, so ownership logic never gets duplicated or hardcoded per page. */
export function useIsOwner() {
  const { address, isConnected } = useAccount();
  // Gated on isConnected: AdminNavLink renders this hook unconditionally on every page
  // (landing included), so without this guard every disconnected visitor would fire an
  // owner() read that can never resolve to true anyway.
  const { data, isLoading, isError } = useReadContract({
    ...swarmEscrowConfig,
    functionName: "owner",
    query: { enabled: isConnected },
  });
  const owner = data as `0x${string}` | undefined;
  // `isOwner` only resolves to a meaningful true/false once the read actually succeeded —
  // callers must check `isError` themselves before treating `isOwner === false` as "confirmed
  // not owner" (e.g. to avoid redirecting a genuine owner away on a transient RPC failure).
  return { isOwner: !isLoading && !isError && sameAddress(address, owner), owner, isLoading, isError };
}
