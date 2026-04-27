// src/services/blockchain/land.service.js
const { getContractByName, getSigner } = require('./contract.service');
const { ethers } = require('ethers');
const logger = require('../../utils/logger');

/**
 * Convert MongoDB _id to bytes32 for contract calls.
 * MUST match what the Solidity contract expects: keccak256(utf8(mongoId))
 * Use this everywhere you need to pass landId to contracts.
 */
exports.toLandIdBytes32 = (mongoId) => {
  return ethers.keccak256(ethers.toUtf8Bytes(mongoId.toString()));
};

/**
 * Register a land asset on-chain.
 * LandRegistry.registerLand(bytes32 landId, string ipfsCID, address landOwner)
 * Caller must be an approved registrar (added by admin via addRegistrar).
 */
exports.registerLand = async ({ landMongoId, ipfsCID, ownerPrivateKey, sellerWallet }) => {
  try {
    const signer   = await getSigner(ownerPrivateKey);
    const contract = getContractByName('LandRegistry', signer);

    if (!contract) {
      logger.warn('LandRegistry not available — skipping on-chain registration');
      return { txHash: 'not-deployed', receipt: null };
    }

    // ✅ keccak256 — matches what Solidity docs say: "keccak256 hash of the MongoDB land _id"
    const landIdBytes32 = exports.toLandIdBytes32(landMongoId);

    const tx      = await contract.registerLand(landIdBytes32, ipfsCID, sellerWallet);
    const receipt = await tx.wait();

    logger.info('Land registered on-chain', { txHash: tx.hash, landMongoId, sellerWallet, landIdBytes32 });
    return { txHash: tx.hash, receipt, landIdBytes32 };
  } catch (err) {
    logger.error('registerLand failed', { error: err.message });
    throw err;
  }
};

/**
 * Get land data from chain.
 */
exports.getLand = async (mongoId) => {
  try {
    const contract = getContractByName('LandRegistry');
    if (!contract) return null;

    const landIdBytes32 = exports.toLandIdBytes32(mongoId);
    return await contract.getLand(landIdBytes32);
  } catch (err) {
    logger.error('getLand failed', { error: err.message });
    return null;
  }
};

/**
 * Add registrar — admin calls this after officer verifies land owner off-chain.
 */
exports.addRegistrar = async (walletAddress) => {
  try {
    const signer   = await getSigner(process.env.DEPLOYER_PRIVATE_KEY);
    const contract = getContractByName('LandRegistry', signer);
    if (!contract) return { txHash: 'not-deployed' };

    const tx      = await contract.addRegistrar(walletAddress);
    const receipt = await tx.wait();
    logger.info('Registrar added', { walletAddress, txHash: tx.hash });
    return { txHash: tx.hash, receipt };
  } catch (err) {
    logger.error('addRegistrar failed', { error: err.message });
    throw err;
  }
};

/**
 * Freeze land — called by officer service, not directly by controller.
 */
exports.freezeLand = async (landIdBytes32, reason) => {
  try {
    const signer   = await getSigner(process.env.DEPLOYER_PRIVATE_KEY);
    const contract = getContractByName('OfficerMultiSig', signer);
    if (!contract) return { txHash: 'not-deployed' };

    const tx      = await contract.freezeLand(landIdBytes32, reason ?? ''); // ✅ correct method
    const receipt = await tx.wait();
    logger.info('Land frozen', { txHash: tx.hash, landIdBytes32, reason });
    return { txHash: tx.hash, receipt };
  } catch (err) {
    logger.error('freezeLand failed', { error: err.message });
    throw err;
  }
};

/**
 * Unfreeze land — officer resolves dispute.
 */
exports.unfreezeLand = async (landIdBytes32) => {
  try {
    const signer   = await getSigner(process.env.DEPLOYER_PRIVATE_KEY);
    const contract = getContractByName('OfficerMultiSig', signer);
    if (!contract) return { txHash: 'not-deployed' };

    const tx      = await contract.clearFreeze(landIdBytes32);
    const receipt = await tx.wait();
    logger.info('Land unfrozen', { txHash: tx.hash });
    return { txHash: tx.hash, receipt };
  } catch (err) {
    logger.error('unfreezeLand failed', { error: err.message });
    throw err;
  }
};