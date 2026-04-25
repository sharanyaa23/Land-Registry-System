/**
 * @file database.js
 * @description This configuration file sets up environment variables, database connections, and external service credentials.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

const mongoose = require('mongoose');
const { MONGO_URI } = require('./index');

exports.connectDB = async () => {
  await mongoose.connect(MONGO_URI);
  console.log('MongoDB connected');
};