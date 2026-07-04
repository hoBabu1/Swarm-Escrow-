// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SwarmEscrow} from "../src/SwarmEscrow.sol";

contract SwarmEscrowFuzzTest is Test {
    SwarmEscrow escrow;

    address oracle = makeAddr("oracle");
    address client = makeAddr("client");
    address worker = makeAddr("worker");

    bytes32 constant SPEC_HASH = keccak256("spec");
    bytes32 constant REASONING_HASH = keccak256("reasoning");

    uint256 constant CHALLENGE_WINDOW = 1 days;
    uint256 constant SENIOR_ARBITER_WINDOW = 1 days;
    uint256 constant EMERGENCY_DELAY = 7 days;

    function setUp() public {
        escrow = new SwarmEscrow(oracle, CHALLENGE_WINDOW, SENIOR_ARBITER_WINDOW, EMERGENCY_DELAY);
        vm.deal(client, type(uint128).max);
    }

    function _statusOf(uint256 escrowId) internal view returns (SwarmEscrow.Status) {
        (,,,,, SwarmEscrow.Status status,,,,,,,,,) = escrow.escrows(escrowId);
        return status;
    }

    function _amountOf(uint256 escrowId) internal view returns (uint256) {
        (,, uint256 amount,,,,,,,,,,,,) = escrow.escrows(escrowId);
        return amount;
    }

    // ---------------------------------------------------------------------
    // Deposit amounts
    // ---------------------------------------------------------------------

    function testFuzz_createEscrow_depositAmount(uint96 amount) public {
        vm.assume(amount > 0);
        vm.deal(client, amount);

        vm.prank(client);
        uint256 escrowId = escrow.createEscrow{value: amount}(worker, SPEC_HASH, block.timestamp + 1 days);

        assertEq(_amountOf(escrowId), amount);
        assertEq(address(escrow).balance, amount);
    }

    function testFuzz_createEscrow_zeroDepositAlwaysReverts(uint256 deadline) public {
        vm.assume(deadline > block.timestamp);

        vm.prank(client);
        vm.expectRevert("deposit required");
        escrow.createEscrow{value: 0}(worker, SPEC_HASH, deadline);
    }

    function testFuzz_finalizeAfterChallengeWindow_paysExactDeposit(
        uint96 amount,
        bool firstApproves,
        bool secondApproves
    ) public {
        vm.assume(amount > 0);
        vm.deal(client, amount);

        vm.prank(client);
        uint256 escrowId = escrow.createEscrow{value: amount}(worker, SPEC_HASH, block.timestamp + 1 days);
        vm.prank(worker);
        escrow.submitDeliverable(escrowId, "https://github.com/foo/bar", "abc123");

        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.Reviewer, firstApproves, REASONING_HASH);
        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.FraudSanity, secondApproves, REASONING_HASH);

        if (firstApproves != secondApproves) {
            vm.expectRevert("consensus not reached");
            escrow.resolve(escrowId);
            return;
        }

        escrow.resolve(escrowId);
        vm.warp(block.timestamp + CHALLENGE_WINDOW + 1);

        uint256 workerBefore = worker.balance;
        uint256 clientBefore = client.balance;

        escrow.finalizeAfterChallengeWindow(escrowId);

        if (firstApproves) {
            assertEq(worker.balance, workerBefore + amount);
        } else {
            assertEq(client.balance, clientBefore + amount);
        }
        assertEq(address(escrow).balance, 0);
    }

    // ---------------------------------------------------------------------
    // Vote combinations (2-of-3 consensus across all agent roles)
    // ---------------------------------------------------------------------

    function testFuzz_resolve_voteCombinations(bool reviewerApproves, bool fraudApproves, bool arbiterApproves)
        public
    {
        vm.prank(client);
        uint256 escrowId = escrow.createEscrow{value: 1 ether}(worker, SPEC_HASH, block.timestamp + 1 days);
        vm.prank(worker);
        escrow.submitDeliverable(escrowId, "https://github.com/foo/bar", "abc123");

        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.Reviewer, reviewerApproves, REASONING_HASH);
        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.FraudSanity, fraudApproves, REASONING_HASH);
        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.Arbiter, arbiterApproves, REASONING_HASH);

        uint8 approveCount;
        if (reviewerApproves) approveCount++;
        if (fraudApproves) approveCount++;
        if (arbiterApproves) approveCount++;

        escrow.resolve(escrowId);
        vm.warp(block.timestamp + CHALLENGE_WINDOW + 1);

        uint256 workerBefore = worker.balance;
        uint256 clientBefore = client.balance;

        escrow.finalizeAfterChallengeWindow(escrowId);

        if (approveCount >= 2) {
            assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Resolved));
            assertEq(worker.balance, workerBefore + 1 ether);
        } else {
            assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Refunded));
            assertEq(client.balance, clientBefore + 1 ether);
        }
    }

    // ---------------------------------------------------------------------
    // Deadline / timing edge cases
    // ---------------------------------------------------------------------

    function testFuzz_submitDeliverable_deadlineBoundary(uint32 offset) public {
        uint256 deadline = block.timestamp + 1 days;

        vm.prank(client);
        uint256 escrowId = escrow.createEscrow{value: 1 ether}(worker, SPEC_HASH, deadline);

        vm.warp(deadline + offset);

        vm.prank(worker);
        if (block.timestamp <= deadline) {
            escrow.submitDeliverable(escrowId, "https://github.com/foo/bar", "abc123");
            assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.DeliverableSubmitted));
        } else {
            vm.expectRevert("deadline passed");
            escrow.submitDeliverable(escrowId, "https://github.com/foo/bar", "abc123");
        }
    }

    function testFuzz_reclaimAfterDeadline_boundary(uint32 warpOffset) public {
        uint256 deadline = block.timestamp + 1 days;

        vm.prank(client);
        uint256 escrowId = escrow.createEscrow{value: 1 ether}(worker, SPEC_HASH, deadline);

        vm.warp(deadline + warpOffset);

        vm.prank(client);
        if (block.timestamp > deadline) {
            escrow.reclaimAfterDeadline(escrowId);
            assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Refunded));
        } else {
            vm.expectRevert("deadline not passed");
            escrow.reclaimAfterDeadline(escrowId);
        }
    }

    /// @dev Challenge-window boundary: challenge() succeeds at/before challengeDeadline,
    /// and finalizeAfterChallengeWindow only succeeds strictly after it.
    function testFuzz_challengeWindow_boundary(uint32 warpOffset) public {
        vm.prank(client);
        uint256 escrowId = escrow.createEscrow{value: 1 ether}(worker, SPEC_HASH, block.timestamp + 1 days);
        vm.prank(worker);
        escrow.submitDeliverable(escrowId, "https://github.com/foo/bar", "abc123");
        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.Reviewer, true, REASONING_HASH);
        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.FraudSanity, true, REASONING_HASH);
        escrow.resolve(escrowId);

        (,,,,,,,,, uint256 challengeDeadline,,,,,) = escrow.escrows(escrowId);
        vm.warp(uint256(challengeDeadline) + warpOffset);

        if (block.timestamp <= challengeDeadline) {
            vm.prank(client);
            escrow.challenge(escrowId, REASONING_HASH);
            assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Challenged));
        } else {
            vm.prank(client);
            vm.expectRevert("challenge window passed");
            escrow.challenge(escrowId, REASONING_HASH);

            escrow.finalizeAfterChallengeWindow(escrowId);
            assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Resolved));
        }
    }

    /// @dev Senior-arbiter window boundary: oracle verdict always wins if it lands in
    /// time; resolveAfterSeniorArbiterTimeout only succeeds strictly after the window.
    function testFuzz_seniorArbiterWindow_boundary(uint32 warpOffset, bool arbiterApproves) public {
        vm.prank(client);
        uint256 escrowId = escrow.createEscrow{value: 1 ether}(worker, SPEC_HASH, block.timestamp + 1 days);
        vm.prank(worker);
        escrow.submitDeliverable(escrowId, "https://github.com/foo/bar", "abc123");
        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.Reviewer, true, REASONING_HASH);
        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.FraudSanity, true, REASONING_HASH);
        escrow.resolve(escrowId);

        vm.prank(client);
        escrow.challenge(escrowId, REASONING_HASH);

        (,,,,,,,,,,, uint256 seniorArbiterDeadline,,,) = escrow.escrows(escrowId);
        vm.warp(uint256(seniorArbiterDeadline) + warpOffset);

        if (block.timestamp <= seniorArbiterDeadline) {
            vm.expectRevert("senior arbiter window not passed");
            escrow.resolveAfterSeniorArbiterTimeout(escrowId);

            vm.prank(oracle);
            escrow.submitSeniorArbiterVerdict(escrowId, arbiterApproves, REASONING_HASH);
            assertTrue(
                uint8(_statusOf(escrowId)) == uint8(SwarmEscrow.Status.Resolved)
                    || uint8(_statusOf(escrowId)) == uint8(SwarmEscrow.Status.Refunded)
            );
        } else {
            escrow.resolveAfterSeniorArbiterTimeout(escrowId);
            // Timeout fallback always honors the original tentative outcome (approved).
            assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Resolved));
        }
    }

    /// @dev Emergency-delay boundary: rescue only succeeds strictly after
    /// deadline + emergencyDelay, never before.
    function testFuzz_emergencyRescue_delayBoundary(uint32 deadlineOffset, uint32 warpOffset) public {
        vm.assume(deadlineOffset > 0);
        uint256 deadline = block.timestamp + deadlineOffset;

        vm.prank(client);
        uint256 escrowId = escrow.createEscrow{value: 1 ether}(worker, SPEC_HASH, deadline);
        vm.prank(worker);
        escrow.submitDeliverable(escrowId, "https://github.com/foo/bar", "abc123");

        vm.warp(uint256(deadline) + warpOffset);

        if (block.timestamp > deadline + EMERGENCY_DELAY) {
            escrow.emergencyRescue(escrowId, payable(worker));
            assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Resolved));
        } else {
            vm.expectRevert("emergency delay not passed");
            escrow.emergencyRescue(escrowId, payable(worker));
        }
    }
}
