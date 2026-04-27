// src/services/blockchain/contract.service.js
// Creates ethers.js contract instances using local artifacts + addresses

require('dns').setDefaultResultOrder('ipv4first');
const { ethers } = require('ethers');
const logger     = require('../../utils/logger');
const { getAddresses, getArtifact, IS_LOCAL } = require('../../config/blockchain');

const RPC_URL = IS_LOCAL
  ? 'http://127.0.0.1:8545'
  : (process.env.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology');

let provider;

exports.getProvider = () => {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_URL);
  }
  return provider;
};

/**
 * Get a contract instance by name.
 * Automatically resolves ABI from compiled artifacts and address from local.json / env.
 *
 * @param {'LandRegistry'|'MultiSigTransfer'|'OfficerMultiSig'} contractName
 * @param {ethers.Signer} [signer]
 */
exports.getContractByName = (contractName, signer = null) => {
  try {
    const addresses = getAddresses();
    const address   = addresses[contractName];

    if (!address) {
      logger.warn(`No address found for ${contractName}`);
      return null;
    }

    const artifact = getArtifact(contractName);
    const abi      = artifact.abi;

    if (!abi || abi.length === 0) {
      logger.warn(`ABI is empty for ${contractName}`);
      return null;
    }

    const prov = exports.getProvider();
    return new ethers.Contract(address, abi, signer || prov);
  } catch (err) {
    logger.error(`Failed to load contract ${contractName}`, { error: err.message });
    return null;
  }
};

/**
 * Legacy: get contract by ABI path and address (for backward compat)
 */
exports.getContract = (abiPath, address, signer = null) => {
  try {
    const abi  = require(abiPath);
    const prov = exports.getProvider();
    return new ethers.Contract(address, abi, signer || prov);
  } catch (err) {
    logger.error('Failed to load contract', { abiPath, error: err.message });
    return null;
  }
};

/**
 * Get a deployer signer from private key, or first local account.
 */
exports.getSigner = async (privateKey) => {
  const prov = exports.getProvider();
  if (IS_LOCAL && !privateKey) {
    // Use first test account from local hardhat node
    return await prov.getSigner(0);
  }
  return new ethers.Wallet(privateKey, prov);
};