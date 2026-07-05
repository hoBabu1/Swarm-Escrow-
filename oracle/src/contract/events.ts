import type { EventLog } from "ethers";
import { rawContract, provider } from "./client.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

type FilterName = "DeliverableSubmitted" | "ChallengeRaised";

// Block the contract was deployed at (contracts/broadcast/Deploy.s.sol/968/run-latest.json).
// Used as the default backstop starting point so a fresh process replays the
// full event history rather than silently missing anything that happened
// before it first started. Override with ORACLE_START_BLOCK (optional, not
// part of the required env — only set it if this contract gets redeployed).
const DEFAULT_START_BLOCK = 15140461;
const startBlockOverride = process.env.ORACLE_START_BLOCK ? Number(process.env.ORACLE_START_BLOCK) : undefined;

// Keep each queryFilter call well under typical RPC provider eth_getLogs
// block-range caps (many public providers cap this at 2000-10000). This
// matters most on a cold restart, which always replays from
// DEFAULT_START_BLOCK — an unchunked query over that whole span would fail
// outright once the chain has grown far enough past deployment.
const MAX_BLOCK_RANGE = 2000;

// How many blocks of processed-log keys to retain for cross-tick dedup
// before pruning, bounding memory on a long-lived Render process. Far larger
// than any realistic reorg depth on this testnet.
const DEDUP_RETENTION_BLOCKS = 10_000;

export interface DeliverableSubmittedEvent {
  escrowId: bigint;
  repoUrl: string;
  commitHash: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

export interface ChallengeRaisedEvent {
  escrowId: bigint;
  challenger: string;
  reasoningHash: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

type Handler<E> = (event: E) => Promise<void> | void;

interface EventSource<E> {
  filterName: FilterName;
  parse: (log: EventLog) => E;
  handler: Handler<E>;
}

function makeSource<E>(filterName: FilterName, parse: (log: EventLog) => E, handler: Handler<E>): EventSource<E> {
  return { filterName, parse, handler };
}

// Polls all registered event sources on one shared interval, using a single
// getBlockNumber + one queryFilter per source per block-range chunk (no
// redundant RPC calls). Idempotency here is a process-lifetime backstop
// only — dedupes a given log within this run (relevant across overlapping
// chunk boundaries or an RPC returning a log twice). It is NOT the
// authoritative guard against double-submitting a verdict; that lives in
// chunk 6, which checks live on-chain vote state before writing. This class
// has no persisted cursor (per CLAUDE.md: never mirror on-chain state as a
// source of truth), so a restart always resumes from DEFAULT_START_BLOCK and
// re-derives everything live from the chain, in bounded chunks.
export class ContractEventPoller {
  private lastProcessedBlock: number;
  private readonly processedKeys = new Map<string, number>(); // key -> blockNumber
  private readonly sources: EventSource<unknown>[] = [];
  private timer?: NodeJS.Timeout;
  private polling = false;
  private currentTick: Promise<void> = Promise.resolve();

  constructor(startBlock: number = startBlockOverride ?? DEFAULT_START_BLOCK) {
    this.lastProcessedBlock = startBlock - 1;
  }

  onDeliverableSubmitted(handler: Handler<DeliverableSubmittedEvent>): this {
    this.sources.push(
      makeSource(
        "DeliverableSubmitted",
        (log) => ({
          escrowId: log.args.escrowId as bigint,
          repoUrl: log.args.repoUrl as string,
          commitHash: log.args.commitHash as string,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          logIndex: log.index,
        }),
        handler,
      ) as EventSource<unknown>,
    );
    return this;
  }

  onChallengeRaised(handler: Handler<ChallengeRaisedEvent>): this {
    this.sources.push(
      makeSource(
        "ChallengeRaised",
        (log) => ({
          escrowId: log.args.escrowId as bigint,
          challenger: log.args.challenger as string,
          reasoningHash: log.args.reasoningHash as string,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          logIndex: log.index,
        }),
        handler,
      ) as EventSource<unknown>,
    );
    return this;
  }

  start(): void {
    this.timer = setInterval(() => {
      this.currentTick = this.tick().catch((err: unknown) => {
        logger.error("event_poller_tick_failed", { error: err instanceof Error ? err.message : String(err) });
      });
    }, env.POLL_INTERVAL_SECONDS * 1000);
    this.currentTick = this.tick().catch((err: unknown) => {
      logger.error("event_poller_initial_tick_failed", { error: err instanceof Error ? err.message : String(err) });
    });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Lets shutdown handlers wait for an in-flight tick (and therefore any
  // in-flight handleDeliverableSubmitted/handleChallengeRaised call it
  // started) to finish, rather than killing the process mid-AI-call or
  // mid-transaction on a deploy-triggered SIGTERM. Bounded by `timeoutMs` so
  // a stuck call can't block shutdown forever.
  async waitForIdle(timeoutMs: number): Promise<void> {
    await Promise.race([this.currentTick, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  }

  private async tick(): Promise<void> {
    if (this.polling) return; // don't let ticks overlap if a poll runs long
    if (this.sources.length === 0) return;
    this.polling = true;
    try {
      const latestBlock = await provider.getBlockNumber();
      let windowStart = this.lastProcessedBlock + 1;
      if (windowStart > latestBlock) return;

      while (windowStart <= latestBlock) {
        const windowEnd = Math.min(windowStart + MAX_BLOCK_RANGE - 1, latestBlock);

        const results = await Promise.all(
          this.sources.map((source) => rawContract.queryFilter(source.filterName, windowStart, windowEnd)),
        );

        for (let i = 0; i < this.sources.length; i++) {
          const source = this.sources[i]!;
          for (const log of results[i]!) {
            const eventLog = log as EventLog;
            const key = `${eventLog.transactionHash}:${eventLog.index}`;
            if (this.processedKeys.has(key)) continue;
            this.processedKeys.set(key, eventLog.blockNumber);
            await source.handler(source.parse(eventLog));
          }
        }

        // Persist progress after each chunk succeeds (in-memory only), so a
        // failure partway through a large catch-up doesn't lose the work
        // already done within this process's lifetime.
        this.lastProcessedBlock = windowEnd;
        windowStart = windowEnd + 1;
      }

      const pruneBefore = this.lastProcessedBlock - DEDUP_RETENTION_BLOCKS;
      for (const [key, blockNumber] of this.processedKeys) {
        if (blockNumber < pruneBefore) this.processedKeys.delete(key);
      }
    } finally {
      this.polling = false;
    }
  }
}
