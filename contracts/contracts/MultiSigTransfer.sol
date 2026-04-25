// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MultiSigTransfer
 * @notice M-of-N multi-signature approval for land transfers.
 *         Co-owners must approve before a transfer can execute.
 *         Integrates with LandRegistry for final ownership change.
 */

interface ILandRegistry {
    function transferLand(bytes32 landId, address to, uint256 price, bytes32 txRef) external;
    function getLand(bytes32 landId) external view returns (address, string memory, uint256, bool);
}

contract MultiSigTransfer is ReentrancyGuard {

    // ─── Data Structures ────────────────────────────────────────────

    struct Proposal {
        bytes32 landId;
        address proposer;        // The buyer who initiated
        address newOwner;        // Who gets the land
        uint256 price;           // Sale price (informational)
        uint256 requiredApprovals;
        uint256 approvalCount;
        bool    executed;
        bool    cancelled;
        uint256 createdAt;
        bytes32 offChainRef;     // MongoDB transfer request ID hash
    }

    // ─── State ──────────────────────────────────────────────────────

    ILandRegistry public registry;

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasApproved;
    mapping(uint256 => address[]) public proposalApprovers; // Who can approve

    // Per-land co-owner registry
    mapping(bytes32 => address[]) public landCoOwners;
    mapping(bytes32 => mapping(address => bool)) public isCoOwner;

    // ─── Events ─────────────────────────────────────────────────────

    event CoOwnersSet(bytes32 indexed landId, address[] coOwners);
    event ProposalCreated(uint256 indexed proposalId, bytes32 indexed landId, address proposer, address newOwner, uint256 required);
    event ProposalApproved(uint256 indexed proposalId, address indexed approver, uint256 currentApprovals, uint256 required);
    event ProposalExecuted(uint256 indexed proposalId, bytes32 indexed landId, address newOwner);
    event ProposalCancelled(uint256 indexed proposalId);

    // ─── Constructor ────────────────────────────────────────────────

    constructor(address _registry) {
        require(_registry != address(0), "Invalid registry");
        registry = ILandRegistry(_registry);
    }

    // ─── Co-Owner Management ────────────────────────────────────────

    /**
     * @notice Set co-owners for a land parcel. Only the land owner can call this.
     * @param landId      The land ID
     * @param coOwners    Array of co-owner addresses
     */
    function setCoOwners(bytes32 landId, address[] calldata coOwners) external {
        (address landOwner,,, bool exists) = registry.getLand(landId);
        require(exists, "Land not registered");
        require(landOwner == msg.sender, "Only land owner");

        // Clear old co-owners
        address[] storage old = landCoOwners[landId];
        for (uint256 i = 0; i < old.length; i++) {
            isCoOwner[landId][old[i]] = false;
        }
        delete landCoOwners[landId];

        // Set new co-owners
        for (uint256 i = 0; i < coOwners.length; i++) {
            require(coOwners[i] != address(0), "Invalid co-owner");
            landCoOwners[landId].push(coOwners[i]);
            isCoOwner[landId][coOwners[i]] = true;
        }

        emit CoOwnersSet(landId, coOwners);
    }

    // ─── Proposal Lifecycle ─────────────────────────────────────────

    /**
     * @notice Create a transfer proposal. The buyer must send the exact price in POL.
     *         The land owner + all co-owners must approve.
     */
    function proposeTransfer(
        bytes32 landId,
        address newOwner,
        uint256 price,
        bytes32 offChainRef
    ) external payable returns (uint256) {
        require(msg.value == price, "Must send exact price in POL");
        (address landOwner,,, bool exists) = registry.getLand(landId);
        require(exists, "Land not registered");
        require(newOwner != address(0), "Invalid new owner");

        uint256 coOwnerCount = landCoOwners[landId].length;
        // Required: owner + all co-owners
        uint256 required = coOwnerCount + 1;

        uint256 id = proposalCount++;
        proposals[id] = Proposal({
            landId: landId,
            proposer: msg.sender,
            newOwner: newOwner,
            price: price,
            requiredApprovals: required,
            approvalCount: 0,
            executed: false,
            cancelled: false,
            createdAt: block.timestamp,
            offChainRef: offChainRef
        });

        // Set approvers: owner + co-owners
        proposalApprovers[id].push(landOwner);
        for (uint256 i = 0; i < coOwnerCount; i++) {
            proposalApprovers[id].push(landCoOwners[landId][i]);
        }

        emit ProposalCreated(id, landId, msg.sender, newOwner, required);
        return id;
    }

    /**
     * @notice Approve a transfer proposal. Must be an authorized approver.
     */
    function approveTransfer(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(!p.executed, "Already executed");
        require(!p.cancelled, "Cancelled");
        require(_isApprover(proposalId, msg.sender), "Not an approver");
        require(!hasApproved[proposalId][msg.sender], "Already approved");

        hasApproved[proposalId][msg.sender] = true;
        p.approvalCount++;

        emit ProposalApproved(proposalId, msg.sender, p.approvalCount, p.requiredApprovals);
    }

    /**
     * @notice Execute the transfer after all required approvals.
     *         Transfers the held escrow funds to the seller.
     */
    function executeTransfer(uint256 proposalId) external nonReentrant {
        Proposal storage p = proposals[proposalId];
        require(!p.executed, "Already executed");
        require(!p.cancelled, "Cancelled");
        require(p.approvalCount >= p.requiredApprovals, "Not enough approvals");

        p.executed = true;

        (address landOwner,,,) = registry.getLand(p.landId);

        // Execute on the LandRegistry contract
        registry.transferLand(p.landId, p.newOwner, p.price, p.offChainRef);

        // Release funds to the seller
        if (p.price > 0) {
            (bool success, ) = payable(landOwner).call{value: p.price}("");
            require(success, "Transfer failed");
        }

        emit ProposalExecuted(proposalId, p.landId, p.newOwner);
    }

    /**
     * @notice Cancel a proposal and refund the buyer.
     */
    function cancelProposal(uint256 proposalId) external nonReentrant {
        Proposal storage p = proposals[proposalId];
        require(!p.executed, "Already executed");
        require(!p.cancelled, "Already cancelled");

        (address landOwner,,,) = registry.getLand(p.landId);
        require(msg.sender == p.proposer || msg.sender == landOwner, "Not authorized to cancel");

        p.cancelled = true;

        // Refund the buyer
        if (p.price > 0) {
            (bool success, ) = payable(p.proposer).call{value: p.price}("");
            require(success, "Refund failed");
        }

        emit ProposalCancelled(proposalId);
    }

    // ─── View Functions ─────────────────────────────────────────────

    function getProposal(uint256 proposalId) external view returns (
        bytes32 landId, address proposer, address newOwner,
        uint256 price, uint256 required, uint256 approvals,
        bool executed, bool cancelled
    ) {
        Proposal storage p = proposals[proposalId];
        return (p.landId, p.proposer, p.newOwner, p.price,
                p.requiredApprovals, p.approvalCount, p.executed, p.cancelled);
    }

    function getCoOwners(bytes32 landId) external view returns (address[] memory) {
        return landCoOwners[landId];
    }

    function getApprovers(uint256 proposalId) external view returns (address[] memory) {
        return proposalApprovers[proposalId];
    }

    // ─── Internal ───────────────────────────────────────────────────

    function _isApprover(uint256 proposalId, address addr) internal view returns (bool) {
        address[] storage approvers = proposalApprovers[proposalId];
        for (uint256 i = 0; i < approvers.length; i++) {
            if (approvers[i] == addr) return true;
        }
        return false;
    }
}
