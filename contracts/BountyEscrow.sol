// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 view onto the ADC HTS token's built-in facade contract (HIP-218/376 —
///         every fungible HTS token is callable with standard ERC-20 selectors at its own EVM
///         address, no 0x167 precompile call needed). Since v0.35.2 these facade calls follow
///         normal ERC-20 revert/bool-return semantics, unlike the raw HTS system contract's
///         "return a response code, don't revert" convention used by associate() below.
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice HIP-719 facade — every HTS token also exposes associate()/dissociate() at its own
///         address, letting the CALLING account self-associate. This is the only way this
///         contract can ever associate itself with the ADC token: a classic SDK
///         TokenAssociateTransaction requires a signature from the target account's own key, and
///         a smart contract has no private key — association has to happen from inside a
///         contract function instead (see associateAdcToken below).
interface IHRC719 {
    function associate() external returns (int64 responseCode);
}

/// @notice Minimal escrow for a single-creator, single-agent, single-verifier bounty flow.
///         A bounty's reward is funded and paid out in either native HBAR or the ADC HTS token —
///         creator's choice at creation time, recorded per-bounty and used unchanged at payout.
contract BountyEscrow {
    enum Status {
        None,
        Open,
        Claimed,
        Submitted,
        Paid,
        Rejected
    }

    enum Asset {
        HBAR,
        ADC
    }

    struct Bounty {
        address creator;
        uint256 reward;
        Asset asset;
        string description;
        string taskType;
        Status status;
        address agent;
        bytes answer;
    }

    // HTS system-contract response code for SUCCESS. associate() follows the "return a response
    // code, don't revert" convention (unlike the ERC-20 facade calls elsewhere in this file), so
    // this file must check it explicitly rather than relying on a revert.
    int64 private constant HTS_SUCCESS = 22;

    address public immutable verifier;
    address public immutable adcToken;
    mapping(bytes32 => Bounty) public bounties;

    event BountyCreated(
        bytes32 indexed taskId,
        address indexed creator,
        uint256 reward,
        Asset asset,
        string description,
        string taskType
    );
    event BountyClaimed(bytes32 indexed taskId, address indexed agent);
    event SubmissionCreated(bytes32 indexed taskId, address indexed agent, bytes answer);
    event BountyCompleted(bytes32 indexed taskId, bool verified);
    event RewardReleased(bytes32 indexed taskId, address indexed agent, uint256 reward, Asset asset);

    modifier onlyVerifier() {
        require(msg.sender == verifier, "not verifier");
        _;
    }

    constructor(address _verifier, address _adcToken) {
        require(_verifier != address(0), "verifier required");
        require(_adcToken != address(0), "adc token required");
        verifier = _verifier;
        adcToken = _adcToken;
    }

    /// @notice One-time operational step — not part of the create/claim/submit/release flow.
    ///         Must be called exactly once, by anyone, immediately after deploy and before the
    ///         first ADC-funded bounty is created. Callable by any account since it only ever
    ///         associates THIS contract with the ADC token, regardless of who calls it.
    function associateAdcToken() external {
        (bool success, bytes memory result) = adcToken.call(abi.encodeWithSignature("associate()"));
        require(success, "association call reverted");
        if (result.length >= 32) {
            int64 responseCode = abi.decode(result, (int64));
            require(responseCode == HTS_SUCCESS, "token association failed");
        }
    }

    /// @notice Fund a bounty with native HBAR.
    function createBounty(bytes32 taskId, string calldata description, string calldata taskType)
        external
        payable
    {
        require(bounties[taskId].status == Status.None, "task exists");
        require(msg.value > 0, "must fund bounty");
        bounties[taskId] = Bounty({
            creator: msg.sender,
            reward: msg.value,
            asset: Asset.HBAR,
            description: description,
            taskType: taskType,
            status: Status.Open,
            agent: address(0),
            answer: ""
        });
        emit BountyCreated(taskId, msg.sender, msg.value, Asset.HBAR, description, taskType);
    }

    /// @notice Fund a bounty with the ADC token instead of HBAR. The caller must already have
    ///         approved this contract for at least `amount` on the ADC token's ERC-20 facade
    ///         (IERC20(adcToken).approve(address(this), amount)) in a prior transaction — the
    ///         standard two-step ERC-20 "approve then pull" pattern. Deliberately non-payable so
    ///         a stray msg.value can never be attached to this path.
    function createBountyWithToken(
        bytes32 taskId,
        string calldata description,
        string calldata taskType,
        uint256 amount
    ) external {
        require(bounties[taskId].status == Status.None, "task exists");
        require(amount > 0, "must fund bounty");
        bounties[taskId] = Bounty({
            creator: msg.sender,
            reward: amount,
            asset: Asset.ADC,
            description: description,
            taskType: taskType,
            status: Status.Open,
            agent: address(0),
            answer: ""
        });
        require(IERC20(adcToken).transferFrom(msg.sender, address(this), amount), "token funding failed");
        emit BountyCreated(taskId, msg.sender, amount, Asset.ADC, description, taskType);
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

    /// @notice Called after a human reviews the independent verifier's evidence. Pays out in
    ///         whichever asset the bounty was originally funded with — the asset lives on-chain
    ///         per-bounty, so callers of this function don't need to know or pass it.
    function releaseReward(bytes32 taskId, bool verified) external onlyVerifier {
        Bounty storage b = bounties[taskId];
        require(b.status == Status.Submitted, "not submitted");

        if (verified) {
            b.status = Status.Paid;
            emit BountyCompleted(taskId, true);
            uint256 reward = b.reward;
            address agent = b.agent;
            Asset asset = b.asset;
            b.reward = 0;
            if (asset == Asset.HBAR) {
                (bool sent, ) = agent.call{value: reward}("");
                require(sent, "transfer failed");
            } else {
                require(IERC20(adcToken).transfer(agent, reward), "token transfer failed");
            }
            emit RewardReleased(taskId, agent, reward, asset);
        } else {
            b.status = Status.Rejected;
            emit BountyCompleted(taskId, false);
        }
    }

    function getBounty(bytes32 taskId) external view returns (Bounty memory) {
        return bounties[taskId];
    }
}
