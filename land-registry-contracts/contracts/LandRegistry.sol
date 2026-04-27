// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LandRegistry
 * @notice On-chain land registration and ownership tracking for DLR.
 *
 * Key changes from v1:
 *  - onlyRegistrar: land owners must be approved as registrars by admin
 *    before they can call registerLand (mirrors off-chain officer approval)
 *  - frozen flag: land is frozen on transfer rejection, cleared by officer
 *  - transferLand: restricted to MultiSigTransfer contract only
 *  - metadataHistory: every CID update is archived, never lost
 */
contract LandRegistry is Ownable, ReentrancyGuard {

    // ─── Data Structures ────────────────────────────────────────────

    struct Land {
        address owner;
        string  ipfsMetadataCID;
        uint256 registeredAt;
        bool    exists;
        bool    frozen;            // true after officer rejection
        string  freezeReason;
    }

    struct TransferRecord {
        address from;
        address to;
        uint256 price;
        uint256 timestamp;
        bytes32 txRef;
    }

    // ─── State ──────────────────────────────────────────────────────

    mapping(bytes32 => Land)               public lands;
    mapping(bytes32 => TransferRecord[])   public transferHistory;
    mapping(bytes32 => string[])           public metadataHistory; // archived CIDs
    mapping(address => bytes32[])          public ownerLands;

    // Registrar whitelist — approved by admin after off-chain officer approval
    mapping(address => bool) public isRegistrar;

    // Authorized contract that can call transferLand
    address public transferContract;

    // Authorized contract that can freeze/unfreeze land
    address public officerMultiSig;

    uint256 public totalLands;

    // ─── Events ─────────────────────────────────────────────────────

    event RegistrarAdded(address indexed wallet);
    event RegistrarRemoved(address indexed wallet);

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
        string  oldCID,
        string  newCID
    );

    event LandFrozen(
        bytes32 indexed landId,
        string  reason,
        uint256 timestamp
    );

    event LandUnfrozen(
        bytes32 indexed landId,
        uint256 timestamp
    );

    // ─── Modifiers ──────────────────────────────────────────────────

    modifier onlyRegistrar() {
        require(
            isRegistrar[msg.sender],
            "LandRegistry: caller is not an approved registrar"
        );
        _;
    }

    modifier onlyTransferContract() {
        require(
            msg.sender == transferContract,
            "LandRegistry: caller is not the transfer contract"
        );
        _;
    }

    modifier onlyOfficerMultiSig() {
        require(
            msg.sender == officerMultiSig,
            "LandRegistry: caller is not OfficerMultiSig"
        );
        _;
    }

    modifier landExists(bytes32 landId) {
        require(lands[landId].exists, "LandRegistry: land not registered");
        _;
    }

    modifier notFrozen(bytes32 landId) {
        require(!lands[landId].frozen, "LandRegistry: land is frozen");
        _;
    }

    // ─── Constructor ────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─── Admin Setup ────────────────────────────────────────────────

    /**
     * @notice Set the MultiSigTransfer contract address.
     *         Only callable once — prevents accidental re-pointing.
     */
    function setTransferContract(address _transfer) external onlyOwner {
        require(_transfer != address(0),    "Invalid address");
        require(transferContract == address(0), "Already set");
        transferContract = _transfer;
    }

    /**
     * @notice Set the OfficerMultiSig contract address.
     */
    function setOfficerMultiSig(address _officerMultiSig) external onlyOwner {
        require(_officerMultiSig != address(0), "Invalid address");
        require(officerMultiSig == address(0),  "Already set");
        officerMultiSig = _officerMultiSig;
    }

    // ─── Registrar Management ────────────────────────────────────────

    /**
     * @notice Approve a wallet to register land.
     *         Called by admin after officer verifies the land owner off-chain.
     */
    function addRegistrar(address wallet) external onlyOwner {
        require(wallet != address(0), "Invalid wallet");
        isRegistrar[wallet] = true;
        emit RegistrarAdded(wallet);
    }

    /**
     * @notice Revoke registrar access.
     */
    function removeRegistrar(address wallet) external onlyOwner {
        isRegistrar[wallet] = false;
        emit RegistrarRemoved(wallet);
    }

    // ─── Registration ───────────────────────────────────────────────

    /**
     * @notice Register a new land parcel on-chain.
     *         Caller must be an approved registrar (land owner).
     * @param landId   keccak256 hash of the MongoDB land _id
     * @param ipfsCID  IPFS CID pointing to the full metadata JSON
     */
