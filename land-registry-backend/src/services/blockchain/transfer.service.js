// src/services/blockchain/transfer.service.js
const { getContractByName, getSigner } = require('./contract.service');
const logger = require('../../utils/logger');

/**
 * Initiate a land transfer on-chain.
 */
exports.initiateTransfer = async ({ tokenId, seller, buyer, price }) => {
  try {
    const signer   = await getSigner(process.env.DEPLOYER_PRIVATE_KEY);
    const contract = getContractByName('MultiSigTransfer', signer);

    if (!contract) {
      logger.warn('MultiSigTransfer not available — skipping');
      return { txHash: 'not-deployed' };
    }

    const tx      = await contract.initiateTransfer(tokenId, seller, buyer, price);
    const receipt = await tx.wait();
    logger.info('Transfer initiated on-chain', { txHash: tx.hash });
    return { txHash: tx.hash, receipt };
  } catch (err) {
    logger.error('initiateTransfer failed', { error: err.message });
    throw err;
  }
};

/**
 * Approve a transfer (called by each officer).
 */
exports.approveTransfer = async ({ transferId, signerKey }) => {
  try {
    const signer   = await getSigner(signerKey);
    const contract = getContractByName('MultiSigTransfer', signer);
    if (!contract) return { txHash: 'not-deployed' };

    const tx      = await contract.approveTransfer(transferId);
    const receipt = await tx.wait();
    logger.info('Transfer approved on-chain', { txHash: tx.hash, transferId });
    return { txHash: tx.hash, receipt };
  } catch (err) {
    logger.error('approveTransfer failed', { error: err.message });
    throw err;
  }
};

/**
 * Complete a transfer after all approvals.
 */
exports.completeTransfer = async ({ transferId }) => {
  try {
    const signer   = await getSigner(process.env.DEPLOYER_PRIVATE_KEY);
    const contract = getContractByName('MultiSigTransfer', signer);
    if (!contract) return { txHash: 'not-deployed' };

    const tx      = await contract.completeTransfer(transferId);
    const receipt = await tx.wait();
    logger.info('Transfer completed on-chain', { txHash: tx.hash });
    return { txHash: tx.hash, receipt };
  } catch (err) {
    logger.error('completeTransfer failed', { error: err.message });
    throw err;
  }
};

/**
 * Cancel a transfer proposal.
 */
exports.cancelTransfer = async ({ transferId }) => {
  try {
    const signer   = await getSigner(process.env.DEPLOYER_PRIVATE_KEY);
    const contract = getContractByName('MultiSigTransfer', signer);
    if (!contract) return { txHash: 'not-deployed' };

    const tx      = await contract.cancelProposal(transferId);
    const receipt = await tx.wait();
    logger.info('Transfer cancelled on-chain', { txHash: tx.hash });
    return { txHash: tx.hash, receipt };
  } catch (err) {
    logger.error('cancelTransfer failed', { error: err.message });
    throw err;
  }
};