/**
 * @file dropdown.service.js
 * @description This service handles complex external integrations, background tasks, or specific business operations separate from the controller.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

// src/services/mahabhulekh/dropdown.service.js

const DropdownCache = require('../../models/DropdownCache.model');

class DropdownService {
  async getDropdown(type) {
    return await DropdownCache.find({ type });
  }

  async seedDropdown(type, data) {
    await DropdownCache.deleteMany({ type });

    const records = data.map(item => ({
      type,
      label: item.label,
      value: item.value
    }));

    return await DropdownCache.insertMany(records);
  }
}

module.exports = new DropdownService();