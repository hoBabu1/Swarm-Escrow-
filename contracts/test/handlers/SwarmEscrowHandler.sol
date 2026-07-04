// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SwarmEscrow} from "../../src/SwarmEscrow.sol";

/// @dev Bounded random-action handler used by invariant tests. Funds `client` (not
/// itself) because vm.prank swaps the effective source of msg.value, not just
/// msg.sender — the pranked address must hold the balance being forwarded.
contract SwarmEscrowHandler is Test {
    SwarmEscrow public escrow;

    address public client = makeAddr("invariant_client");
    address public worker = makeAddr("invariant_worker");
    address public oracle;
    address public owner;

    /// @dev Ghost tracking of which escrows were terminated via emergencyRescue, so
    /// invariant tests can positively confirm the "(d) rescue bypass" branch instead
    /// of just inferring it from the absence of consensus/senior-arbiter evidence.
    mapping(uint256 => bool) public wasRescued;

    /// @dev Ghost tracking of which escrows were refunded via reclaimAfterDeadline —
    /// a legitimate no-consensus-required Refunded path (the escrow never reached
    /// DeliverableSubmitted+voting at all) that CLAUDE.md's invariant 2 text omits
    /// from its (a)-(d) enumeration. Tracked the same way as wasRescued so the
    /// invariant can positively confirm this case instead of treating it as a bug.
    mapping(uint256 => bool) public wasReclaimed;

    constructor(SwarmEscrow _escrow, address _oracle, address _owner) {
        escrow = _escrow;
        oracle = _oracle;
        owner = _owner;
        vm.deal(client, type(uint128).max);
    }

    function createEscrow(uint96 amount, uint32 deadlineOffset) public {
        amount = uint96(bound(amount, 1, 1000 ether));
        deadlineOffset = uint32(bound(deadlineOffset, 1, 365 days));

        vm.prank(client);
        escrow.createEscrow{value: amount}(worker, keccak256("spec"), block.timestamp + deadlineOffset);
    }

    function submitDeliverable(uint256 escrowIdSeed) public {
        uint256 count = escrow.escrowCounter();
        if (count == 0) return;
        uint256 escrowId = escrowIdSeed % count;

        vm.prank(worker);
        try escrow.submitDeliverable(escrowId, "https://github.com/foo/bar", "abc123") {} catch {}
    }

    function submitVerdict(uint256 escrowIdSeed, uint8 roleSeed, bool approved) public {
        uint256 count = escrow.escrowCounter();
        if (count == 0) return;
        uint256 escrowId = escrowIdSeed % count;
        SwarmEscrow.AgentRole role = SwarmEscrow.AgentRole(roleSeed % 3);

        vm.prank(oracle);
        try escrow.submitVerdict(escrowId, role, approved, keccak256("reasoning")) {} catch {}
    }

    function resolve(uint256 escrowIdSeed) public {
        uint256 count = escrow.escrowCounter();
        if (count == 0) return;
        uint256 escrowId = escrowIdSeed % count;

        try escrow.resolve(escrowId) {} catch {}
    }

    function finalizeAfterChallengeWindow(uint256 escrowIdSeed, uint32 warpSeconds) public {
        uint256 count = escrow.escrowCounter();
        if (count == 0) return;
        uint256 escrowId = escrowIdSeed % count;

        warpSeconds = uint32(bound(warpSeconds, 0, 10 days));
        vm.warp(block.timestamp + warpSeconds);

        try escrow.finalizeAfterChallengeWindow(escrowId) {} catch {}
    }

    function challenge(uint256 escrowIdSeed) public {
        uint256 count = escrow.escrowCounter();
        if (count == 0) return;
        uint256 escrowId = escrowIdSeed % count;

        (,,,,, SwarmEscrow.Status status,,, bool tentativeApproved,,,,,,) = escrow.escrows(escrowId);
        if (status != SwarmEscrow.Status.PendingChallenge) return;

        address challenger = tentativeApproved ? client : worker;
        vm.prank(challenger);
        try escrow.challenge(escrowId, keccak256("challenge reasoning")) {} catch {}
    }

    function submitSeniorArbiterVerdict(uint256 escrowIdSeed, bool approved) public {
        uint256 count = escrow.escrowCounter();
        if (count == 0) return;
        uint256 escrowId = escrowIdSeed % count;

        vm.prank(oracle);
        try escrow.submitSeniorArbiterVerdict(escrowId, approved, keccak256("senior reasoning")) {} catch {}
    }

    function resolveAfterSeniorArbiterTimeout(uint256 escrowIdSeed, uint32 warpSeconds) public {
        uint256 count = escrow.escrowCounter();
        if (count == 0) return;
        uint256 escrowId = escrowIdSeed % count;

        warpSeconds = uint32(bound(warpSeconds, 0, 10 days));
        vm.warp(block.timestamp + warpSeconds);

        try escrow.resolveAfterSeniorArbiterTimeout(escrowId) {} catch {}
    }

    function reclaimAfterDeadline(uint256 escrowIdSeed, uint32 warpSeconds) public {
        uint256 count = escrow.escrowCounter();
        if (count == 0) return;
        uint256 escrowId = escrowIdSeed % count;

        warpSeconds = uint32(bound(warpSeconds, 0, 400 days));
        vm.warp(block.timestamp + warpSeconds);

        vm.prank(client);
        try escrow.reclaimAfterDeadline(escrowId) {
            wasReclaimed[escrowId] = true;
        } catch {}
    }

    function emergencyRescue(uint256 escrowIdSeed, uint32 warpSeconds, bool toWorker) public {
        uint256 count = escrow.escrowCounter();
        if (count == 0) return;
        uint256 escrowId = escrowIdSeed % count;

        warpSeconds = uint32(bound(warpSeconds, 0, 400 days));
        vm.warp(block.timestamp + warpSeconds);

        address payable recipient = payable(toWorker ? worker : client);
        vm.prank(owner);
        try escrow.emergencyRescue(escrowId, recipient) {
            wasRescued[escrowId] = true;
        } catch {}
    }
}
