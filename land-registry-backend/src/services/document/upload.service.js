/**
 * @file upload.service.js
 * @description This service handles complex external integrations, background tasks, or specific business operations separate from the controller.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

exports.validateFile = (file) => {
  if (!file) throw new Error('File required');
  if (!file.mimetype.includes('pdf')) throw new Error('Only PDF allowed');
};