// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {SwarmEscrow} from "../src/SwarmEscrow.sol";

/// @notice Manual, non-AI end-to-end happy-path test against the already-deployed
/// SwarmEscrow contract on BOT Chain testnet. Each step is a separate entrypoint
/// (run via `--sig`) so you can wait out the challenge window between steps 4 and 5.
///
/// This proves deposit -> submit -> vote -> tentative resolve -> finalize works with
/// real transactions, with no oracle service running — every "oracle" action here is
/// signed manually with ORACLE_PRIVATE_KEY, matching CLAUDE.md's Day 1 plan of a
/// manual verdict trigger before the real oracle automation is built (Day 2).
///
/// Env vars:
///   CLIENT_PRIVATE_KEY  - signs createEscrow (and the deposit comes from this
///                         wallet), and is reused as the caller for resolve() /
///                         finalizeAfterChallengeWindow() since both are
///                         permissionless ("callable by anyone") on-chain.
///   WORKER_PRIVATE_KEY  - its address is used as the escrow's worker in step 1,
///                         and it signs submitDeliverable in step 2.
///   ORACLE_PRIVATE_KEY  - must correspond to the oracle address already configured
///                         on the deployed contract (0x51724B78D6...Da539). Signs
///                         submitVerdict in step 3.
///   DEPOSIT_WEI              - optional, defaults to 0.001 ether.
///   ESCROW_DEADLINE_SECONDS  - optional, defaults to 600 (10 minutes). This is the
///                              escrow's own submission deadline, unrelated to the
///                              contract's challengeWindow.
contract ManualTest is Script {
    // The contract deployed to BOT Chain testnet in the prior step.
    address constant ESCROW_CONTRACT = 0xc45d948467Dd39278a456D4341C00C14F31300b2;

    // Must match the oracle address the contract was deployed with.
    address constant ORACLE_ADDRESS = 0x51724B78D61c08A054697DF250924Df84D3Da539;

    // ------------------------------------------------------------------
    // Step 1: client creates the escrow.
    // ------------------------------------------------------------------
    function step1_createEscrow() external returns (uint256 escrowId) {
        uint256 clientKey = vm.envUint("CLIENT_PRIVATE_KEY");
        uint256 workerKey = vm.envUint("WORKER_PRIVATE_KEY");
        address worker = vm.addr(workerKey);

        uint256 depositWei = vm.envOr("DEPOSIT_WEI", uint256(0.001 ether));
        uint256 deadlineOffset = vm.envOr("ESCROW_DEADLINE_SECONDS", uint256(10 minutes));
        uint256 deadline = block.timestamp + deadlineOffset;
        bytes32 specHash = keccak256("manual-test spec: build a hello-world CLI");

        SwarmEscrow escrow = SwarmEscrow(ESCROW_CONTRACT);

        console.log("=== Step 1: createEscrow ===");
        console.log("Client:", vm.addr(clientKey));
        console.log("Worker:", worker);
        console.log("Deposit (wei):", depositWei);
        console.log("Escrow deadline (unix):", deadline);

        vm.startBroadcast(clientKey);
        escrowId = escrow.createEscrow{value: depositWei}(worker, specHash, deadline);
        vm.stopBroadcast();

        console.log("Escrow created. escrowId =", escrowId);
        console.log("Next: run step2_submitDeliverable with this escrowId.");
    }

    // ------------------------------------------------------------------
    // Step 2: worker submits the deliverable.
    // ------------------------------------------------------------------
    function step2_submitDeliverable(uint256 escrowId) external {
        uint256 workerKey = vm.envUint("WORKER_PRIVATE_KEY");
        SwarmEscrow escrow = SwarmEscrow(ESCROW_CONTRACT);

        address recordedWorker = _workerOf(escrow, escrowId);
        require(vm.addr(workerKey) == recordedWorker, "WORKER_PRIVATE_KEY does not match this escrow's worker");

        console.log("=== Step 2: submitDeliverable ===");
        console.log("escrowId:", escrowId);
        console.log("Worker:", recordedWorker);

        vm.startBroadcast(workerKey);
        escrow.submitDeliverable(
            escrowId, "https://github.com/example/manual-test-repo", "0000000000000000000000000000000000000000"
        );
        vm.stopBroadcast();

        _logStatus(escrow, escrowId, "Status after submitDeliverable");
        console.log("Next: run step3_submitVerdicts with this escrowId.");
    }

    // ------------------------------------------------------------------
    // Step 3: oracle records Reviewer=true and FraudSanity=true. Arbiter is
    // skipped -- 2-of-3 consensus is already reached once the first two agree.
    // ------------------------------------------------------------------
    function step3_submitVerdicts(uint256 escrowId) external {
        SwarmEscrow escrow = SwarmEscrow(ESCROW_CONTRACT);

        console.log("=== Step 3: submitVerdict (Reviewer, FraudSanity) ===");
        console.log("escrowId:", escrowId);
        console.log("Expected oracle:", ORACLE_ADDRESS);

        // No private key argument: the signer comes from whatever the CLI supplies
        // (e.g. --account oracle against an encrypted keystore), matching Deploy.s.sol's
        // pattern. The contract's own "only oracle" check reverts on-chain if the wrong
        // account signs, so no separate address-match require is needed here.
        vm.startBroadcast();
        escrow.submitVerdict(
            escrowId, SwarmEscrow.AgentRole.Reviewer, true, keccak256("manual-test reviewer reasoning: looks good")
        );
        escrow.submitVerdict(
            escrowId,
            SwarmEscrow.AgentRole.FraudSanity,
            true,
            keccak256("manual-test fraud/sanity reasoning: no red flags")
        );
        vm.stopBroadcast();

        console.log("Reviewer=true, FraudSanity=true recorded.");
        console.log("Arbiter vote skipped: 2-of-3 consensus already reached.");
        _logStatus(escrow, escrowId, "Status after submitVerdict x2");
        console.log("Next: run step4_resolve with this escrowId.");
    }

    // ------------------------------------------------------------------
    // Step 4: anyone can call resolve() once consensus exists. Tentatively
    // resolves and opens the challenge window -- does not move funds yet.
    // ------------------------------------------------------------------
    function step4_resolve(uint256 escrowId) external {
        uint256 callerKey = vm.envUint("CLIENT_PRIVATE_KEY");
        SwarmEscrow escrow = SwarmEscrow(ESCROW_CONTRACT);

        console.log("=== Step 4: resolve ===");
        console.log("escrowId:", escrowId);

        vm.startBroadcast(callerKey);
        escrow.resolve(escrowId);
        vm.stopBroadcast();

        (,,,,, SwarmEscrow.Status status,,, bool tentativeApproved, uint256 challengeDeadline,,,,,) =
            escrow.escrows(escrowId);

        console.log("Status (enum uint8, expect 2 = PendingChallenge):", uint8(status));
        console.log("tentativeApproved (expect true):", tentativeApproved);
        console.log("challengeDeadline (unix):", challengeDeadline);
        console.log("Current block.timestamp:", block.timestamp);
        console.log("Wait until block.timestamp > challengeDeadline, then run step5_finalize.");
    }

    // ------------------------------------------------------------------
    // Step 5: after the challenge window passes with nobody disputing, anyone
    // can call finalizeAfterChallengeWindow() to pay the worker.
    // ------------------------------------------------------------------
    function step5_finalize(uint256 escrowId) external {
        uint256 callerKey = vm.envUint("CLIENT_PRIVATE_KEY");
        SwarmEscrow escrow = SwarmEscrow(ESCROW_CONTRACT);

        address worker = _workerOf(escrow, escrowId);
        uint256 depositAmount = _amountOf(escrow, escrowId);
        uint256 workerBalanceBefore = worker.balance;

        console.log("=== Step 5: finalizeAfterChallengeWindow ===");
        console.log("escrowId:", escrowId);
        console.log("Worker balance before (wei):", workerBalanceBefore);
        console.log("Expected escrow amount (wei):", depositAmount);

        vm.startBroadcast(callerKey);
        escrow.finalizeAfterChallengeWindow(escrowId);
        vm.stopBroadcast();

        uint256 workerBalanceAfter = worker.balance;
        console.log("Worker balance after (wei):", workerBalanceAfter);
        console.log("Balance increase (wei):", workerBalanceAfter - workerBalanceBefore);

        _logStatus(escrow, escrowId, "Status after finalizeAfterChallengeWindow (expect 4 = Resolved)");

        require(
            workerBalanceAfter - workerBalanceBefore == depositAmount,
            "worker balance did not increase by the escrow amount as expected"
        );
        console.log("SUCCESS: full non-disputed happy path verified end-to-end.");
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _workerOf(SwarmEscrow escrow, uint256 escrowId) private view returns (address worker) {
        (, worker,,,,,,,,,,,,,) = escrow.escrows(escrowId);
    }

    function _amountOf(SwarmEscrow escrow, uint256 escrowId) private view returns (uint256 amount) {
        (,, amount,,,,,,,,,,,,) = escrow.escrows(escrowId);
    }

    function _statusOf(SwarmEscrow escrow, uint256 escrowId) private view returns (SwarmEscrow.Status status) {
        (,,,,, status,,,,,,,,,) = escrow.escrows(escrowId);
    }

    function _logStatus(SwarmEscrow escrow, uint256 escrowId, string memory label) private view {
        console.log(label);
        console.log("Status (enum uint8):", uint8(_statusOf(escrow, escrowId)));
    }
}
