/**
 * @file queue.js
 * @description This file defines background jobs and schedulers for asynchronous operations.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

const { Queue } = require('bullmq');
const redis = require('../config/redis');

exports.verifyQueue = new Queue('verify', { connection: redis });