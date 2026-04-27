// scripts/setRegistrar.js
// Grants registrar access to a wallet so they can call registerLand().
// Usage: node scripts/setRegistrar.js <walletAddress>
// Run after officer has approved the land owner off-chain.

require("dotenv").config();
const { ethers } = require("ethers");
const addresses  = require("../contracts/addresses/testnet.json");
const abi        = require("../contracts/abis/LandRegistry.json");

async function main() {
  const wallet = process.argv[2];
  if (!wallet || !ethers.isAddress(wallet)) {
    console.error("Usage: node scripts/setRegistrar.js <walletAddress>");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(
    process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology"
  );
  const signer   = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const registry = new ethers.Contract(addresses.LandRegistry, abi, signer);

  const already = await registry.isRegistrar(wallet);
  if (already) {
    console.log(`⚠️  ${wallet} is already a registrar`);
    process.exit(0);
  }

  console.log(`Adding registrar: ${wallet}`);
  const tx = await registry.addRegistrar(wallet);
  await tx.wait();

  console.log(`Done. Tx: https://amoy.polygonscan.com/tx/${tx.hash}`);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});