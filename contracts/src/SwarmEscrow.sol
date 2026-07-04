// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SwarmEscrow
 * @notice Freelance/marketplace escrow for the BOT Chain Builder Challenge #1 hackathon.
 *
 * Instead of a human, DAO, or single AI judging submitted work, three distinct AI
 * agent roles vote 2-of-3 before escrowed funds are released or refunded:
 *   - Reviewer Agent      — checks the deliverable against the agreed spec
 *   - Fraud/Sanity Agent  — checks for gaming, fake submissions, or spec mismatch
 *   - Arbiter Agent       — only called if Reviewer and Fraud/Sanity disagree;
 *                           casts the deciding vote
 *
 * Each agent's verdict plus a hash of its reasoning is recorded on-chain. The full
 * reasoning text is stored off-chain (Supabase) and linked by that hash, so anyone
 * can verify the on-chain record matches what's displayed in the UI.
 *
 * Deliverables are scoped to a public GitHub repo pinned to a specific commit SHA;
 * private-repo / GitHub App support is out of scope for this hackathon.
 *
 * Escrowed funds are native BOT token only — no ERC-20 approve/transferFrom flow.
 */
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract SwarmEscrow is ReentrancyGuard, Ownable {
    enum Status {
        Created,
        DeliverableSubmitted,
        PendingChallenge,
        Challenged,
        Resolved,
        Refunded
    }

    enum AgentRole {
        Reviewer,
        FraudSanity,
        Arbiter
    }

    struct Escrow {
        address client;
        address worker;
        uint256 amount;
        bytes32 specHash;
        uint256 deadline;
        Status status;
        string repoUrl;
        string commitHash;
        bool tentativeApproved;
        uint256 challengeDeadline;
        bool hasChallenged;
        uint256 seniorArbiterDeadline;
        bytes32 challengeReasoningHash;
        bool hasClientFeedback;
        bool hasWorkerFeedback;
    }

    /// @dev One vote from one agent role on one escrow.
    struct Verdict {
        bool hasVoted;
        bool approved;
        bytes32 reasoningHash;
    }

    // Per-escrow votes as a fixed-size array of 3 (one slot per AgentRole, indexed
    // by uint8(role)) rather than a nested mapping(uint256 => mapping(AgentRole =>
    // Verdict)). AgentRole has a fixed, known cardinality of 3, so a fixed array
    // avoids the extra keccak256 a second mapping level would cost on every read/
    // write, while remaining just as readable via verdicts[escrowId][uint8(role)].
    mapping(uint256 => Verdict[3]) public verdicts;

    /// @dev The Senior Arbiter's verdict is stored completely separately from the
    /// original 3-agent Verdict[3] array, which must never be altered or resized.
    struct SeniorArbiterVote {
        bool hasVoted;
        bool approved;
        bytes32 reasoningHash;
    }

    mapping(uint256 => SeniorArbiterVote) public seniorArbiterVotes;

    mapping(uint256 => Escrow) public escrows;
    uint256 public escrowCounter;

    mapping(address => uint256[]) private clientEscrows;
    mapping(address => uint256[]) private workerEscrows;
    address public oracleAddress;

    uint256 public challengeWindow;
    uint256 public seniorArbiterWindow;
    uint256 public emergencyDelay;

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed client,
        address indexed worker,
        uint256 amount,
        bytes32 specHash,
        uint256 deadline
    );

    event DeliverableSubmitted(uint256 indexed escrowId, string repoUrl, string commitHash);

    event VerdictSubmitted(
        uint256 indexed escrowId, AgentRole indexed agentRole, bool approved, bytes32 reasoningHash
    );

    event EscrowResolved(uint256 indexed escrowId, address indexed worker, uint256 amount);

    event EscrowRefunded(uint256 indexed escrowId, address indexed client, uint256 amount);

    event OracleAddressUpdated(address indexed oldOracle, address indexed newOracle);
    event ChallengeWindowUpdated(uint256 oldWindow, uint256 newWindow);
    event SeniorArbiterWindowUpdated(uint256 oldWindow, uint256 newWindow);
    event EmergencyDelayUpdated(uint256 oldDelay, uint256 newDelay);

    event TentativeResolution(uint256 indexed escrowId, bool tentativeApproved, uint256 challengeDeadline);

    event SeniorArbiterTimeoutFallback(uint256 indexed escrowId, bool tentativeApproved);

    event ChallengeRaised(uint256 indexed escrowId, address indexed challenger, bytes32 reasoningHash);

    event SeniorArbiterVerdict(uint256 indexed escrowId, bool approved, bytes32 reasoningHash);

    event ClientFeedbackSubmitted(uint256 indexed escrowId, bytes32 messageHash);
    event WorkerFeedbackSubmitted(uint256 indexed escrowId, bytes32 messageHash);

    event EmergencyRescue(
        uint256 indexed escrowId, address indexed recipient, uint256 amount, address indexed caller
    );

    constructor(
        address _oracleAddress,
        uint256 _challengeWindow,
        uint256 _seniorArbiterWindow,
        uint256 _emergencyDelay
    ) Ownable(msg.sender) {
        require(_oracleAddress != address(0), "invalid oracle");
        oracleAddress = _oracleAddress;
        challengeWindow = _challengeWindow;
        seniorArbiterWindow = _seniorArbiterWindow;
        emergencyDelay = _emergencyDelay;
    }

    /// @notice Owner-only: update the oracle wallet address.
    function setOracleAddress(address _oracleAddress) external onlyOwner {
        require(_oracleAddress != address(0), "invalid oracle");
        emit OracleAddressUpdated(oracleAddress, _oracleAddress);
        oracleAddress = _oracleAddress;
    }

    /// @notice Owner-only: update the challenge window duration.
    function setChallengeWindow(uint256 _challengeWindow) external onlyOwner {
        emit ChallengeWindowUpdated(challengeWindow, _challengeWindow);
        challengeWindow = _challengeWindow;
    }

    /// @notice Owner-only: update the senior arbiter response window duration.
    function setSeniorArbiterWindow(uint256 _seniorArbiterWindow) external onlyOwner {
        emit SeniorArbiterWindowUpdated(seniorArbiterWindow, _seniorArbiterWindow);
        seniorArbiterWindow = _seniorArbiterWindow;
    }

    /// @notice Owner-only: update the emergency rescue buffer duration.
    function setEmergencyDelay(uint256 _emergencyDelay) external onlyOwner {
        emit EmergencyDelayUpdated(emergencyDelay, _emergencyDelay);
        emergencyDelay = _emergencyDelay;
    }

    /// @notice Client deposits native BOT to create a new escrow for `worker`.
    /// @param worker The address that will submit the deliverable.
    /// @param specHash keccak256 hash of the off-chain spec text (full text lives in Supabase).
    /// @param deadline Unix timestamp after which the client may reclaim funds if unresolved.
    function createEscrow(address worker, bytes32 specHash, uint256 deadline)
        external
        payable
        returns (uint256 escrowId)
    {
        require(msg.value > 0, "deposit required");
        require(worker != address(0), "invalid worker");
        require(deadline > block.timestamp, "deadline must be future");

        escrowId = escrowCounter++;

        escrows[escrowId] = Escrow({
            client: msg.sender,
            worker: worker,
            amount: msg.value,
            specHash: specHash,
            deadline: deadline,
            status: Status.Created,
            repoUrl: "",
            commitHash: "",
            tentativeApproved: false,
            challengeDeadline: 0,
            hasChallenged: false,
            seniorArbiterDeadline: 0,
            challengeReasoningHash: bytes32(0),
            hasClientFeedback: false,
            hasWorkerFeedback: false
        });

        clientEscrows[msg.sender].push(escrowId);
        workerEscrows[worker].push(escrowId);

        emit EscrowCreated(escrowId, msg.sender, worker, msg.value, specHash, deadline);
    }

    /// @notice Returns every escrow ID where `client` was the depositing client.
    function getClientEscrows(address client) external view returns (uint256[] memory) {
        return clientEscrows[client];
    }

    /// @notice Returns every escrow ID where `worker` was the assigned worker.
    function getWorkerEscrows(address worker) external view returns (uint256[] memory) {
        return workerEscrows[worker];
    }

    /// @notice Worker submits the deliverable as a public repo pinned to a commit SHA.
    /// @param escrowId The escrow to submit against.
    /// @param repoUrl Public GitHub repo URL.
    /// @param commitHash Pinned commit SHA the deliverable is judged at.
    function submitDeliverable(uint256 escrowId, string calldata repoUrl, string calldata commitHash)
        external
    {
        Escrow storage escrow = escrows[escrowId];

        require(msg.sender == escrow.worker, "only worker");
        require(escrow.status == Status.Created, "wrong status");
        require(block.timestamp <= escrow.deadline, "deadline passed");
        require(bytes(repoUrl).length > 0, "repoUrl required");
        require(bytes(commitHash).length > 0, "commitHash required");

        escrow.repoUrl = repoUrl;
        escrow.commitHash = commitHash;
        escrow.status = Status.DeliverableSubmitted;

        emit DeliverableSubmitted(escrowId, repoUrl, commitHash);
    }

    /// @notice Oracle-only: records one agent role's vote on an escrow. Does NOT resolve.
    function submitVerdict(uint256 escrowId, AgentRole agentRole, bool approved, bytes32 reasoningHash)
        external
    {
        require(msg.sender == oracleAddress, "only oracle");

        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == Status.DeliverableSubmitted, "wrong status");

        Verdict storage v = verdicts[escrowId][uint8(agentRole)];
        require(!v.hasVoted, "already voted");

        v.hasVoted = true;
        v.approved = approved;
        v.reasoningHash = reasoningHash;

        emit VerdictSubmitted(escrowId, agentRole, approved, reasoningHash);
    }

    /// @notice Callable by anyone. Once 2-of-3 agent consensus exists, computes the
    /// tentative outcome and opens the challenge window. Does NOT transfer funds.
    function resolve(uint256 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == Status.DeliverableSubmitted, "wrong status");

        Verdict[3] storage escrowVerdicts = verdicts[escrowId];
        uint8 approveCount = 0;
        uint8 rejectCount = 0;
        for (uint8 i = 0; i < 3; i++) {
            if (escrowVerdicts[i].hasVoted) {
                if (escrowVerdicts[i].approved) {
                    approveCount++;
                } else {
                    rejectCount++;
                }
            }
        }

        require(approveCount >= 2 || rejectCount >= 2, "consensus not reached");

        bool tentativeApproved = approveCount >= 2;
        uint256 challengeDeadline = block.timestamp + challengeWindow;

        escrow.status = Status.PendingChallenge;
        escrow.tentativeApproved = tentativeApproved;
        escrow.challengeDeadline = challengeDeadline;

        emit TentativeResolution(escrowId, tentativeApproved, challengeDeadline);
    }

    /// @notice Callable by anyone. Pays out the tentative outcome once the challenge
    /// window has passed without anyone challenging it.
    function finalizeAfterChallengeWindow(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == Status.PendingChallenge, "wrong status");
        require(block.timestamp > escrow.challengeDeadline, "challenge window not passed");

        _payOut(escrowId, escrow, escrow.tentativeApproved);
    }

    /// @notice Callable by anyone. If the oracle never submits a Senior Arbiter verdict
    /// within seniorArbiterDeadline, falls back to the original tentative outcome —
    /// challenging can never make funds unrecoverable.
    function resolveAfterSeniorArbiterTimeout(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == Status.Challenged, "wrong status");
        require(block.timestamp > escrow.seniorArbiterDeadline, "senior arbiter window not passed");

        emit SeniorArbiterTimeoutFallback(escrowId, escrow.tentativeApproved);
        _payOut(escrowId, escrow, escrow.tentativeApproved);
    }

    /// @notice Callable once, only by the losing party of the tentative outcome, only
    /// before challengeDeadline. Escalates the escrow to the Senior Arbiter.
    function challenge(uint256 escrowId, bytes32 reasoningHash) external {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == Status.PendingChallenge, "wrong status");
        require(block.timestamp <= escrow.challengeDeadline, "challenge window passed");
        require(!escrow.hasChallenged, "already challenged");

        address losingParty = escrow.tentativeApproved ? escrow.client : escrow.worker;
        require(msg.sender == losingParty, "only losing party");

        escrow.hasChallenged = true;
        escrow.status = Status.Challenged;
        escrow.seniorArbiterDeadline = block.timestamp + seniorArbiterWindow;
        escrow.challengeReasoningHash = reasoningHash;

        emit ChallengeRaised(escrowId, msg.sender, reasoningHash);
    }

    /// @notice Oracle-only, only when Challenged. Final and binding — pays out
    /// immediately per the Senior Arbiter's verdict, overriding the tentative outcome.
    function submitSeniorArbiterVerdict(uint256 escrowId, bool approved, bytes32 reasoningHash)
        external
        nonReentrant
    {
        require(msg.sender == oracleAddress, "only oracle");

        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == Status.Challenged, "wrong status");

        SeniorArbiterVote storage vote = seniorArbiterVotes[escrowId];
        vote.hasVoted = true;
        vote.approved = approved;
        vote.reasoningHash = reasoningHash;

        emit SeniorArbiterVerdict(escrowId, approved, reasoningHash);
        _payOut(escrowId, escrow, approved);
    }

    /// @dev Pays escrow.amount to worker (if approved) or client, sets the matching
    /// terminal status, and emits the matching resolution event. Shared by
    /// finalizeAfterChallengeWindow, the senior-arbiter-timeout fallback (which pass
    /// escrow.tentativeApproved), and submitSeniorArbiterVerdict (which passes the
    /// binding Senior Arbiter outcome instead).
    function _payOut(uint256 escrowId, Escrow storage escrow, bool approved) private {
        address client = escrow.client;
        address worker = escrow.worker;
        uint256 amount = escrow.amount;

        if (approved) {
            escrow.status = Status.Resolved;
            (bool success,) = worker.call{value: amount}("");
            require(success, "transfer failed");
            emit EscrowResolved(escrowId, worker, amount);
        } else {
            escrow.status = Status.Refunded;
            (bool success,) = client.call{value: amount}("");
            require(success, "transfer failed");
            emit EscrowRefunded(escrowId, client, amount);
        }
    }

    /// @notice Client-only: reclaim full deposit if the deadline passed without resolution.
    function reclaimAfterDeadline(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(msg.sender == escrow.client, "only client");
        require(block.timestamp > escrow.deadline, "deadline not passed");
        require(
            escrow.status == Status.Created || escrow.status == Status.DeliverableSubmitted,
            "already resolved"
        );

        address client = escrow.client;
        uint256 amount = escrow.amount;
        escrow.status = Status.Refunded;

        (bool success,) = client.call{value: amount}("");
        require(success, "transfer failed");

        emit EscrowRefunded(escrowId, client, amount);
    }

    /// @notice Owner-only last resort. Never sends to an arbitrary address (only the
    /// escrow's own client or worker) and never preempts the normal resolve/challenge/
    /// timeout paths — gated behind emergencyDelay stacked on top of whichever deadline
    /// is actually relevant to the escrow's current status (seniorArbiterDeadline while
    /// Challenged, challengeDeadline while PendingChallenge, otherwise the original
    /// escrow.deadline), in addition to the status check. A deliberate, disclosed
    /// centralization tradeoff, not a routine path.
    function emergencyRescue(uint256 escrowId, address payable recipient)
        external
        onlyOwner
        nonReentrant
    {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status != Status.Resolved && escrow.status != Status.Refunded, "already terminal");
        require(recipient == escrow.client || recipient == escrow.worker, "invalid recipient");

        uint256 relevantDeadline;
        if (escrow.status == Status.Challenged) {
            relevantDeadline = escrow.seniorArbiterDeadline;
        } else if (escrow.status == Status.PendingChallenge) {
            relevantDeadline = escrow.challengeDeadline;
        } else {
            relevantDeadline = escrow.deadline;
        }
        require(block.timestamp > relevantDeadline + emergencyDelay, "emergency delay not passed");

        uint256 amount = escrow.amount;
        escrow.status = recipient == escrow.worker ? Status.Resolved : Status.Refunded;

        (bool success,) = recipient.call{value: amount}("");
        require(success, "transfer failed");

        emit EmergencyRescue(escrowId, recipient, amount, msg.sender);
    }

    /// @notice Callable once per side, only after a terminal status. Client and worker
    /// each get exactly one feedback message to the other, linked by hash.
    function leaveFeedback(uint256 escrowId, bytes32 messageHash) external {
        Escrow storage escrow = escrows[escrowId];
        require(
            escrow.status == Status.Resolved || escrow.status == Status.Refunded, "wrong status"
        );

        if (msg.sender == escrow.client) {
            require(!escrow.hasClientFeedback, "already submitted feedback");
            escrow.hasClientFeedback = true;
            emit ClientFeedbackSubmitted(escrowId, messageHash);
        } else if (msg.sender == escrow.worker) {
            require(!escrow.hasWorkerFeedback, "already submitted feedback");
            escrow.hasWorkerFeedback = true;
            emit WorkerFeedbackSubmitted(escrowId, messageHash);
        } else {
            revert("only client or worker");
        }
    }
}
