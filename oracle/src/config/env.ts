import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { isAddress } from "ethers";
import { logger } from "../lib/logger.js";

// .env lives at the monorepo root (shared across contracts/oracle/frontend),
// not inside oracle/. Resolve relative to this file so it works regardless
// of process cwd, both under tsx (src/config) and compiled output (dist/config).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../../.env");
const dotenvResult = dotenv.config({ path: envPath });
if (dotenvResult.error) {
  // Not fatal on its own (Render sets vars directly, no .env file ships there);
  // validate() below still fails loud if anything required ends up missing.
  logger.warn("dotenv_load_failed", { envPath, error: dotenvResult.error.message });
}

interface OracleEnv {
  ORACLE_PRIVATE_KEY: string;
  ANTHROPIC_API_KEY: string;
  RPC_URL_TESTNET: string;
  CONTRACT_ADDRESS: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  POLL_INTERVAL_SECONDS: number;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isValidPrivateKey(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function validate(): OracleEnv {
  const errors: string[] = [];
  const raw = process.env;

  const required = [
    "ORACLE_PRIVATE_KEY",
    "ANTHROPIC_API_KEY",
    "RPC_URL_TESTNET",
    "CONTRACT_ADDRESS",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "POLL_INTERVAL_SECONDS",
  ] as const;

  for (const key of required) {
    if (!raw[key] || raw[key].trim() === "") {
      errors.push(`${key} is missing.`);
    }
  }

  if (raw.ORACLE_PRIVATE_KEY && !isValidPrivateKey(raw.ORACLE_PRIVATE_KEY)) {
    errors.push("ORACLE_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string.");
  }

  if (raw.RPC_URL_TESTNET && !isValidUrl(raw.RPC_URL_TESTNET)) {
    errors.push("RPC_URL_TESTNET must be a valid URL.");
  }

  if (raw.CONTRACT_ADDRESS && !isAddress(raw.CONTRACT_ADDRESS)) {
    errors.push("CONTRACT_ADDRESS must be a valid Ethereum address.");
  }

  if (raw.SUPABASE_URL && !isValidUrl(raw.SUPABASE_URL)) {
    errors.push("SUPABASE_URL must be a valid URL.");
  }

  if (raw.ANTHROPIC_API_KEY && !/^sk-ant-/.test(raw.ANTHROPIC_API_KEY)) {
    errors.push("ANTHROPIC_API_KEY does not look like a valid Anthropic key (expected sk-ant- prefix).");
  }

  if (raw.SUPABASE_SERVICE_ROLE_KEY && raw.SUPABASE_SERVICE_ROLE_KEY.split(".").length !== 3) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY does not look like a valid JWT (expected 3 dot-separated segments).");
  }

  let pollIntervalSeconds = NaN;
  if (raw.POLL_INTERVAL_SECONDS) {
    pollIntervalSeconds = Number(raw.POLL_INTERVAL_SECONDS);
    if (!Number.isInteger(pollIntervalSeconds) || pollIntervalSeconds <= 0) {
      errors.push("POLL_INTERVAL_SECONDS must be a positive integer.");
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid oracle environment configuration:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  return {
    ORACLE_PRIVATE_KEY: raw.ORACLE_PRIVATE_KEY!,
    ANTHROPIC_API_KEY: raw.ANTHROPIC_API_KEY!,
    RPC_URL_TESTNET: raw.RPC_URL_TESTNET!,
    CONTRACT_ADDRESS: raw.CONTRACT_ADDRESS!,
    SUPABASE_URL: raw.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: raw.SUPABASE_SERVICE_ROLE_KEY!,
    POLL_INTERVAL_SECONDS: pollIntervalSeconds,
  };
}

export const env: OracleEnv = validate();
