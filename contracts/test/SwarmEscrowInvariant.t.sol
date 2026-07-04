// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SwarmEscrow} from "../src/SwarmEscrow.sol";
import {SwarmEscrowHandler} from "./handlers/SwarmEscrowHandler.sol";

contract SwarmEscrowInvariantTest is Test {
    SwarmEscrow escrow;
    SwarmEscrowHandler handler;

    address oracle = makeAddr("oracle");
    address owner = address(this);

    uint256 constant CHALLENGE_WINDOW = 1 days;
    uint256 constant SENIOR_ARBITER_WINDOW = 1 days;
    uint256 constant EMERGENCY_DELAY = 7 days;

    function setUp() public {
        escrow = new SwarmEscrow(oracle, CHALLENGE_WINDOW, SENIOR_ARBITER_WINDOW, EMERGENCY_DELAY);
        handler = new SwarmEscrowHandler(escrow, oracle, owner);

        targetContract(address(handler));
    }

    /// @dev Invariant 1: the contract's BOT balance always equals the sum of
    /// amounts of every escrow still in a non-terminal (unresolved) state.
    function invariant_balanceEqualsSumOfUnresolvedEscrows() public view {
        uint256 expected = 0;
        uint256 count = escrow.escrowCounter();

        for (uint256 i = 0; i < count; i++) {
            (,, uint256 amount,,, SwarmEscrow.Status status,,,,,,,,,) = escrow.escrows(i);
            if (status != SwarmEscrow.Status.Resolved && status != SwarmEscrow.Status.Refunded) {
                expected += amount;
            }
        }

        assertEq(address(escrow).balance, expected);
    }

    /// @dev Invariant 2: no escrow reaches Resolved or Refunded unless EITHER
    /// (a) it recorded 2-of-3 consensus among Reviewer/FraudSanity/Arbiter and was
    /// never successfully challenged, OR (b) a valid Senior Arbiter verdict was
    /// recorded following a valid challenge, OR (c) the senior-arbiter-timeout
    /// fallback paid out the original tentative verdict (also requires (a) to have
    /// held, since the fallback only ever pays the tentative outcome), OR (d) the
    /// owner's emergency rescue path was used (a separate, explicitly-flagged bypass
    /// that does not require any consensus at all), OR (e) reclaimAfterDeadline
    /// refunded the client because the escrow never reached DeliverableSubmitted +
    /// voting at all. (e) is not in CLAUDE.md's literal (a)-(d) enumeration for this
    /// chunk, but it's a documented core function and a legitimate zero-consensus
    /// Refunded path by design — omitting it would make this invariant fail against
    /// correct contract behavior, so it's included here as a fifth case.
    function invariant_terminalRequiresConsensusOrChallengeOrRescue() public view {
        uint256 count = escrow.escrowCounter();

        for (uint256 i = 0; i < count; i++) {
            (,,,,, SwarmEscrow.Status status,,, bool tentativeApproved,,,,,,) = escrow.escrows(i);
            if (status != SwarmEscrow.Status.Resolved && status != SwarmEscrow.Status.Refunded) continue;

            // (d): the owner's emergency rescue is an explicit, unconditional bypass —
            // it can fire on ANY non-terminal escrow (including one already sitting on
            // 2-of-3 consensus in PendingChallenge/Challenged) and the owner may send
            // funds to either party regardless of what the tentative outcome was. So
            // this must be checked FIRST, before any consensus-matching assertion,
            // otherwise a legitimate rescue that overrides the tentative outcome would
            // look like a violation.
            if (handler.wasRescued(i)) continue;

            // (e): reclaimAfterDeadline needs zero consensus by design.
            if (handler.wasReclaimed(i)) continue;

            (bool seniorHasVoted,,) = escrow.seniorArbiterVotes(i);

            // (b): a real Senior Arbiter verdict is final and binding on its own —
            // it doesn't need to match the (possibly overturned) tentative outcome.
            if (seniorHasVoted) continue;

            // (a) / (c): neither a rescue, a reclaim, nor a real Senior Arbiter
            // verdict occurred, so the only remaining legitimate path is 2-of-3
            // consensus paid out via finalizeAfterChallengeWindow or the senior-
            // arbiter-timeout fallback — both of which must honor tentativeApproved.
            uint8 approveCount;
            uint8 rejectCount;
            for (uint8 role = 0; role < 3; role++) {
                (bool hasVoted, bool approved,) = escrow.verdicts(i, role);
                if (hasVoted) {
                    if (approved) approveCount++;
                    else rejectCount++;
                }
            }
            bool hadTwoOfThreeConsensus = approveCount >= 2 || rejectCount >= 2;
            assertTrue(hadTwoOfThreeConsensus);

            bool paidWorker = status == SwarmEscrow.Status.Resolved;
            assertEq(paidWorker, tentativeApproved);
        }
    }
}
