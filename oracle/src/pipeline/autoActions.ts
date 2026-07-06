import { formatEther } from "ethers";
import { contract, oracleWallet, provider } from "../contract/client.js";
import { getEscrow, getSeniorArbiterVote } from "../contract/reads.js";
import { Status, type EscrowStruct } from "../contract/types.js";
import { logger } from "../lib/logger.js";
import { sendAutoTriggeredTx } from "../lib/autoTriggerTx.js";

// Below this, the oracle wallet risks failing to pay gas for its next
// auto-triggered transaction. Just a warning threshold, not enforced.
const LOW_BALANCE_WARNING_WEI = 10n ** 16n; // 0.01 BOT

async function warnIfLowBalance(): Promise<void> {
  const balance = await provider.getBalance(oracleWallet.address);
  if (balance < LOW_BALANCE_WARNING_WEI) {
    logger.warn("oracle_wallet_balance_low", { address: oracleWallet.address, balanceBot: formatEther(balance) });
  }
}

// Enumerates every escrow (0..escrowCounter-1, same pattern as the frontend
// admin page) and auto-triggers finalizeAfterChallengeWindow /
// resolveAfterSeniorArbiterTimeout wherever their deadline has passed. Runs
// as the primary path — a human can always call these directly too, so a
// race just means whichever call lands second reverts harmlessly (handled by
// sendAutoTriggeredTx, which also serializes every oracle-wallet send behind
// a shared lock so this scan never collides with the event poller's own
// submitVerdict/resolve calls on the same wallet).
export async function runAutoActionsScan(): Promise<void> {
  await warnIfLowBalance();

  const escrowCounter = await contract.escrowCounter();
  const ids = Array.from({ length: Number(escrowCounter) }, (_, i) => BigInt(i));

  // Read phase: pure reads, safe to parallelize (no nonce involved).
  const escrows = await Promise.all(ids.map((id) => getEscrow(id)));

  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const escrow = escrows[i]! as EscrowStruct;

    if (escrow.status === Status.PendingChallenge) {
      if (nowSeconds > escrow.challengeDeadline) {
        await sendAutoTriggeredTx(id, "finalizeAfterChallengeWindow", () => contract.finalizeAfterChallengeWindow(id));
      }
      continue;
    }

    if (escrow.status === Status.Challenged) {
      if (nowSeconds > escrow.seniorArbiterDeadline) {
        const seniorVote = await getSeniorArbiterVote(id);
        if (!seniorVote.hasVoted) {
          await sendAutoTriggeredTx(id, "resolveAfterSeniorArbiterTimeout", () =>
            contract.resolveAfterSeniorArbiterTimeout(id),
          );
        }
      }
      continue;
    }

    // Created, DeliverableSubmitted, Resolved, Refunded — nothing for this
    // scan to do (Resolved/Refunded is the common terminal case; skip silently).
  }
}
