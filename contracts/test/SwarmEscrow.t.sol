// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SwarmEscrow} from "../src/SwarmEscrow.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract SwarmEscrowTest is Test {
    SwarmEscrow escrow;

    address owner = address(this);
    address oracle = makeAddr("oracle");
    address client = makeAddr("client");
    address worker = makeAddr("worker");
    address stranger = makeAddr("stranger");

    bytes32 constant SPEC_HASH = keccak256("spec");
    bytes32 constant REASONING_HASH = keccak256("reasoning");
    uint256 constant DEPOSIT = 1 ether;

    uint256 constant CHALLENGE_WINDOW = 1 days;
    uint256 constant SENIOR_ARBITER_WINDOW = 1 days;
    uint256 constant EMERGENCY_DELAY = 7 days;

    function setUp() public {
        escrow = new SwarmEscrow(oracle, CHALLENGE_WINDOW, SENIOR_ARBITER_WINDOW, EMERGENCY_DELAY);
        vm.deal(client, 10 ether);
    }

    function _createEscrow(uint256 deadline) internal returns (uint256 escrowId) {
        vm.prank(client);
        escrowId = escrow.createEscrow{value: DEPOSIT}(worker, SPEC_HASH, deadline);
    }

    function _createAndSubmit(uint256 deadline) internal returns (uint256 escrowId) {
        escrowId = _createEscrow(deadline);
        vm.prank(worker);
        escrow.submitDeliverable(escrowId, "https://github.com/foo/bar", "abc123");
    }

    /// @dev Drives an escrow to PendingChallenge via 2 matching votes and resolve().
    function _createSubmitAndResolve(bool approve) internal returns (uint256 escrowId) {
        escrowId = _createAndSubmit(block.timestamp + 1 days);
        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.Reviewer, approve, REASONING_HASH);
        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.FraudSanity, approve, REASONING_HASH);
        escrow.resolve(escrowId);
    }

    function _statusOf(uint256 escrowId) internal view returns (SwarmEscrow.Status) {
        (,,,,, SwarmEscrow.Status status,,,,,,,,,) = escrow.escrows(escrowId);
        return status;
    }

    // ---------------------------------------------------------------------
    // Constructor / ownership / configurable params
    // ---------------------------------------------------------------------

    function test_constructor_setsParams() public view {
        assertEq(escrow.oracleAddress(), oracle);
        assertEq(escrow.challengeWindow(), CHALLENGE_WINDOW);
        assertEq(escrow.seniorArbiterWindow(), SENIOR_ARBITER_WINDOW);
        assertEq(escrow.emergencyDelay(), EMERGENCY_DELAY);
        assertEq(escrow.owner(), owner);
    }

    function test_constructor_revertsOnZeroOracle() public {
        vm.expectRevert("invalid oracle");
        new SwarmEscrow(address(0), CHALLENGE_WINDOW, SENIOR_ARBITER_WINDOW, EMERGENCY_DELAY);
    }

    function test_setOracleAddress_onlyOwner() public {
        address newOracle = makeAddr("newOracle");
        escrow.setOracleAddress(newOracle);
        assertEq(escrow.oracleAddress(), newOracle);
    }

    function test_setOracleAddress_revertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        escrow.setOracleAddress(makeAddr("newOracle"));
    }

    function test_setOracleAddress_revertsOnZero() public {
        vm.expectRevert("invalid oracle");
        escrow.setOracleAddress(address(0));
    }

    function test_setChallengeWindow_onlyOwner() public {
        escrow.setChallengeWindow(2 days);
        assertEq(escrow.challengeWindow(), 2 days);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        escrow.setChallengeWindow(3 days);
    }

    function test_setSeniorArbiterWindow_onlyOwner() public {
        escrow.setSeniorArbiterWindow(2 days);
        assertEq(escrow.seniorArbiterWindow(), 2 days);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        escrow.setSeniorArbiterWindow(3 days);
    }

    function test_setEmergencyDelay_onlyOwner() public {
        escrow.setEmergencyDelay(2 days);
        assertEq(escrow.emergencyDelay(), 2 days);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        escrow.setEmergencyDelay(3 days);
    }

    // ---------------------------------------------------------------------
    // createEscrow
    // ---------------------------------------------------------------------

    function test_createEscrow_success() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 escrowId = _createEscrow(deadline);

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Created));
        assertEq(address(escrow).balance, DEPOSIT);
    }

    function test_createEscrow_revertsOnZeroValue() public {
        vm.prank(client);
        vm.expectRevert("deposit required");
        escrow.createEscrow(worker, SPEC_HASH, block.timestamp + 1 days);
    }

    function test_createEscrow_revertsOnZeroWorker() public {
        vm.prank(client);
        vm.expectRevert("invalid worker");
        escrow.createEscrow{value: DEPOSIT}(address(0), SPEC_HASH, block.timestamp + 1 days);
    }

    function test_createEscrow_revertsOnPastDeadline() public {
        vm.warp(1000);
        vm.prank(client);
        vm.expectRevert("deadline must be future");
        escrow.createEscrow{value: DEPOSIT}(worker, SPEC_HASH, block.timestamp - 1);
    }

    // ---------------------------------------------------------------------
    // Per-address history
    // ---------------------------------------------------------------------

    function test_getClientAndWorkerEscrows() public {
        uint256 id1 = _createEscrow(block.timestamp + 1 days);
        uint256 id2 = _createEscrow(block.timestamp + 1 days);

        uint256[] memory clientIds = escrow.getClientEscrows(client);
        uint256[] memory workerIds = escrow.getWorkerEscrows(worker);

        assertEq(clientIds.length, 2);
        assertEq(clientIds[0], id1);
        assertEq(clientIds[1], id2);
        assertEq(workerIds.length, 2);
        assertEq(workerIds[0], id1);
        assertEq(workerIds[1], id2);
    }

    function test_getClientEscrows_emptyForUnknownAddress() public view {
        uint256[] memory ids = escrow.getClientEscrows(stranger);
        assertEq(ids.length, 0);
    }

    // ---------------------------------------------------------------------
    // submitDeliverable
    // ---------------------------------------------------------------------

    function test_submitDeliverable_success() public {
        uint256 escrowId = _createEscrow(block.timestamp + 1 days);

        vm.prank(worker);
        escrow.submitDeliverable(escrowId, "https://github.com/foo/bar", "abc123");

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.DeliverableSubmitted));
    }

    function test_submitDeliverable_revertsForNonWorker() public {
        uint256 escrowId = _createEscrow(block.timestamp + 1 days);

        vm.prank(stranger);
        vm.expectRevert("only worker");
        escrow.submitDeliverable(escrowId, "https://github.com/foo/bar", "abc123");
    }

    function test_submitDeliverable_revertsIfAlreadySubmitted() public {
        uint256 escrowId = _createAndSubmit(block.timestamp + 1 days);

        vm.prank(worker);
        vm.expectRevert("wrong status");
        escrow.submitDeliverable(escrowId, "https://github.com/foo/bar2", "def456");
    }

    function test_submitDeliverable_revertsAfterDeadline() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 escrowId = _createEscrow(deadline);

        vm.warp(deadline + 1);

        vm.prank(worker);
        vm.expectRevert("deadline passed");
        escrow.submitDeliverable(escrowId, "https://github.com/foo/bar", "abc123");
    }

    // ---------------------------------------------------------------------
    // submitVerdict
    // ---------------------------------------------------------------------

    function test_submitVerdict_success() public {
        uint256 escrowId = _createAndSubmit(block.timestamp + 1 days);

        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.Reviewer, true, REASONING_HASH);

        (bool hasVoted, bool approved, bytes32 reasoningHash) =
            escrow.verdicts(escrowId, uint8(SwarmEscrow.AgentRole.Reviewer));
        assertTrue(hasVoted);
        assertTrue(approved);
        assertEq(reasoningHash, REASONING_HASH);
    }

    function test_submitVerdict_revertsForNonOracle() public {
        uint256 escrowId = _createAndSubmit(block.timestamp + 1 days);

        vm.prank(stranger);
        vm.expectRevert("only oracle");
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.Reviewer, true, REASONING_HASH);
    }

    function test_submitVerdict_revertsOnDuplicateVote() public {
        uint256 escrowId = _createAndSubmit(block.timestamp + 1 days);

        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.Reviewer, true, REASONING_HASH);

        vm.prank(oracle);
        vm.expectRevert("already voted");
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.Reviewer, false, REASONING_HASH);
    }

    function test_submitVerdict_doesNotAutoResolve() public {
        uint256 escrowId = _createAndSubmit(block.timestamp + 1 days);

        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.Reviewer, true, REASONING_HASH);

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.DeliverableSubmitted));
    }

    // ---------------------------------------------------------------------
    // resolve (tentative only, no fund movement)
    // ---------------------------------------------------------------------

    function test_resolve_setsPendingChallengeOnApproval() public {
        uint256 escrowId = _createSubmitAndResolve(true);

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.PendingChallenge));
        assertEq(address(escrow).balance, DEPOSIT, "resolve must not move funds");
    }

    function test_resolve_setsPendingChallengeOnRejection() public {
        uint256 escrowId = _createSubmitAndResolve(false);

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.PendingChallenge));
        assertEq(address(escrow).balance, DEPOSIT, "resolve must not move funds");
    }

    function test_resolve_arbiterBreaksTie() public {
        uint256 escrowId = _createAndSubmit(block.timestamp + 1 days);

        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.Reviewer, true, REASONING_HASH);
        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.FraudSanity, false, REASONING_HASH);

        vm.expectRevert("consensus not reached");
        escrow.resolve(escrowId);

        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.Arbiter, true, REASONING_HASH);

        escrow.resolve(escrowId);
        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.PendingChallenge));
    }

    function test_resolve_revertsWithoutConsensus() public {
        uint256 escrowId = _createAndSubmit(block.timestamp + 1 days);

        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.Reviewer, true, REASONING_HASH);

        vm.expectRevert("consensus not reached");
        escrow.resolve(escrowId);
    }

    function test_resolve_revertsIfAlreadyPendingChallenge() public {
        uint256 escrowId = _createSubmitAndResolve(true);

        vm.expectRevert("wrong status");
        escrow.resolve(escrowId);
    }

    function test_resolve_revertsBeforeDeliverableSubmitted() public {
        uint256 escrowId = _createEscrow(block.timestamp + 1 days);

        vm.expectRevert("wrong status");
        escrow.resolve(escrowId);
    }

    // ---------------------------------------------------------------------
    // finalizeAfterChallengeWindow
    // ---------------------------------------------------------------------

    function test_finalizeAfterChallengeWindow_paysWorkerOnApproval() public {
        uint256 escrowId = _createSubmitAndResolve(true);

        vm.warp(block.timestamp + CHALLENGE_WINDOW + 1);

        uint256 workerBefore = worker.balance;
        escrow.finalizeAfterChallengeWindow(escrowId);

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Resolved));
        assertEq(worker.balance, workerBefore + DEPOSIT);
    }

    function test_finalizeAfterChallengeWindow_refundsClientOnRejection() public {
        uint256 escrowId = _createSubmitAndResolve(false);

        vm.warp(block.timestamp + CHALLENGE_WINDOW + 1);

        uint256 clientBefore = client.balance;
        escrow.finalizeAfterChallengeWindow(escrowId);

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Refunded));
        assertEq(client.balance, clientBefore + DEPOSIT);
    }

    function test_finalizeAfterChallengeWindow_revertsBeforeWindowPasses() public {
        uint256 escrowId = _createSubmitAndResolve(true);

        vm.expectRevert("challenge window not passed");
        escrow.finalizeAfterChallengeWindow(escrowId);
    }

    function test_finalizeAfterChallengeWindow_revertsWrongStatus() public {
        uint256 escrowId = _createAndSubmit(block.timestamp + 1 days);

        vm.expectRevert("wrong status");
        escrow.finalizeAfterChallengeWindow(escrowId);
    }

    function test_finalizeAfterChallengeWindow_revertsIfChallenged() public {
        uint256 escrowId = _createSubmitAndResolve(true);

        vm.prank(client);
        escrow.challenge(escrowId, REASONING_HASH);

        vm.warp(block.timestamp + CHALLENGE_WINDOW + 1);

        vm.expectRevert("wrong status");
        escrow.finalizeAfterChallengeWindow(escrowId);
    }

    // ---------------------------------------------------------------------
    // challenge
    // ---------------------------------------------------------------------

    function test_challenge_byLosingClientOnApproval() public {
        uint256 escrowId = _createSubmitAndResolve(true);

        vm.prank(client);
        escrow.challenge(escrowId, REASONING_HASH);

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Challenged));
    }

    function test_challenge_byLosingWorkerOnRejection() public {
        uint256 escrowId = _createSubmitAndResolve(false);

        vm.prank(worker);
        escrow.challenge(escrowId, REASONING_HASH);

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Challenged));
    }

    function test_challenge_revertsForWinningParty() public {
        uint256 escrowId = _createSubmitAndResolve(true);

        vm.prank(worker);
        vm.expectRevert("only losing party");
        escrow.challenge(escrowId, REASONING_HASH);
    }

    function test_challenge_revertsForStranger() public {
        uint256 escrowId = _createSubmitAndResolve(true);

        vm.prank(stranger);
        vm.expectRevert("only losing party");
        escrow.challenge(escrowId, REASONING_HASH);
    }

    function test_challenge_revertsIfAlreadyChallenged() public {
        uint256 escrowId = _createSubmitAndResolve(true);

        vm.prank(client);
        escrow.challenge(escrowId, REASONING_HASH);

        vm.prank(client);
        vm.expectRevert("wrong status");
        escrow.challenge(escrowId, REASONING_HASH);
    }

    function test_challenge_revertsAfterWindowPasses() public {
        uint256 escrowId = _createSubmitAndResolve(true);

        vm.warp(block.timestamp + CHALLENGE_WINDOW + 1);

        vm.prank(client);
        vm.expectRevert("challenge window passed");
        escrow.challenge(escrowId, REASONING_HASH);
    }

    function test_challenge_revertsWrongStatus() public {
        uint256 escrowId = _createAndSubmit(block.timestamp + 1 days);

        vm.prank(client);
        vm.expectRevert("wrong status");
        escrow.challenge(escrowId, REASONING_HASH);
    }

    // ---------------------------------------------------------------------
    // submitSeniorArbiterVerdict
    // ---------------------------------------------------------------------

    function test_submitSeniorArbiterVerdict_paysWorkerOnApproval() public {
        uint256 escrowId = _createSubmitAndResolve(false);
        vm.prank(worker);
        escrow.challenge(escrowId, REASONING_HASH);

        uint256 workerBefore = worker.balance;
        vm.prank(oracle);
        escrow.submitSeniorArbiterVerdict(escrowId, true, REASONING_HASH);

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Resolved));
        assertEq(worker.balance, workerBefore + DEPOSIT);

        (bool hasVoted, bool approved, bytes32 reasoningHash) = escrow.seniorArbiterVotes(escrowId);
        assertTrue(hasVoted);
        assertTrue(approved);
        assertEq(reasoningHash, REASONING_HASH);
    }

    function test_submitSeniorArbiterVerdict_refundsClientOnRejection() public {
        uint256 escrowId = _createSubmitAndResolve(true);
        vm.prank(client);
        escrow.challenge(escrowId, REASONING_HASH);

        uint256 clientBefore = client.balance;
        vm.prank(oracle);
        escrow.submitSeniorArbiterVerdict(escrowId, false, REASONING_HASH);

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Refunded));
        assertEq(client.balance, clientBefore + DEPOSIT);
    }

    function test_submitSeniorArbiterVerdict_canOverturnTentativeOutcome() public {
        // Tentative outcome was approval (worker wins), client challenges,
        // and the senior arbiter overturns it in the client's favor.
        uint256 escrowId = _createSubmitAndResolve(true);
        vm.prank(client);
        escrow.challenge(escrowId, REASONING_HASH);

        vm.prank(oracle);
        escrow.submitSeniorArbiterVerdict(escrowId, false, REASONING_HASH);

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Refunded));
    }

    function test_submitSeniorArbiterVerdict_revertsForNonOracle() public {
        uint256 escrowId = _createSubmitAndResolve(true);
        vm.prank(client);
        escrow.challenge(escrowId, REASONING_HASH);

        vm.prank(stranger);
        vm.expectRevert("only oracle");
        escrow.submitSeniorArbiterVerdict(escrowId, true, REASONING_HASH);
    }

    function test_submitSeniorArbiterVerdict_revertsWithoutChallenge() public {
        uint256 escrowId = _createSubmitAndResolve(true);

        vm.prank(oracle);
        vm.expectRevert("wrong status");
        escrow.submitSeniorArbiterVerdict(escrowId, true, REASONING_HASH);
    }

    function test_submitSeniorArbiterVerdict_revertsIfAlreadyResolved() public {
        uint256 escrowId = _createSubmitAndResolve(true);
        vm.prank(client);
        escrow.challenge(escrowId, REASONING_HASH);

        vm.prank(oracle);
        escrow.submitSeniorArbiterVerdict(escrowId, true, REASONING_HASH);

        vm.prank(oracle);
        vm.expectRevert("wrong status");
        escrow.submitSeniorArbiterVerdict(escrowId, false, REASONING_HASH);
    }

    // ---------------------------------------------------------------------
    // resolveAfterSeniorArbiterTimeout
    // ---------------------------------------------------------------------

    function test_resolveAfterSeniorArbiterTimeout_fallsBackToTentative() public {
        uint256 escrowId = _createSubmitAndResolve(true);
        vm.prank(client);
        escrow.challenge(escrowId, REASONING_HASH);

        vm.warp(block.timestamp + SENIOR_ARBITER_WINDOW + 1);

        uint256 workerBefore = worker.balance;
        escrow.resolveAfterSeniorArbiterTimeout(escrowId);

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Resolved));
        assertEq(worker.balance, workerBefore + DEPOSIT);
    }

    function test_resolveAfterSeniorArbiterTimeout_revertsBeforeWindowPasses() public {
        uint256 escrowId = _createSubmitAndResolve(true);
        vm.prank(client);
        escrow.challenge(escrowId, REASONING_HASH);

        vm.expectRevert("senior arbiter window not passed");
        escrow.resolveAfterSeniorArbiterTimeout(escrowId);
    }

    function test_resolveAfterSeniorArbiterTimeout_revertsWithoutChallenge() public {
        uint256 escrowId = _createSubmitAndResolve(true);

        vm.expectRevert("wrong status");
        escrow.resolveAfterSeniorArbiterTimeout(escrowId);
    }

    function test_resolveAfterSeniorArbiterTimeout_revertsIfSeniorArbiterAlreadyResolved() public {
        uint256 escrowId = _createSubmitAndResolve(true);
        vm.prank(client);
        escrow.challenge(escrowId, REASONING_HASH);
        vm.prank(oracle);
        escrow.submitSeniorArbiterVerdict(escrowId, true, REASONING_HASH);

        vm.warp(block.timestamp + SENIOR_ARBITER_WINDOW + 1);

        vm.expectRevert("wrong status");
        escrow.resolveAfterSeniorArbiterTimeout(escrowId);
    }

    // ---------------------------------------------------------------------
    // reclaimAfterDeadline
    // ---------------------------------------------------------------------

    function test_reclaimAfterDeadline_successFromCreated() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 escrowId = _createEscrow(deadline);

        vm.warp(deadline + 1);

        uint256 clientBalanceBefore = client.balance;
        vm.prank(client);
        escrow.reclaimAfterDeadline(escrowId);

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Refunded));
        assertEq(client.balance, clientBalanceBefore + DEPOSIT);
    }

    function test_reclaimAfterDeadline_revertsForNonClient() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 escrowId = _createEscrow(deadline);
        vm.warp(deadline + 1);

        vm.prank(stranger);
        vm.expectRevert("only client");
        escrow.reclaimAfterDeadline(escrowId);
    }

    function test_reclaimAfterDeadline_revertsBeforeDeadline() public {
        uint256 escrowId = _createEscrow(block.timestamp + 1 days);

        vm.prank(client);
        vm.expectRevert("deadline not passed");
        escrow.reclaimAfterDeadline(escrowId);
    }

    function test_reclaimAfterDeadline_revertsIfAlreadyPendingChallenge() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 escrowId = _createSubmitAndResolve(true);

        vm.warp(deadline + 1);

        vm.prank(client);
        vm.expectRevert("already resolved");
        escrow.reclaimAfterDeadline(escrowId);
    }

    function test_reclaimAfterDeadline_cannotDoubleClaim() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 escrowId = _createEscrow(deadline);
        vm.warp(deadline + 1);

        vm.prank(client);
        escrow.reclaimAfterDeadline(escrowId);

        vm.prank(client);
        vm.expectRevert("already resolved");
        escrow.reclaimAfterDeadline(escrowId);
    }

    // ---------------------------------------------------------------------
    // emergencyRescue
    // ---------------------------------------------------------------------

    function test_emergencyRescue_paysWorker() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 escrowId = _createAndSubmit(deadline);

        vm.warp(deadline + EMERGENCY_DELAY + 1);

        uint256 workerBefore = worker.balance;
        escrow.emergencyRescue(escrowId, payable(worker));

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Resolved));
        assertEq(worker.balance, workerBefore + DEPOSIT);
    }

    function test_emergencyRescue_paysClient() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 escrowId = _createAndSubmit(deadline);

        vm.warp(deadline + EMERGENCY_DELAY + 1);

        uint256 clientBefore = client.balance;
        escrow.emergencyRescue(escrowId, payable(client));

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Refunded));
        assertEq(client.balance, clientBefore + DEPOSIT);
    }

    function test_emergencyRescue_revertsForNonOwner() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 escrowId = _createAndSubmit(deadline);
        vm.warp(deadline + EMERGENCY_DELAY + 1);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        escrow.emergencyRescue(escrowId, payable(worker));
    }

    function test_emergencyRescue_revertsForArbitraryRecipient() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 escrowId = _createAndSubmit(deadline);
        vm.warp(deadline + EMERGENCY_DELAY + 1);

        vm.expectRevert("invalid recipient");
        escrow.emergencyRescue(escrowId, payable(stranger));
    }

    function test_emergencyRescue_revertsBeforeBufferElapsed() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 escrowId = _createAndSubmit(deadline);

        // Deadline has passed, but the extra emergencyDelay buffer has not.
        vm.warp(deadline + 1);

        vm.expectRevert("emergency delay not passed");
        escrow.emergencyRescue(escrowId, payable(worker));
    }

    function test_emergencyRescue_revertsOnAlreadyTerminalEscrow() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 escrowId = _createEscrow(deadline);
        vm.warp(deadline + 1);
        vm.prank(client);
        escrow.reclaimAfterDeadline(escrowId);

        vm.warp(deadline + EMERGENCY_DELAY + 1);

        vm.expectRevert("already terminal");
        escrow.emergencyRescue(escrowId, payable(client));
    }

    function test_emergencyRescue_doesNotPreemptWithinNormalWindow() public {
        // A PendingChallenge escrow within its (short) challenge window should not
        // be rescuable just because emergencyDelay measured from the original
        // deadline has elapsed disproportionately fast relative to this test's setup.
        uint256 deadline = block.timestamp + 1 days;
        uint256 escrowId = _createSubmitAndResolve(true);

        vm.warp(deadline + 1); // past original deadline, but not past deadline + emergencyDelay

        vm.expectRevert("emergency delay not passed");
        escrow.emergencyRescue(escrowId, payable(worker));
    }

    /// @dev Timing-gate case: Created status must use escrow.deadline.
    function test_emergencyRescue_usesOriginalDeadline_whenCreated() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 escrowId = _createEscrow(deadline);

        vm.warp(deadline + EMERGENCY_DELAY);
        vm.expectRevert("emergency delay not passed");
        escrow.emergencyRescue(escrowId, payable(client));

        vm.warp(deadline + EMERGENCY_DELAY + 1);
        uint256 clientBefore = client.balance;
        escrow.emergencyRescue(escrowId, payable(client));

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Refunded));
        assertEq(client.balance, clientBefore + DEPOSIT);
    }

    /// @dev Timing-gate case: DeliverableSubmitted status must also use escrow.deadline
    /// (no challengeDeadline/seniorArbiterDeadline exists yet at this stage).
    function test_emergencyRescue_usesOriginalDeadline_whenDeliverableSubmitted() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 escrowId = _createAndSubmit(deadline);

        vm.warp(deadline + EMERGENCY_DELAY);
        vm.expectRevert("emergency delay not passed");
        escrow.emergencyRescue(escrowId, payable(worker));

        vm.warp(deadline + EMERGENCY_DELAY + 1);
        uint256 workerBefore = worker.balance;
        escrow.emergencyRescue(escrowId, payable(worker));

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Resolved));
        assertEq(worker.balance, workerBefore + DEPOSIT);
    }

    /// @dev Timing-gate case: PendingChallenge status must use challengeDeadline, not
    /// the original escrow.deadline.
    function test_emergencyRescue_usesChallengeDeadline_whenPendingChallenge() public {
        uint256 escrowId = _createSubmitAndResolve(true);
        (,,,,,,,,, uint256 challengeDeadline,,,,,) = escrow.escrows(escrowId);

        vm.warp(challengeDeadline + EMERGENCY_DELAY);
        vm.expectRevert("emergency delay not passed");
        escrow.emergencyRescue(escrowId, payable(worker));

        vm.warp(challengeDeadline + EMERGENCY_DELAY + 1);
        uint256 workerBefore = worker.balance;
        escrow.emergencyRescue(escrowId, payable(worker));

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Resolved));
        assertEq(worker.balance, workerBefore + DEPOSIT);
    }

    /// @dev Timing-gate case: Challenged status must use seniorArbiterDeadline, not
    /// challengeDeadline or the original escrow.deadline.
    function test_emergencyRescue_usesSeniorArbiterDeadline_whenChallenged() public {
        uint256 escrowId = _createSubmitAndResolve(true);
        vm.prank(client);
        escrow.challenge(escrowId, REASONING_HASH);
        (,,,,,,,,,,,uint256 seniorArbiterDeadline,,,) = escrow.escrows(escrowId);

        vm.warp(seniorArbiterDeadline + EMERGENCY_DELAY);
        vm.expectRevert("emergency delay not passed");
        escrow.emergencyRescue(escrowId, payable(client));

        vm.warp(seniorArbiterDeadline + EMERGENCY_DELAY + 1);
        uint256 clientBefore = client.balance;
        escrow.emergencyRescue(escrowId, payable(client));

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Refunded));
        assertEq(client.balance, clientBefore + DEPOSIT);
    }

    /// @dev Reproduces the original bug scenario directly: challengeWindow is
    /// configured large enough that challengeDeadline lands AFTER
    /// escrow.deadline + emergencyDelay. Under the old buggy gate
    /// (block.timestamp > escrow.deadline + emergencyDelay, unconditionally), rescue
    /// would have incorrectly become callable ~29 days before the challenge window
    /// even closed. The fix must still block it until the real gate
    /// (challengeDeadline + emergencyDelay) has passed.
    function test_emergencyRescue_doesNotUseStaleDeadline_whenChallengeDeadlineIsLater() public {
        escrow.setChallengeWindow(30 days);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 escrowId = _createAndSubmit(deadline);
        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.Reviewer, true, REASONING_HASH);
        vm.prank(oracle);
        escrow.submitVerdict(escrowId, SwarmEscrow.AgentRole.FraudSanity, true, REASONING_HASH);
        escrow.resolve(escrowId);

        (,,,,,,,,, uint256 challengeDeadline,,,,,) = escrow.escrows(escrowId);
        assertGt(
            challengeDeadline,
            deadline + EMERGENCY_DELAY,
            "test setup sanity: challengeDeadline must land after deadline + emergencyDelay"
        );

        // Past the OLD (buggy) gate of deadline + emergencyDelay -- must still revert.
        vm.warp(deadline + EMERGENCY_DELAY + 1);
        vm.expectRevert("emergency delay not passed");
        escrow.emergencyRescue(escrowId, payable(worker));

        // Past the CORRECT gate of challengeDeadline + emergencyDelay -- must succeed.
        vm.warp(challengeDeadline + EMERGENCY_DELAY + 1);
        uint256 workerBefore = worker.balance;
        escrow.emergencyRescue(escrowId, payable(worker));

        assertEq(uint8(_statusOf(escrowId)), uint8(SwarmEscrow.Status.Resolved));
        assertEq(worker.balance, workerBefore + DEPOSIT);
    }

    // ---------------------------------------------------------------------
    // leaveFeedback
    // ---------------------------------------------------------------------

    function test_leaveFeedback_clientAndWorkerBothSucceed() public {
        uint256 escrowId = _createSubmitAndResolve(true);
        vm.warp(block.timestamp + CHALLENGE_WINDOW + 1);
        escrow.finalizeAfterChallengeWindow(escrowId);

        vm.prank(client);
        escrow.leaveFeedback(escrowId, keccak256("great work"));

        vm.prank(worker);
        escrow.leaveFeedback(escrowId, keccak256("great client"));

        (,,,,,,,,,,,,, bool hasClientFeedback, bool hasWorkerFeedback) = escrow.escrows(escrowId);
        assertTrue(hasClientFeedback);
        assertTrue(hasWorkerFeedback);
    }

    function test_leaveFeedback_revertsBeforeTerminalStatus() public {
        uint256 escrowId = _createAndSubmit(block.timestamp + 1 days);

        vm.prank(client);
        vm.expectRevert("wrong status");
        escrow.leaveFeedback(escrowId, keccak256("too early"));
    }

    function test_leaveFeedback_revertsOnDoubleClientFeedback() public {
        uint256 escrowId = _createSubmitAndResolve(true);
        vm.warp(block.timestamp + CHALLENGE_WINDOW + 1);
        escrow.finalizeAfterChallengeWindow(escrowId);

        vm.prank(client);
        escrow.leaveFeedback(escrowId, keccak256("first"));

        vm.prank(client);
        vm.expectRevert("already submitted feedback");
        escrow.leaveFeedback(escrowId, keccak256("second"));
    }

    function test_leaveFeedback_revertsOnDoubleWorkerFeedback() public {
        uint256 escrowId = _createSubmitAndResolve(true);
        vm.warp(block.timestamp + CHALLENGE_WINDOW + 1);
        escrow.finalizeAfterChallengeWindow(escrowId);

        vm.prank(worker);
        escrow.leaveFeedback(escrowId, keccak256("first"));

        vm.prank(worker);
        vm.expectRevert("already submitted feedback");
        escrow.leaveFeedback(escrowId, keccak256("second"));
    }

    function test_leaveFeedback_revertsForStranger() public {
        uint256 escrowId = _createSubmitAndResolve(true);
        vm.warp(block.timestamp + CHALLENGE_WINDOW + 1);
        escrow.finalizeAfterChallengeWindow(escrowId);

        vm.prank(stranger);
        vm.expectRevert("only client or worker");
        escrow.leaveFeedback(escrowId, keccak256("not mine to give"));
    }
}
