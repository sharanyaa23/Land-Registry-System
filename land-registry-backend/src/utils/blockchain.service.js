/**
 * @file blockchain.service.js
 * @description Backend service for interacting with the Polygon blockchain via ethers.js.
 *
 *              WHAT IT DOES:
 *              - Connects to the Polygon Amoy Testnet RPC endpoint using ethers.JsonRpcProvider
 *              - Loads the deployed smart contract ABIs (LandRegistry.json, MultiSigTransfer.json)
 *              - Creates ethers.Contract instances that the backend can use to read on-chain data
 *              - The backend signer wallet (BACKEND_SIGNER_KEY) is used for server-side transactions
 *
 *              WHY TWO CONTRACTS?
 *              - LandRegistry.sol: Stores land ownership records on-chain (register, transfer)
 *              - MultiSigTransfer.sol: Handles multi-sig approval + escrow payments for transfers
 *
 *              IMPORTANT: The frontend also connects to these contracts directly via MetaMask.
 *              This service is for backend-initiated reads/writes (e.g., event listeners, admin ops).
 *
 * NOTE: This file is essential for the backend architecture.
 * It follows the Model-View-Controller (MVC) pattern.
 */

const { ethers } = require('ethers');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');

class BlockchainService {
  constructor() {
    this.provider = null;
    this.wallet = null;
    this.landRegistry = null;
    this.multiSigTransfer = null;
    this.isInitialized = false;
  }

  init() {
    try {
      const RPC_URL = process.env.AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology';
      // In dev, use a default dummy key if none provided
      const PRIVATE_KEY = process.env.BACKEND_SIGNER_KEY || '0x0000000000000000000000000000000000000000000000000000000000000001';

      this.provider = new ethers.JsonRpcProvider(RPC_URL);
      
      // Fallback private key check to prevent crashing if env var is incorrectly set
      const validKey = PRIVATE_KEY.length === 66 ? PRIVATE_KEY : '0x0000000000000000000000000000000000000000000000000000000000000001';
      this.wallet = new ethers.Wallet(validKey, this.provider);

      // Load ABIs
      const contractsDir = path.join(__dirname, '../contracts');
      
      // We gracefully handle missing ABIs so the backend doesn't crash if contracts aren't deployed yet
      if (fs.existsSync(path.join(contractsDir, 'LandRegistry.json'))) {
        const registryData = require(path.join(contractsDir, 'LandRegistry.json'));
        this.landRegistry = new ethers.Contract(registryData.address, registryData.abi, this.wallet);
      } else {
        logger.warn('LandRegistry ABI not found. Blockchain features disabled.');
      }

      if (fs.existsSync(path.join(contractsDir, 'MultiSigTransfer.json'))) {
        const multisigData = require(path.join(contractsDir, 'MultiSigTransfer.json'));
        this.multiSigTransfer = new ethers.Contract(multisigData.address, multisigData.abi, this.wallet);
      } else {
        logger.warn('MultiSigTransfer ABI not found. Blockchain features disabled.');
      }

      this.isInitialized = !!(this.landRegistry && this.multiSigTransfer);
      if (this.isInitialized) {
        logger.info(`Blockchain service initialized. Registry: ${this.landRegistry.target}`);
      }
    } catch (error) {
      logger.error('Failed to initialize blockchain service:', error);
    }
  }

  // Helper to generate bytes32 landId from MongoDB ObjectId
  getLandIdHash(mongoId) {
    return ethers.keccak256(ethers.toUtf8Bytes(mongoId.toString()));
  }

  // For read-only operations that don't cost gas
  async getLandOwner(mongoId) {
    if (!this.isInitialized) return null;
    try {
      const landId = this.getLandIdHash(mongoId);
      const [owner] = await this.landRegistry.getLand(landId);
      return owner;
    } catch (err) {
      logger.error(`Error reading land owner for ${mongoId}:`, err);
      return null;
    }
  }
}

// Export singleton instance
const blockchainService = new BlockchainService();
blockchainService.init();

module.exports = blockchainService;
