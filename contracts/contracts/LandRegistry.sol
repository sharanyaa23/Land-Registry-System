// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LandRegistry
 * @notice On-chain land registration and ownership tracking for DLR.
 *         Each land is identified by a bytes32 hash of its MongoDB ObjectId.
 *         Full metadata is stored off-chain (IPFS + MongoDB), only ownership
 *         and audit trail live on-chain.
 */
contract LandRegistry is Ownable, ReentrancyGuard {

    // ─── Data Structures ────────────────────────────────────────────

    struct Land {
        address owner;
        string  ipfsMetadataCID;   // Full land record pinned on IPFS
        uint256 registeredAt;
        bool    exists;
    }

    struct TransferRecord {
        address from;
        address to;
        uint256 price;
        uint256 timestamp;
        bytes32 txRef;             // Off-chain transfer request ID hash
    }

    // ─── State ──────────────────────────────────────────────────────

    mapping(bytes32 => Land) public lands;
    mapping(bytes32 => TransferRecord[]) public transferHistory;
    mapping(address => bytes32[]) public ownerLands;

    uint256 public totalLands;

    // ─── Events ─────────────────────────────────────────────────────

    event LandRegistered(
        bytes32 indexed landId,
        address indexed owner,
        string  ipfsCID,
        uint256 timestamp
    );

    event LandTransferred(
        bytes32 indexed landId,
        address indexed from,
        address indexed to,
        uint256 price,
        bytes32 txRef
    );

    event MetadataUpdated(
        bytes32 indexed landId,
        string  newIpfsCID
    );

    // ─── Constructor ────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─── Registration ───────────────────────────────────────────────

    /**
     * @notice Register a new land parcel on-chain.
     * @param landId     keccak256 hash of the MongoDB land _id
     * @param ipfsCID    IPFS CID pointing to the full metadata JSON
     */
    function registerLand(bytes32 landId, string calldata ipfsCID) external {
        require(!lands[landId].exists, "Land already registered");
        require(bytes(ipfsCID).length > 0, "IPFS CID required");

        lands[landId] = Land({
            owner: msg.sender,
            ipfsMetadataCID: ipfsCID,
            registeredAt: block.timestamp,
            exists: true
        });

        ownerLands[msg.sender].push(landId);
        totalLands++;

        emit LandRegistered(landId, msg.sender, ipfsCID, block.timestamp);
    }

    // ─── Transfer (direct — no multi-sig) ───────────────────────────

    /**
     * @notice Transfer land ownership directly. For multi-sig transfers,
     *         use MultiSigTransfer contract which calls this via approval.
     * @param landId    The land to transfer
     * @param to        New owner address
     * @param price     Sale price in wei (0 for gift/inheritance)
     * @param txRef     Off-chain transfer request ID hash for audit
     */
    function transferLand(
        bytes32 landId,
        address to,
        uint256 price,
        bytes32 txRef
    ) external nonReentrant {
        Land storage land = lands[landId];
        require(land.exists, "Land not registered");
        require(land.owner == msg.sender || msg.sender == owner(), "Not authorized");
        require(to != address(0), "Invalid recipient");
        require(to != land.owner, "Already the owner");

        // Record history
        transferHistory[landId].push(TransferRecord({
            from: land.owner,
            to: to,
            price: price,
            timestamp: block.timestamp,
            txRef: txRef
        }));

        // Update ownership
        address previousOwner = land.owner;
        land.owner = to;
        ownerLands[to].push(landId);

        // Remove from previous owner's list
        _removeFromOwnerList(previousOwner, landId);

        emit LandTransferred(landId, previousOwner, to, price, txRef);
    }

    // ─── Metadata Update ────────────────────────────────────────────

    /**
     * @notice Update IPFS metadata CID (e.g. after verification).
     */
    function updateMetadata(bytes32 landId, string calldata newIpfsCID) external {
        require(lands[landId].exists, "Land not registered");
        require(lands[landId].owner == msg.sender || msg.sender == owner(), "Not authorized");

        lands[landId].ipfsMetadataCID = newIpfsCID;
        emit MetadataUpdated(landId, newIpfsCID);
    }

    // ─── View Functions ─────────────────────────────────────────────

    function getLand(bytes32 landId) external view returns (
        address _owner,
        string memory _ipfsCID,
        uint256 _registeredAt,
        bool _exists
    ) {
        Land storage l = lands[landId];
        return (l.owner, l.ipfsMetadataCID, l.registeredAt, l.exists);
    }

    function getTransferCount(bytes32 landId) external view returns (uint256) {
        return transferHistory[landId].length;
    }

    function getTransferAt(bytes32 landId, uint256 index) external view returns (
        address from, address to, uint256 price, uint256 timestamp, bytes32 txRef
    ) {
        TransferRecord storage r = transferHistory[landId][index];
        return (r.from, r.to, r.price, r.timestamp, r.txRef);
    }

    function getOwnerLandCount(address _owner) external view returns (uint256) {
        return ownerLands[_owner].length;
    }

    // ─── Internal ───────────────────────────────────────────────────

    function _removeFromOwnerList(address _owner, bytes32 landId) internal {
        bytes32[] storage list = ownerLands[_owner];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == landId) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
    }
}
