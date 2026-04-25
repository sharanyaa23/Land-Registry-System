/**
 * @file asyncHandler.js
 * @description This utility file contains reusable helper functions used across the application.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

/**
 * Wraps async route handlers to automatically catch errors
 * and forward them to Express error handler middleware.
 */
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