function registerLand(bytes32 landId, string calldata ipfsCID, address landOwner)
    external
    onlyRegistrar
{
    require(!lands[landId].exists,     "LandRegistry: already registered");
    require(bytes(ipfsCID).length > 0, "LandRegistry: IPFS CID required");
    require(landOwner != address(0),   "LandRegistry: invalid owner");

    lands[landId] = Land({
        owner:           landOwner,   // ✅ actual seller wallet
        ipfsMetadataCID: ipfsCID,
        registeredAt:    block.timestamp,
        exists:          true,
        frozen:          false,
        freezeReason:    ""
    });

    ownerLands[landOwner].push(landId);
    totalLands++;

    emit LandRegistered(landId, landOwner, ipfsCID, block.timestamp);
}
    // ─── Transfer (MultiSigTransfer contract only) ───────────────────

    /**
     * @notice Transfer land ownership.
     *         ONLY callable by the MultiSigTransfer contract after
     *         all approvals (co-owners + 2-of-3 officers) are collected.
     */
    function transferLand(
        bytes32 landId,
        address to,
        uint256 price,
        bytes32 txRef
    )
        external
        nonReentrant
        onlyTransferContract
        landExists(landId)
        notFrozen(landId)
    {
        Land storage land = lands[landId];
        require(to != address(0),    "LandRegistry: invalid recipient");
        require(to != land.owner,    "LandRegistry: already the owner");

        address previousOwner = land.owner;

        // Archive transfer
        transferHistory[landId].push(TransferRecord({
            from:      previousOwner,
            to:        to,
            price:     price,
            timestamp: block.timestamp,
            txRef:     txRef
        }));

        // Update ownership
        land.owner = to;
        ownerLands[to].push(landId);
        _removeFromOwnerList(previousOwner, landId);

        emit LandTransferred(landId, previousOwner, to, price, txRef);
    }

    // ─── Freeze / Unfreeze (OfficerMultiSig only) ────────────────────

    /**
     * @notice Freeze a land parcel after officer rejection.
     *         Land cannot be transferred while frozen.
     */
    function freezeLand(bytes32 landId, string calldata reason)
        external
        onlyOfficerMultiSig
        landExists(landId)
    {
        require(!lands[landId].frozen, "LandRegistry: already frozen");
        lands[landId].frozen      = true;
        lands[landId].freezeReason = reason;
        emit LandFrozen(landId, reason, block.timestamp);
    }

    /**
     * @notice Unfreeze a land parcel — officer has resolved the issue.
     */
    function unfreezeLand(bytes32 landId)
        external
        onlyOfficerMultiSig
        landExists(landId)
    {
        require(lands[landId].frozen, "LandRegistry: not frozen");
        lands[landId].frozen      = false;
        lands[landId].freezeReason = "";
        emit LandUnfrozen(landId, block.timestamp);
    }

    // ─── Metadata Update ─────────────────────────────────────────────

    /**
     * @notice Update IPFS metadata CID. Old CID is archived in history.
     *         Callable by land owner or admin.
     */
    function updateMetadata(bytes32 landId, string calldata newIpfsCID)
        external
        landExists(landId)
    {
        Land storage land = lands[landId];
        require(
            land.owner == msg.sender || msg.sender == owner(),
            "LandRegistry: not authorized"
        );
        require(bytes(newIpfsCID).length > 0, "LandRegistry: CID required");

        string memory oldCID = land.ipfsMetadataCID;
        metadataHistory[landId].push(oldCID); // archive before overwriting
        land.ipfsMetadataCID = newIpfsCID;

        emit MetadataUpdated(landId, oldCID, newIpfsCID);
    }

    // ─── View Functions ──────────────────────────────────────────────

    function getLand(bytes32 landId) external view returns (
        address _owner,
        string memory _ipfsCID,
        uint256 _registeredAt,
        bool    _exists,
        bool    _frozen,
        string memory _freezeReason
    ) {
        Land storage l = lands[landId];
        return (
            l.owner,
            l.ipfsMetadataCID,
            l.registeredAt,
            l.exists,
            l.frozen,
            l.freezeReason
        );
    }

    function getTransferHistory(bytes32 landId)
        external view returns (TransferRecord[] memory)
    {
        return transferHistory[landId];
    }

    function getMetadataHistory(bytes32 landId)
        external view returns (string[] memory)
    {
        return metadataHistory[landId];
    }

    function getOwnerLands(address _owner)
        external view returns (bytes32[] memory)
    {
        return ownerLands[_owner];
    }

    function getTransferCount(bytes32 landId) external view returns (uint256) {
        return transferHistory[landId].length;
    }

    // ─── Internal ────────────────────────────────────────────────────

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