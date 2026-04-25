/**
 * @file nonce.service.js
 * @description This service handles complex external integrations, background tasks, or specific business operations separate from the controller.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

const redis = require('../../config/redis');
const { randomHex } = require('../../utils/hashData');

const NONCE_TTL = 300; // 5 minutes

class NonceService {
  /**
   * Generate and store a nonce for a wallet address.
   * @param {string} walletAddress
   * @returns {string} nonce
   */
  async generate(walletAddress) {
    const nonce = randomHex(16);
    const key = `nonce:${walletAddress.toLowerCase()}`;
    await redis.set(key, nonce, 'EX', NONCE_TTL);
    return nonce;
  }

  /**
   * Retrieve and delete the nonce for a wallet (one-time use).
   * @param {string} walletAddress
   * @returns {string|null}
   */
  async consume(walletAddress) {
    const key = `nonce:${walletAddress.toLowerCase()}`;
    const nonce = await redis.get(key);
    if (nonce) {
      await redis.del(key);
    }
    return nonce;
  }
}

module.exports = new NonceService();
