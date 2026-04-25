require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User.model');
const Land = require('./src/models/Land.model');
const TransferRequest = require('./src/models/TransferRequest.model');
const OfficerCase = require('./src/models/OfficerCase.model');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  // Create fake users
  const seller = await User.findOneAndUpdate(
    { walletAddress: '0x1111111111111111111111111111111111111111' },
    { role: 'seller', profile: { fullName: 'Ramesh Patil' } },
    { upsert: true, new: true }
  );

  const buyer = await User.findOneAndUpdate(
    { walletAddress: '0x2222222222222222222222222222222222222222' },
    { role: 'buyer', profile: { fullName: 'Suresh Kumar' } },
    { upsert: true, new: true }
  );

  // Instead of creating new ones if the user is testing with their own wallet, we can also link to the user's wallet
  // The user's wallet is 0x3538810e8d9b5789b5a6cf5df7cc06a8504b4512 (Officer)
  // Let's create an offer for a Land owned by the seller, so the buyer can see it

  const land1 = await Land.findOneAndUpdate(
    { 'location.surveyNumber': '101/A' },
    {
      owner: seller._id,
      status: 'registered',
      location: { district: 'Pune', taluka: 'Haveli', village: 'Kharadi', surveyNumber: '101/A' },
      area: { value: 1.5, unit: 'hectare' }
    },
    { upsert: true, new: true }
  );

  const land2 = await Land.findOneAndUpdate(
    { 'location.surveyNumber': '202/B' },
    {
      owner: seller._id,
      status: 'officer_review',
      location: { district: 'Pune', taluka: 'Haveli', village: 'Wagholi', surveyNumber: '202/B' },
      area: { value: 3.2, unit: 'hectare' }
    },
    { upsert: true, new: true }
  );

  await OfficerCase.findOneAndUpdate(
    { land: land2._id },
    {
      type: 'verification_review',
      status: 'queued',
      escalationReason: 'ocr_low_confidence',
      ocrData: { confidence: 45, district: 'Pne', surveyNumber: '202/8' },
      sellerData: { district: 'Pune', surveyNumber: '202/B', ownerName: 'Ramesh Patil' },
      land: land2._id
    },
    { upsert: true, new: true }
  );

  await TransferRequest.findOneAndUpdate(
    { land: land1._id, buyer: buyer._id },
    {
      seller: seller._id,
      status: 'offer_sent',
      price: { amount: 500, currency: 'POL' }
    },
    { upsert: true, new: true }
  );

  console.log('✅ Seeded database with dynamic Use Case data!');
  process.exit(0);
}

seed().catch(console.error);
