# Deploying SwarmEscrow to BOT Chain Testnet

## Network

| | |
|---|---|
| Chain ID | 968 |
| RPC URL | `https://rpc.bohr.life` |
| Faucet (testnet BOT) | https://faucet.botchain.ai/basic |

Fund your deployer wallet from the faucet before running the deploy script —
the transaction will fail if the deployer has no BOT to pay gas.

## Deployer wallet (no plaintext private key needed)

The script does not read a private key from an env var. Instead it calls
`vm.startBroadcast()` with no argument, so the signer comes from whatever the
`forge script` CLI is given — an encrypted keystore (`--account`), a raw
`--private-key`, or a hardware wallet (`--ledger`/`--trezor`). Whichever
address signs the deployment transaction becomes the contract's `owner`
(OpenZeppelin `Ownable`) — the address that can later call
`setOracleAddress`, `setChallengeWindow`, `setSeniorArbiterWindow`,
`setEmergencyDelay`, and `emergencyRescue`.

Recommended: use Foundry's encrypted keystore so the private key is never
exposed in shell history or a plaintext `.env` file:

```bash
# One-time setup: import the deployer key into an encrypted keystore.
# Prompts for the private key, then a password to encrypt it with.
cast wallet import deployer --interactive

# Confirm it's there:
cast wallet list
```

## Optional environment variables (demo defaults used if unset)

| Variable | Demo default | Notes |
|---|---|---|
| `CHALLENGE_WINDOW_SECONDS` | 300 (5 minutes) | Production target per CLAUDE.md is 3 days — these short values exist only so a full demo cycle (create → submit → vote → resolve → challenge window → senior arbiter window) can complete in minutes, not days. |
| `SENIOR_ARBITER_WINDOW_SECONDS` | 300 (5 minutes) | |
| `EMERGENCY_DELAY_SECONDS` | 600 (10 minutes) | |

The script logs an explicit `WARNING: ... not set - using demo-only default ... This is NOT a production value.` line for any of these left unset, so it's always visible in the deploy output which values were actually used.

**Note on the oracle address:** `ORACLE_ADDRESS` is hardcoded directly in
`script/Deploy.s.sol` (`0x51724B78D61c08A054697DF250924Df84D3Da539`), not read
from an environment variable. That address must be a wallet you separately
control the private key for — the Day 2 oracle service will need to sign
`submitVerdict` and `submitSeniorArbiterVerdict` transactions from it. It is
deliberately a different key from the deployer/owner key, since CLAUDE.md's
access-control model keeps the oracle role and the owner role separate.

## Deploy command

Run from `/contracts`, using the keystore imported above:

```bash
forge script script/Deploy.s.sol:DeploySwarmEscrow \
  --rpc-url https://rpc.bohr.life \
  --account deployer \
  --broadcast
```

This prompts for the keystore password at runtime — the private key itself
never appears in your shell history or environment.

(If you'd rather pass a raw key directly instead of a keystore, `--private-key
<your_deployer_private_key>` works the same way in place of `--account
deployer`, though the keystore approach above is recommended.)

To override any of the demo timing defaults, export them first, e.g.:

```bash
CHALLENGE_WINDOW_SECONDS=120 \
SENIOR_ARBITER_WINDOW_SECONDS=120 \
EMERGENCY_DELAY_SECONDS=300 \
forge script script/Deploy.s.sol:DeploySwarmEscrow \
  --rpc-url https://rpc.bohr.life \
  --account deployer \
  --broadcast
```

The script logs the chain ID, oracle address, all three window values, the
deployer/owner address (read back from the deployed contract), and finally
the deployed `SwarmEscrow` contract address.

Add `--verify` (with the appropriate `--etherscan-api-key` / verifier flags
for BOT Chain's block explorer, if one exists) once you're ready to verify
the source on-chain — not included by default here since it depends on
explorer support that hasn't been confirmed yet.
