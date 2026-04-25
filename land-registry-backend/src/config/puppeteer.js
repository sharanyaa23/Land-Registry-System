/**
 * @file puppeteer.js
 * @description This configuration file sets up environment variables, database connections, and external service credentials.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

const puppeteer = require('puppeteer');

exports.launchBrowser = () =>
  puppeteer.launch({ headless: 'new' });