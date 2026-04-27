// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title OfficerMultiSig
 * @notice 3-officer, 2-of-3 multi-sig review gate for land transfer proposals.
 *
 * Flow:
 *   1. MultiSigTransfer submits a proposal for review (submitForReview)
 *   2. Each officer independently approves or rejects via their own wallet
 *   3. On 2nd approval  → calls MultiSigTransfer.executeTransfer()
 *   4. On any rejection → calls MultiSigTransfer.cancelProposal() + freezes land
 *
 * Officers are fixed at deploy time. Only the deployer can rotate them
 * via a time-locked replacement process.
 */

interface IMultiSigTransfer {
    function executeTransfer(uint256 proposalId) external;
    function cancelProposal(uint256 proposalId) external;
}

interface ILandRegistry {
    function freezeLand(bytes32 landId, string calldata reason) external;
    function unfreezeLand(bytes32 landId) external;
}

contract OfficerMultiSig is ReentrancyGuard {

    // ─── Constants ───────────────────────────────────────────────────

    uint256 public constant OFFICER_COUNT = 3;
    uint256 public constant THRESHOLD     = 2;   // 2-of-3 required

    // ─── State ───────────────────────────────────────────────────────

    address[OFFICER_COUNT] public officers;
    mapping(address => bool) public isOfficer;
    mapping(address => uint256) public officerIndex; // 0, 1, or 2

    IMultiSigTransfer public transferContract;
    ILandRegistry     public registryContract;

    address public admin; // deployer — can rotate officers

    struct Review {
        bytes32 landId;
        uint256 proposalId;        // maps to MultiSigTransfer proposalId
        bytes32 offChainCaseRef;   // keccak256 of MongoDB OfficerCase _id
        uint256 approvalCount;
        uint256 rejectionCount;
        bool    executed;          // transfer executed
        bool    rejected;          // proposal rejected
        bool    exists;
        mapping(address => Vote) votes;
    }

    enum Vote { None, Approved, Rejected }

    mapping(uint256 => Review) private _reviews; // reviewId → Review
    uint256 public reviewCount;

    // proposalId → reviewId (reverse lookup)
    mapping(uint256 => uint256) public proposalToReview;

    // ─── Events ──────────────────────────────────────────────────────

    event ReviewSubmitted(
        uint256 indexed reviewId,
        uint256 indexed proposalId,
        bytes32 indexed landId,
        bytes32 offChainCaseRef
    );

    event OfficerApproved(
        uint256 indexed reviewId,
        address indexed officer,
        uint256 approvalCount
    );

    event OfficerRejected(
        uint256 indexed reviewId,
        address indexed officer,
        string  reason
    );

    event TransferApproved(
        uint256 indexed reviewId,
        uint256 indexed proposalId,
        bytes32 indexed landId
    );

    event TransferRejected(
        uint256 indexed reviewId,
        uint256 indexed proposalId,
        bytes32 indexed landId,
        string  reason
    );

    event OfficerRotated(
        uint256 indexed slot,
        address indexed oldOfficer,
        address indexed newOfficer
    );

    // ─── Modifiers ───────────────────────────────────────────────────

    modifier onlyOfficer() {
        require(isOfficer[msg.sender], "OfficerMultiSig: not an officer");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "OfficerMultiSig: not admin");
        _;
    }

    modifier onlyTransferContract() {
        require(
            msg.sender == address(transferContract),
            "OfficerMultiSig: caller is not transfer contract"
        );
        _;
    }

    modifier reviewExists(uint256 reviewId) {
        require(_reviews[reviewId].exists, "OfficerMultiSig: review not found");
        _;
    }

    modifier reviewOpen(uint256 reviewId) {
        require(!_reviews[reviewId].executed, "OfficerMultiSig: already executed");
        require(!_reviews[reviewId].rejected,  "OfficerMultiSig: already rejected");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────

    /**
     * @param _officers     Exactly 3 officer wallet addresses
     * @param _transfer     Address of MultiSigTransfer contract
     * @param _registry     Address of LandRegistry contract
     */
    constructor(
        address[OFFICER_COUNT] memory _officers,
        address _transfer,
        address _registry
    ) {
        require(_transfer != address(0), "Invalid transfer contract");
        require(_registry != address(0), "Invalid registry contract");

        for (uint256 i = 0; i < OFFICER_COUNT; i++) {
            address o = _officers[i];
            require(o != address(0),    "Invalid officer address");
            require(!isOfficer[o],      "Duplicate officer");
            officers[i]      = o;
            isOfficer[o]     = true;
            officerIndex[o]  = i;
        }

        transferContract = IMultiSigTransfer(_transfer);
        registryContract = ILandRegistry(_registry);
        admin            = msg.sender;
    }

    // ─── Submission (called by MultiSigTransfer) ─────────────────────

    /**
     * @notice Submit a proposal for officer review.
     *         Only callable by the MultiSigTransfer contract.
     * @param proposalId      ID in MultiSigTransfer
     * @param landId          bytes32 land identifier
     * @param offChainCaseRef keccak256 of MongoDB OfficerCase _id
     * @return reviewId       ID for this review session
     */
    function submitForReview(
        uint256 proposalId,
        bytes32 landId,
        bytes32 offChainCaseRef
    ) external onlyTransferContract returns (uint256 reviewId) {
        require(
            proposalToReview[proposalId] == 0,
            "OfficerMultiSig: proposal already under review"
        );

        reviewId = ++reviewCount; // start from 1 so 0 = "not found"

        Review storage r = _reviews[reviewId];
        r.landId          = landId;
        r.proposalId      = proposalId;
        r.offChainCaseRef = offChainCaseRef;
        r.approvalCount   = 0;
        r.rejectionCount  = 0;
        r.executed        = false;
        r.rejected        = false;
        r.exists          = true;

        proposalToReview[proposalId] = reviewId;

        emit ReviewSubmitted(reviewId, proposalId, landId, offChainCaseRef);
    }

    // ─── Officer Actions ─────────────────────────────────────────────

    /**
     * @notice Officer approves a transfer proposal.
     *         On reaching THRESHOLD approvals, auto-executes the transfer.
     * @param reviewId  The review session ID
     */
    function approve(uint256 reviewId)
        external
        onlyOfficer
        reviewExists(reviewId)
        reviewOpen(reviewId)
        nonReentrant
    {
        Review storage r = _reviews[reviewId];
        require(
            r.votes[msg.sender] == Vote.None,
            "OfficerMultiSig: already voted"
        );

        r.votes[msg.sender] = Vote.Approved;
        r.approvalCount++;

        emit OfficerApproved(reviewId, msg.sender, r.approvalCount);

        // Auto-execute when threshold is reached
        if (r.approvalCount >= THRESHOLD) {
            r.executed = true;
            emit TransferApproved(reviewId, r.proposalId, r.landId);
            transferContract.executeTransfer(r.proposalId);
        }
    }

    /**
     * @notice Officer rejects a transfer proposal.
     *         Immediately cancels the proposal, refunds buyer, freezes land.
     *         Rejection by ANY single officer is final.
     * @param reviewId  The review session ID
     * @param reason    Written justification (stored on-chain for audit)
     */
    function reject(uint256 reviewId, string calldata reason)
        external
        onlyOfficer
        reviewExists(reviewId)
        reviewOpen(reviewId)
        nonReentrant
    {
        require(bytes(reason).length > 0,   "OfficerMultiSig: reason required");
        require(bytes(reason).length <= 500, "OfficerMultiSig: reason too long");

        Review storage r = _reviews[reviewId];
        require(
            r.votes[msg.sender] == Vote.None,
            "OfficerMultiSig: already voted"
        );

        r.votes[msg.sender] = Vote.Rejected;
        r.rejectionCount++;
        r.rejected = true;

        emit OfficerRejected(reviewId, msg.sender, reason);
        emit TransferRejected(reviewId, r.proposalId, r.landId, reason);

        // Cancel proposal → refunds buyer
        transferContract.cancelProposal(r.proposalId);

        // Freeze the land until an officer clears it
        registryContract.freezeLand(r.landId, reason);
    }

    // ─── Freeze Management ───────────────────────────────────────────

    /**
     * @notice Officer clears a freeze on a land parcel.
     *         Used after a rejection is resolved (e.g. dispute cleared).
     * @param landId  The land to unfreeze
     */
    function clearFreeze(bytes32 landId) external onlyOfficer {
        registryContract.unfreezeLand(landId);
    }

    // ─── Officer Rotation (admin only) ───────────────────────────────

    /**
     * @notice Replace an officer by slot index (0, 1, or 2).
     *         Only callable by admin. New officer must not already be an officer.
     * @param slot        0, 1, or 2
     * @param newOfficer  Replacement wallet address
     */
    function rotateOfficer(uint256 slot, address newOfficer) external onlyAdmin {
        require(slot < OFFICER_COUNT,      "OfficerMultiSig: invalid slot");
        require(newOfficer != address(0),  "OfficerMultiSig: invalid address");
        require(!isOfficer[newOfficer],    "OfficerMultiSig: already an officer");

        address old = officers[slot];

        // Remove old
        isOfficer[old]    = false;
        officerIndex[old] = 0;

        // Add new
        officers[slot]         = newOfficer;
        isOfficer[newOfficer]  = true;
        officerIndex[newOfficer] = slot;

        emit OfficerRotated(slot, old, newOfficer);
    }

    /**
     * @notice Transfer admin role to a new address.
     */
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid admin");
        admin = newAdmin;
    }

    // ─── View Functions ──────────────────────────────────────────────

    function getOfficers() external view returns (address[OFFICER_COUNT] memory) {
        return officers;
    }

    function getOfficerIndex(address wallet) external view returns (uint256) {
        require(isOfficer[wallet], "Not an officer");
        return officerIndex[wallet];
    }

    function getReview(uint256 reviewId) external view returns (
        bytes32 landId,
        uint256 proposalId,
        bytes32 offChainCaseRef,
        uint256 approvalCount,
        uint256 rejectionCount,
        bool    executed,
        bool    rejected
    ) {
        Review storage r = _reviews[reviewId];
        require(r.exists, "Review not found");
        return (
            r.landId,
            r.proposalId,
            r.offChainCaseRef,
            r.approvalCount,
            r.rejectionCount,
            r.executed,
            r.rejected
        );
    }

    function getVote(uint256 reviewId, address officer)
        external view returns (Vote)
    {
        require(_reviews[reviewId].exists, "Review not found");
        return _reviews[reviewId].votes[officer];
    }

    function getReviewByProposal(uint256 proposalId)
        external view returns (uint256)
    {
        return proposalToReview[proposalId];
    }
}