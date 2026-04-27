// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MultiSigTransfer
 * @notice Orchestrates the full land transfer flow:
 *
 *   1. proposeTransfer()     — buyer locks full price in escrow
 *   2. approveCoOwner()      — each co-owner approves (optional, unanimous)
 *   3. submitToOfficers()    — after all co-owners approve, sends to OfficerMultiSig
 *   4. executeTransfer()     — called by OfficerMultiSig on 2-of-3 approval
 *   5. cancelProposal()      — called by OfficerMultiSig on rejection OR by
 *                              buyer (before escrow) / seller (before officer review)
 *
 * Cancellation rules:
 *   - Buyer  : can cancel in stages before escrow_locked
 *   - Seller : can cancel in stages before officer_review
 *   - Neither: can cancel once in officer_review (only OfficerMultiSig can)
 */

interface ILandRegistry {
    function transferLand(bytes32 landId, address to, uint256 price, bytes32 txRef) external;
    function getLand(bytes32 landId) external view returns (
        address, string memory, uint256, bool, bool, string memory
    );
}

interface IOfficerMultiSig {
    function submitForReview(
        uint256 proposalId,
        bytes32 landId,
        bytes32 offChainCaseRef
    ) external returns (uint256 reviewId);
}

contract MultiSigTransfer is ReentrancyGuard {

    // ─── Enums ───────────────────────────────────────────────────────

    enum Stage {
        EscrowLocked,         // 0 — funds locked, co-owner approval pending
        OfficerReview,        // 1 — submitted to officers
        Executed,             // 2 — transfer complete
        Cancelled             // 3 — cancelled or rejected
    }

    // ─── Data Structures ────────────────────────────────────────────

    struct Proposal {
        bytes32 landId;
        address seller;
        address buyer;
        uint256 price;
        bytes32 offChainRef;       // keccak256(MongoDB TransferRequest _id)
        bytes32 offChainCaseRef;   // keccak256(MongoDB OfficerCase _id) — set later
        Stage   stage;
        uint256 createdAt;
        // Co-owner tracking
        uint256 coOwnerCount;      // 0 = no co-owners
        uint256 coOwnerApprovals;
        bool    coOwnersComplete;
    }

    // ─── State ──────────────────────────────────────────────────────

    ILandRegistry   public registry;
    IOfficerMultiSig public officerMultiSig;

    address public admin;

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;

    // co-owner approval tracking per proposal
    mapping(uint256 => address[]) public proposalCoOwners;
    mapping(uint256 => mapping(address => bool)) public coOwnerApproved;

    // per-land co-owner registry (set by land owner)
    mapping(bytes32 => address[]) public landCoOwners;
    mapping(bytes32 => mapping(address => bool)) public isLandCoOwner;

    // ─── Events ─────────────────────────────────────────────────────

    event CoOwnersSet(bytes32 indexed landId, address[] coOwners);

    event ProposalCreated(
        uint256 indexed proposalId,
        bytes32 indexed landId,
        address indexed buyer,
        address seller,
        uint256 price,
        uint256 coOwnerCount
    );

    event CoOwnerApproved(
        uint256 indexed proposalId,
        address indexed coOwner,
        uint256 approvalCount,
        uint256 required
    );

    event SubmittedToOfficers(
        uint256 indexed proposalId,
        bytes32 indexed landId,
        uint256 reviewId
    );

    event TransferExecuted(
        uint256 indexed proposalId,
        bytes32 indexed landId,
        address indexed newOwner,
        uint256 price
    );

    event ProposalCancelled(
        uint256 indexed proposalId,
        address cancelledBy,
        string  reason
    );

    // ─── Modifiers ───────────────────────────────────────────────────

    modifier onlyOfficerMultiSig() {
        require(
            msg.sender == address(officerMultiSig),
            "MultiSigTransfer: caller is not OfficerMultiSig"
        );
        _;
    }

    modifier proposalOpen(uint256 proposalId) {
        Stage s = proposals[proposalId].stage;
        require(
            s != Stage.Executed && s != Stage.Cancelled,
            "MultiSigTransfer: proposal is closed"
        );
        _;
    }

    // ─── Constructor ────────────────────────────────────────────────

    constructor(address _registry) {
        require(_registry != address(0), "Invalid registry");
        registry = ILandRegistry(_registry);
        admin    = msg.sender;
    }

    // ─── Admin Setup ────────────────────────────────────────────────

    /**
     * @notice Wire in the OfficerMultiSig contract after deployment.
     *         One-time call — prevents accidental re-pointing.
     */
    function setOfficerMultiSig(address _officerMultiSig) external {
        require(msg.sender == admin,               "Not admin");
        require(_officerMultiSig != address(0),    "Invalid address");
        require(address(officerMultiSig) == address(0), "Already set");
        officerMultiSig = IOfficerMultiSig(_officerMultiSig);
    }

    // ─── Co-Owner Management ────────────────────────────────────────

    /**
     * @notice Land owner sets co-owners for their parcel.
     *         Pass empty array to remove all co-owners (single owner).
     */
    function setCoOwners(bytes32 landId, address[] calldata coOwners) external {
        (address landOwner,,,,,) = registry.getLand(landId);
        require(landOwner == msg.sender, "MultiSigTransfer: not land owner");

        // Clear existing
        address[] storage old = landCoOwners[landId];
        for (uint256 i = 0; i < old.length; i++) {
            isLandCoOwner[landId][old[i]] = false;
        }
        delete landCoOwners[landId];

        // Set new
        for (uint256 i = 0; i < coOwners.length; i++) {
            require(coOwners[i] != address(0), "Invalid co-owner");
            require(!isLandCoOwner[landId][coOwners[i]], "Duplicate co-owner");
            landCoOwners[landId].push(coOwners[i]);
            isLandCoOwner[landId][coOwners[i]] = true;
        }

        emit CoOwnersSet(landId, coOwners);
    }

    // ─── Proposal Lifecycle ─────────────────────────────────────────

    /**
     * @notice Buyer creates a transfer proposal and locks full price in escrow.
     *         Must send exact price in POL (msg.value == price).
     *
     * @param landId       Target land parcel
     * @param offChainRef  keccak256(MongoDB TransferRequest _id)
     */
    function proposeTransfer(
        bytes32 landId,
        bytes32 offChainRef
    ) external payable returns (uint256 proposalId) {
        require(msg.value > 0, "MultiSigTransfer: must send price in POL");

        (
            address landOwner,
            ,
            ,
            bool exists,
            bool frozen,

        ) = registry.getLand(landId);

        require(exists,              "MultiSigTransfer: land not registered");
        require(!frozen,             "MultiSigTransfer: land is frozen");
        require(landOwner != msg.sender, "MultiSigTransfer: buyer is the owner");

        uint256 coOwnerCount = landCoOwners[landId].length;

        proposalId = proposalCount++;

        proposals[proposalId] = Proposal({
            landId:           landId,
            seller:           landOwner,
            buyer:            msg.sender,
            price:            msg.value,
            offChainRef:      offChainRef,
            offChainCaseRef:  bytes32(0), // set when submitted to officers
            stage:            Stage.EscrowLocked,
            createdAt:        block.timestamp,
            coOwnerCount:     coOwnerCount,
            coOwnerApprovals: 0,
            coOwnersComplete: coOwnerCount == 0 // true immediately if no co-owners
        });

        // Snapshot co-owners at proposal time
        for (uint256 i = 0; i < coOwnerCount; i++) {
            proposalCoOwners[proposalId].push(landCoOwners[landId][i]);
        }

        emit ProposalCreated(
            proposalId,
            landId,
            msg.sender,
            landOwner,
            msg.value,
            coOwnerCount
        );

        // No co-owners — skip straight to officer review trigger
        // (seller still needs to call submitToOfficers after accepting off-chain)
    }

    /**
     * @notice Co-owner approves a transfer proposal.
     *         All co-owners must approve before it can go to officers.
     */
    function approveCoOwner(uint256 proposalId)
        external
        proposalOpen(proposalId)
    {
        Proposal storage p = proposals[proposalId];
        require(
            p.stage == Stage.EscrowLocked,
            "MultiSigTransfer: not in escrow stage"
        );
        require(
            !p.coOwnersComplete,
            "MultiSigTransfer: co-owner approval already complete"
        );
        require(
            _isProposalCoOwner(proposalId, msg.sender),
            "MultiSigTransfer: not a co-owner for this proposal"
        );
        require(
            !coOwnerApproved[proposalId][msg.sender],
            "MultiSigTransfer: already approved"
        );

        coOwnerApproved[proposalId][msg.sender] = true;
        p.coOwnerApprovals++;

        emit CoOwnerApproved(
            proposalId,
            msg.sender,
            p.coOwnerApprovals,
            p.coOwnerCount
        );

        if (p.coOwnerApprovals >= p.coOwnerCount) {
            p.coOwnersComplete = true;
        }
    }

    /**
     * @notice Submit the proposal to officer review.
     *         Can be called by the seller once:
     *           - co-owner consent is complete (or no co-owners exist)
     *           - escrow is locked
     *
     * @param proposalId      The proposal to submit
     * @param offChainCaseRef keccak256(MongoDB OfficerCase _id)
     */
    function submitToOfficers(uint256 proposalId, bytes32 offChainCaseRef)
        external
        proposalOpen(proposalId)
    {
        Proposal storage p = proposals[proposalId];
        require(
            msg.sender == p.seller,
            "MultiSigTransfer: only seller can submit to officers"
        );
        require(
            p.stage == Stage.EscrowLocked,
            "MultiSigTransfer: must be in escrow stage"
        );
        require(
            p.coOwnersComplete,
            "MultiSigTransfer: co-owner approvals not complete"
        );

        p.stage           = Stage.OfficerReview;
        p.offChainCaseRef = offChainCaseRef;

        uint256 reviewId = officerMultiSig.submitForReview(
            proposalId,
            p.landId,
            offChainCaseRef
        );

        emit SubmittedToOfficers(proposalId, p.landId, reviewId);
    }

    /**
     * @notice Execute the transfer. Called ONLY by OfficerMultiSig on 2-of-3 approval.
     *         Transfers land ownership and releases escrow funds to seller.
     */
    function executeTransfer(uint256 proposalId)
        external
        onlyOfficerMultiSig
        proposalOpen(proposalId)
        nonReentrant
    {
        Proposal storage p = proposals[proposalId];
        require(
            p.stage == Stage.OfficerReview,
            "MultiSigTransfer: not in officer review stage"
        );

        // Snapshot seller before state changes
        address seller = p.seller;
        address buyer  = p.buyer;
        uint256 price  = p.price;
        bytes32 landId = p.landId;

        p.stage = Stage.Executed;

        // Transfer land on-chain
        registry.transferLand(landId, buyer, price, p.offChainRef);

        // Release escrow to seller
        if (price > 0) {
            (bool success, ) = payable(seller).call{value: price}("");
            require(success, "MultiSigTransfer: fund release failed");
        }

        emit TransferExecuted(proposalId, landId, buyer, price);
    }

    /**
     * @notice Cancel a proposal and refund the buyer.
     *
     * Cancellation rules:
     *   - Buyer  : only in Stage.EscrowLocked (before officer review)
     *   - Seller : only in Stage.EscrowLocked (before officer review)
     *   - OfficerMultiSig: can cancel in Stage.OfficerReview (on rejection)
     */
    function cancelProposal(uint256 proposalId)
        external
        nonReentrant
        proposalOpen(proposalId)
    {
        Proposal storage p = proposals[proposalId];
        Stage stage = p.stage;

        bool callerIsOfficerMultiSig = (msg.sender == address(officerMultiSig));
        bool callerIsBuyer           = (msg.sender == p.buyer);
        bool callerIsSeller          = (msg.sender == p.seller);

        // Officer rejection — always allowed in OfficerReview
        if (callerIsOfficerMultiSig) {
            require(
                stage == Stage.OfficerReview,
                "MultiSigTransfer: can only cancel review-stage proposals"
            );
        }
        // Buyer — only before officer review
        else if (callerIsBuyer) {
            require(
                stage == Stage.EscrowLocked,
                "MultiSigTransfer: buyer can only cancel before officer review"
            );
        }
        // Seller — only before officer review
        else if (callerIsSeller) {
            require(
                stage == Stage.EscrowLocked,
                "MultiSigTransfer: seller can only cancel before officer review"
            );
        }
        else {
            revert("MultiSigTransfer: not authorized to cancel");
        }

        address buyer = p.buyer;
        uint256 price = p.price;
        p.stage       = Stage.Cancelled;

        string memory reason = callerIsOfficerMultiSig
            ? "Rejected by officers"
            : callerIsBuyer
                ? "Cancelled by buyer"
                : "Cancelled by seller";

        // Refund buyer
        if (price > 0) {
            (bool success, ) = payable(buyer).call{value: price}("");
            require(success, "MultiSigTransfer: refund failed");
        }

        emit ProposalCancelled(proposalId, msg.sender, reason);
    }

    // ─── View Functions ──────────────────────────────────────────────

    function getProposal(uint256 proposalId) external view returns (
        bytes32 landId,
        address seller,
        address buyer,
        uint256 price,
        Stage   stage,
        uint256 coOwnerCount,
        uint256 coOwnerApprovals,
        bool    coOwnersComplete,
        bytes32 offChainRef
    ) {
        Proposal storage p = proposals[proposalId];
        return (
            p.landId,
            p.seller,
            p.buyer,
            p.price,
            p.stage,
            p.coOwnerCount,
            p.coOwnerApprovals,
            p.coOwnersComplete,
            p.offChainRef
        );
    }

    function getCoOwners(bytes32 landId)
        external view returns (address[] memory)
    {
        return landCoOwners[landId];
    }

    function getProposalCoOwners(uint256 proposalId)
        external view returns (address[] memory)
    {
        return proposalCoOwners[proposalId];
    }

    // ─── Internal ────────────────────────────────────────────────────

    function _isProposalCoOwner(uint256 proposalId, address addr)
        internal view returns (bool)
    {
        address[] storage list = proposalCoOwners[proposalId];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == addr) return true;
        }
        return false;
    }
}