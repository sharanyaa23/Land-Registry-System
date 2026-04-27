// scripts/seedOfficers.js
// Run once after deployment to create officer User records in MongoDB.
// Usage: node scripts/seedOfficers.js

require("dotenv").config();
const mongoose = require("mongoose");

const officerAddresses = [
  { address: process.env.OFFICER1_ADDRESS, name: "Officer 1", index: 0 },
  { address: process.env.OFFICER2_ADDRESS, name: "Officer 2", index: 1 },
  { address: process.env.OFFICER3_ADDRESS, name: "Officer 3", index: 2 },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB\n");

  // Inline schema to avoid circular imports — use your actual User model in prod
  const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
    wallet:        { type: String, required: true, unique: true, lowercase: true },
    role:          { type: String, enum: ["buyer", "seller", "officer", "admin"], required: true },
    officerIndex:  Number,
    name:          String,
    createdAt:     { type: Date, default: Date.now }
  }));

  for (const o of officerAddresses) {
    if (!o.address) {
      console.warn(`⚠️  OFFICER${o.index + 1}_ADDRESS not set in .env — skipping`);
      continue;
    }

    const wallet = o.address.toLowerCase();
    const existing = await User.findOne({ wallet });

    if (existing) {
      console.log(` ${o.name} (${wallet}) already exists — skipping`);
      continue;
    }

    await User.create({
      wallet,
      role:         "officer",
      officerIndex: o.index,
      name:         o.name,
    });

    console.log(` Seeded ${o.name}: ${wallet}`);
  }

  console.log("\nDone. Officers can now log in via the admin portal.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(" Seed failed:", err.message);
  process.exit(1);
});