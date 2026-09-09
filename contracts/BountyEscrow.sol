// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal escrow for a single-creator, single-agent, single-verifier bounty flow.
contract BountyEscrow {
    enum Status {
        None,
        Open,
        Claimed,
        Submitted,
        Paid,
        Rejected
    }

    struct Bounty {
        address creator;
        uint256 reward;
        string description;
        string taskType;
        Status status;
        address agent;
        bytes answer;
    }

    address public immutable verifier;
    mapping(bytes32 => Bounty) public bounties;

    event BountyCreated(
        bytes32 indexed taskId,
        address indexed creator,
        uint256 reward,
        string description,
        string taskType
    );
    event BountyClaimed(bytes32 indexed taskId, address indexed agent);
    event SubmissionCreated(bytes32 indexed taskId, address indexed agent, bytes answer);
    event BountyCompleted(bytes32 indexed taskId, bool verified);
    event RewardReleased(bytes32 indexed taskId, address indexed agent, uint256 reward);

    modifier onlyVerifier() {
        require(msg.sender == verifier, "not verifier");
        _;
    }

    constructor(address _verifier) {
        require(_verifier != address(0), "verifier required");
        verifier = _verifier;
    }

    function createBounty(bytes32 taskId, string calldata description, string calldata taskType)
        external
        payable
    {
        require(bounties[taskId].status == Status.None, "task exists");
        require(msg.value > 0, "must fund bounty");
        bounties[taskId] = Bounty({
            creator: msg.sender,
            reward: msg.value,
            description: description,
            taskType: taskType,
            status: Status.Open,
            agent: address(0),
            answer: ""
        });
        emit BountyCreated(taskId, msg.sender, msg.value, description, taskType);
    }

    /// @notice An agent claims an open bounty before doing any work. Prevents a second agent
    ///         from also submitting against the same bounty.
    function claimBounty(bytes32 taskId) external {
        Bounty storage b = bounties[taskId];
        require(b.status == Status.Open, "not open");
        b.agent = msg.sender;
        b.status = Status.Claimed;
        emit BountyClaimed(taskId, msg.sender);
    }

    function submitAnswer(bytes32 taskId, bytes calldata answer) external {
        Bounty storage b = bounties[taskId];
        require(b.status == Status.Claimed, "not claimed");
        require(b.agent == msg.sender, "not claimant");
        b.answer = answer;
        b.status = Status.Submitted;
        emit SubmissionCreated(taskId, msg.sender, answer);
    }

    /// @notice Called after a human reviews the independent verifier's evidence.
    function releaseReward(bytes32 taskId, bool verified) external onlyVerifier {
        Bounty storage b = bounties[taskId];
        require(b.status == Status.Submitted, "not submitted");

        if (verified) {
            b.status = Status.Paid;
            emit BountyCompleted(taskId, true);
            uint256 reward = b.reward;
            address agent = b.agent;
            b.reward = 0;
            (bool sent, ) = agent.call{value: reward}("");
            require(sent, "transfer failed");
            emit RewardReleased(taskId, agent, reward);
        } else {
            b.status = Status.Rejected;
            emit BountyCompleted(taskId, false);
        }
    }

    function getBounty(bytes32 taskId) external view returns (Bounty memory) {
        return bounties[taskId];
    }
}
