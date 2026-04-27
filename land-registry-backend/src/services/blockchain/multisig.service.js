// src/services/blockchain/multisig.service.js
const { getContractByName, getSigner } = require('./contract.service');
const logger = require('../../utils/logger');

/**
 * Submit a freeze/unfreeze proposal via OfficerMultiSig.
 */
exports.submitProposal = async ({ tokenId, action, officerKey }) => {
  try {
    const signer   = await getSigner(officerKey);
    const contract = getContractByName('OfficerMultiSig', signer);
    if (!contract) return { txHash: 'not-deployed' };

    const tx      = await contract.submitProposal(tokenId, action);
    const receipt = await tx.wait();
    logger.info('Proposal submitted on-chain', { txHash: tx.hash, tokenId, action });
    return { txHash: tx.hash, receipt };
  } catch (err) {
    logger.error('submitProposal failed', { error: err.message });
    throw err;
  }
};

/**
 * Confirm a proposal (called by each officer).
 */
exports.confirmProposal = async ({ proposalId, officerKey }) => {
  try {
    const signer   = await getSigner(officerKey);
    const contract = getContractByName('OfficerMultiSig', signer);
    if (!contract) return { txHash: 'not-deployed' };

    const tx      = await contract.confirmProposal(proposalId);
    const receipt = await tx.wait();
    logger.info('Proposal confirmed on-chain', { txHash: tx.hash, proposalId });
    return { txHash: tx.hash, receipt };
  } catch (err) {
    logger.error('confirmProposal failed', { error: err.message });
    throw err;
  }
};

/**
 * Execute a proposal after enough confirmations.
 */
exports.executeProposal = async ({ proposalId, officerKey }) => {
  try {
    const signer   = await getSigner(officerKey);
    const contract = getContractByName('OfficerMultiSig', signer);
    if (!contract) return { txHash: 'not-deployed' };

    const tx      = await contract.executeProposal(proposalId);
    const receipt = await tx.wait();
    logger.info('Proposal executed on-chain', { txHash: tx.hash, proposalId });
    return { txHash: tx.hash, receipt };
  } catch (err) {
    logger.error('executeProposal failed', { error: err.message });
    throw err;
  }
};