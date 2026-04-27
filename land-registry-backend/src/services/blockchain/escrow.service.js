// src/services/blockchain/escrow.service.js
const { getContractByName, getSigner } = require('./contract.service');
const { ethers } = require('ethers');
const logger = require('../../utils/logger');

/**
 * Buyer locks funds by calling proposeTransfer() on MultiSigTransfer.
 * Now supports MetaMask signer (no private key needed for local testing).
 */
exports.lockFunds = async ({ landIdBytes32, offChainRef, amountWei, signer }) => {
  try {
    const activeSigner = signer || (await getSigner());

    const contract = getContractByName('MultiSigTransfer', activeSigner);

    if (!contract) {
      logger.warn('MultiSigTransfer contract not available');
      return { txHash: 'not-deployed', proposalId: null };
    }

    // ✅ amountWei must already be in wei (a string like "1000000000000000000" for 1 POL)
    // Do NOT call parseEther here — that would double-convert
    const valueInWei = BigInt(amountWei.toString());

    logger.info('proposeTransfer params', {
      landIdBytes32,
      offChainRef,
      valueInWei: valueInWei.toString()
    });

    const tx = await contract.proposeTransfer(
      landIdBytes32,
      offChainRef,
      { value: valueInWei } // ✅ raw wei BigInt
    );

    const receipt = await tx.wait();

    // Extract proposalId from ProposalCreated event
    const event = receipt.logs
      .map(log => {
        try { return contract.interface.parseLog(log); }
        catch { return null; }
      })
      .find(e => e && e.name === 'ProposalCreated');

    const proposalId = event ? event.args.proposalId.toString() : null;

    logger.info('Funds locked via proposeTransfer', {
      txHash: tx.hash,
      proposalId,
      valueInWei: valueInWei.toString()
    });

    return { txHash: tx.hash, receipt, proposalId };
  } catch (err) {
    logger.error('lockFunds failed', { error: err.message, stack: err.stack });
    throw new Error(`On-chain lock failed: ${err.message}`);
  }
};

/**
 * Seller submits proposal to officer review.
 */
exports.submitToOfficers = async ({ proposalId, offChainCaseRef, sellerWallet }) => {
  try {
    let signer;

    if (process.env.BLOCKCHAIN_NETWORK === 'local') {
      // On local — find the Hardhat signer that matches the seller's wallet
      const provider = exports.getProvider ? exports.getProvider() : require('./contract.service').getProvider();
      const accounts = await provider.listAccounts();
      
      const matchIndex = accounts.findIndex(
        acc => acc.address.toLowerCase() === sellerWallet?.toLowerCase()
      );

      if (matchIndex === -1) {
        throw new Error(`No local signer found for seller wallet: ${sellerWallet}`);
      }

      signer = await provider.getSigner(matchIndex);
    } else {
      signer = await getSigner(process.env.SELLER_PRIVATE_KEY);
    }

    console.log('submitToOfficers signer:', await signer.getAddress());

    const contract = getContractByName('MultiSigTransfer', signer);
    if (!contract) return { txHash: 'not-deployed' };

    const tx      = await contract.submitToOfficers(proposalId, offChainCaseRef);
    const receipt = await tx.wait();

    const event = receipt.logs
      .map(log => { try { return contract.interface.parseLog(log); } catch { return null; } })
      .find(e => e && e.name === 'SubmittedToOfficers');

    const reviewId = event ? event.args.reviewId?.toString() : null;

    logger.info('Submitted to officers on-chain', { txHash: tx.hash, proposalId, reviewId });
    return { txHash: tx.hash, receipt, reviewId };
  } catch (err) {
    logger.error('submitToOfficers failed', { error: err.message });
    throw new Error(`On-chain submit failed: ${err.message}`);
  }
};
/**
 * Co-owner approves on-chain (optional - if you want on-chain co-owner approval later)
 */
exports.coOwnerApproveOnChain = async ({ proposalId, signer }) => {
  try {
    const activeSigner = signer || (await getSigner());

    const contract = getContractByName('MultiSigTransfer', activeSigner);
    if (!contract) return { txHash: 'not-deployed' };

    const tx = await contract.approveCoOwner(proposalId);
    const receipt = await tx.wait();

    logger.info('Co-owner approved on-chain', { txHash: tx.hash, proposalId });
    return { txHash: tx.hash, receipt };
  } catch (err) {
    logger.error('coOwnerApproveOnChain failed', { error: err.message });
    throw err;
  }
};

/**
 * Officer approves on-chain (kept privateKey support for officers)
 */
exports.officerApproveOnChain = async ({ reviewId, officerPrivateKey }) => {
  try {
    const signer = officerPrivateKey 
      ? await getSigner(officerPrivateKey) 
      : await getSigner(); // fallback

    const contract = getContractByName('OfficerMultiSig', signer);
    if (!contract) return { txHash: 'not-deployed' };

    const tx = await contract.approve(reviewId);
    const receipt = await tx.wait();

    logger.info('Officer approved on-chain', { txHash: tx.hash, reviewId });
    return { txHash: tx.hash, receipt };
  } catch (err) {
    logger.error('officerApproveOnChain failed', { error: err.message });
    throw err;
  }
};

/**
 * Officer rejects on-chain
 */
exports.officerRejectOnChain = async ({ reviewId, reason, officerPrivateKey }) => {
  try {
    const signer = officerPrivateKey 
      ? await getSigner(officerPrivateKey) 
      : await getSigner();

    const contract = getContractByName('OfficerMultiSig', signer);
    if (!contract) return { txHash: 'not-deployed' };

    const tx = await contract.reject(reviewId, reason);
    const receipt = await tx.wait();

    logger.info('Officer rejected on-chain', { txHash: tx.hash, reviewId });
    return { txHash: tx.hash, receipt };
  } catch (err) {
    logger.error('officerRejectOnChain failed', { error: err.message });
    throw err;
  }
};

/**
 * Get proposal state
 */
exports.getProposal = async (proposalId) => {
  try {
    const contract = getContractByName('MultiSigTransfer');
    if (!contract) return null;
    return await contract.getProposal(proposalId);
  } catch (err) {
    logger.error('getProposal failed', { error: err.message });
    return null;
  }
};