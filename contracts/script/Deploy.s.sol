// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {SwarmEscrow} from "../src/SwarmEscrow.sol";

/// @notice Deploys SwarmEscrow to BOT Chain testnet (chain ID 968).
///
/// The deployer/broadcaster is supplied via the CLI, not an env var — use an
/// encrypted keystore (`cast wallet import`, then `--account <name>`) or
/// `--private-key` directly. Whichever address signs the broadcast becomes the
/// contract's owner via OpenZeppelin Ownable.
///
/// Optional env vars (short testnet-only defaults are used if unset):
///   CHALLENGE_WINDOW_SECONDS
///   SENIOR_ARBITER_WINDOW_SECONDS
///   EMERGENCY_DELAY_SECONDS
///
/// See /contracts/DEPLOY.md for the full runbook.
contract DeploySwarmEscrow is Script {
    // Oracle wallet address, hardcoded per explicit instruction rather than read
    // from an ORACLE_ADDRESS env var. This is the address the Day 2 oracle service
    // signs submitVerdict/submitSeniorArbiterVerdict transactions from — its
    // private key is held separately and is NOT DEPLOYER_PRIVATE_KEY.
    address constant ORACLE_ADDRESS = 0x51724B78D61c08A054697DF250924Df84D3Da539;

    // Short, testnet-only defaults so a full demo cycle (create -> submit -> vote
    // -> resolve -> challenge window -> senior arbiter window) can complete in
    // minutes rather than days. These are NOT production values — CLAUDE.md's
    // production target for challengeWindow alone is 3 days. See DEPLOY.md.
    uint256 constant DEFAULT_CHALLENGE_WINDOW_SECONDS = 5 minutes;
    uint256 constant DEFAULT_SENIOR_ARBITER_WINDOW_SECONDS = 5 minutes;
    uint256 constant DEFAULT_EMERGENCY_DELAY_SECONDS = 10 minutes;

    function run() external returns (SwarmEscrow escrow) {
        uint256 challengeWindow = _readWindow("CHALLENGE_WINDOW_SECONDS", DEFAULT_CHALLENGE_WINDOW_SECONDS);
        uint256 seniorArbiterWindow =
            _readWindow("SENIOR_ARBITER_WINDOW_SECONDS", DEFAULT_SENIOR_ARBITER_WINDOW_SECONDS);
        uint256 emergencyDelay = _readWindow("EMERGENCY_DELAY_SECONDS", DEFAULT_EMERGENCY_DELAY_SECONDS);

        console.log("=== SwarmEscrow deployment ===");
        console.log("Chain ID:", block.chainid);
        console.log("Oracle address (hardcoded):", ORACLE_ADDRESS);
        console.log("Challenge window (seconds):", challengeWindow);
        console.log("Senior arbiter window (seconds):", seniorArbiterWindow);
        console.log("Emergency delay (seconds):", emergencyDelay);

        // No private key argument here on purpose: the signer comes from whatever
        // the CLI supplies (--account <keystore name>, --private-key, --ledger,
        // etc.), so an encrypted keystore never has to touch a plaintext env var.
        vm.startBroadcast();
        escrow = new SwarmEscrow(ORACLE_ADDRESS, challengeWindow, seniorArbiterWindow, emergencyDelay);
        vm.stopBroadcast();

        // Read back from the deployed contract rather than logging msg.sender here:
        // msg.sender in this script's own execution context is forge's internal
        // script-runner address, not the broadcaster — escrow.owner() reflects who
        // actually signed the constructor transaction (Ownable sets owner from the
        // real broadcast msg.sender on-chain).
        console.log("Deployer / owner:", escrow.owner());
        console.log("SwarmEscrow deployed at:", address(escrow));
    }

    /// @dev Reads a window env var if set, otherwise falls back to `defaultValue`
    /// and logs a clear warning that the default is a demo value, not production.
    function _readWindow(string memory envVar, uint256 defaultValue) private view returns (uint256) {
        if (vm.envExists(envVar)) {
            return vm.envUint(envVar);
        }
        console.log(
            string.concat(
                "WARNING: ",
                envVar,
                " not set - using demo-only default of ",
                vm.toString(defaultValue),
                " seconds. This is NOT a production value."
            )
        );
        return defaultValue;
    }
}
