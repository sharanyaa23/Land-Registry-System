/**
 * @file DropdownCache.model.js
 * @description This model defines the MongoDB schema and database structure for the application.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  label: String,
  value: String
});

module.exports = mongoose.model('DropdownCache', schema);