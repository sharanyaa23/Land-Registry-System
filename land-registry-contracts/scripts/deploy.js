// land-registry-contracts/scripts/deploy.js
// Hardhat 3 compatible - uses ethers directly with JSON-RPC provider

import { ethers } from "ethers";
import { artifacts } from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

async function main() {
  const networkArg  = process.argv.find((a, i) => process.argv[i-1] === "--network");
  const networkName = networkArg || "localhost";
  const isLocal     = networkName === "localhost" || networkName === "hardhat";

  const rpcUrl = isLocal
    ? "http://127.0.0.1:8545"
    : (process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology");

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  let deployer;
  if (isLocal) {
    deployer = await provider.getSigner(0); // account #0 = deployer + buyer
  } else {
    if (!process.env.DEPLOYER_PRIVATE_KEY) {
      throw new Error("DEPLOYER_PRIVATE_KEY not set in .env");
    }
    deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  }

  console.log("─────────────────────────────────────────────");
  console.log(`DLR Contract Deployment — ${networkName}`);
  console.log("─────────────────────────────────────────────");
  console.log("Deployer :", deployer.address);
  console.log("Balance  :", ethers.formatEther(
    await provider.getBalance(deployer.address)
  ), isLocal ? "ETH (local)" : "MATIC\n");

  // ── Officer addresses ──────────────────────────────────────────────
  // Local account layout:
  //   #0 → deployer + buyer
  //   #1 → seller
  //   #2 → officer 1
  //   #3 → officer 2
  //   #4 → officer 3
  let officers;
  if (isLocal) {
    officers = [
      (await provider.getSigner(2)).address, // officer 1
      (await provider.getSigner(3)).address, // officer 2
      (await provider.getSigner(4)).address, // officer 3
    ];
    console.log("⚠️  Local mode: using test accounts as officers");
    console.log("   Buyer  (account #0):", (await provider.getSigner(0)).address);
    console.log("   Seller (account #1):", (await provider.getSigner(1)).address);
  } else {
    officers = [
      process.env.OFFICER1_ADDRESS,
      process.env.OFFICER2_ADDRESS,
      process.env.OFFICER3_ADDRESS,
    ];
    officers.forEach((addr, i) => {
      if (!addr || !ethers.isAddress(addr)) {
        throw new Error(`OFFICER${i + 1}_ADDRESS is missing or invalid in .env`);
      }
    });
  }

  console.log("Officers:");
  officers.forEach((addr, i) => console.log(`  Officer ${i + 1}: ${addr}`));
  console.log();

  async function getFactory(contractName) {
    const artifact = await artifacts.readArtifact(contractName);
    return new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  }

  // ── 1. Deploy LandRegistry ────────────────────────────────────────
  console.log("1/3  Deploying LandRegistry...");
  const LandRegistry   = await getFactory("LandRegistry");
  const registry       = await LandRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("     LandRegistry  :", registryAddress);

  // ── 2. Deploy MultiSigTransfer ────────────────────────────────────
  console.log("2/3  Deploying MultiSigTransfer...");
  const MultiSigTransfer  = await getFactory("MultiSigTransfer");
  const transfer          = await MultiSigTransfer.deploy(registryAddress);
  await transfer.waitForDeployment();
  const transferAddress   = await transfer.getAddress();
  console.log("     MultiSigTransfer:", transferAddress);

  // ── 3. Deploy OfficerMultiSig ─────────────────────────────────────
  console.log("3/3  Deploying OfficerMultiSig...");
  const OfficerMultiSig      = await getFactory("OfficerMultiSig");
  const officerMultiSig      = await OfficerMultiSig.deploy(
    officers,
    transferAddress,
    registryAddress
  );
  await officerMultiSig.waitForDeployment();
  const officerMultiSigAddress = await officerMultiSig.getAddress();
  console.log("     OfficerMultiSig :", officerMultiSigAddress);

  // ── Wire contracts together ───────────────────────────────────────
  console.log("\nWiring contracts...");

  const registryArtifact = await artifacts.readArtifact("LandRegistry");
  const registryContract = new ethers.Contract(registryAddress, registryArtifact.abi, deployer);

  const transferArtifact = await artifacts.readArtifact("MultiSigTransfer");
  const transferContract = new ethers.Contract(transferAddress, transferArtifact.abi, deployer);

  let tx = await registryContract.setTransferContract(transferAddress);
  await tx.wait();
  console.log("   LandRegistry.setTransferContract →", transferAddress);

  tx = await registryContract.setOfficerMultiSig(officerMultiSigAddress);
  await tx.wait();
  console.log("   LandRegistry.setOfficerMultiSig  →", officerMultiSigAddress);

  tx = await transferContract.setOfficerMultiSig(officerMultiSigAddress);
  await tx.wait();
  console.log("   MultiSigTransfer.setOfficerMultiSig →", officerMultiSigAddress);

  // ✅ Auto-add deployer as registrar — never need to run setRegistrar manually
  tx = await registryContract.addRegistrar(deployer.address);
  await tx.wait();
  console.log("   LandRegistry.addRegistrar →", deployer.address);

  // ── Save addresses ────────────────────────────────────────────────
  const addresses = {
    network:          networkName,
    chainId:          isLocal ? 31337 : 80002,
    deployedAt:       new Date().toISOString(),
    deployer:         deployer.address,
    LandRegistry:     registryAddress,
    MultiSigTransfer: transferAddress,
    OfficerMultiSig:  officerMultiSigAddress,
    officers: {
      officer1: officers[0],
      officer2: officers[1],
      officer3: officers[2],
    },
    // ✅ Document local test accounts for easy reference
    ...(isLocal && {
      testAccounts: {
        buyer:    (await provider.getSigner(0)).address,
        seller:   (await provider.getSigner(1)).address,
        officer1: officers[0],
        officer2: officers[1],
        officer3: officers[2],
      }
    })
  };

  const outFile = isLocal ? "local.json" : "testnet.json";
  const outPath = path.join(__dirname, "../contracts/addresses", outFile);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));
  console.log(`\nAddresses saved to contracts/addresses/${outFile}`);

  // ── Summary ───────────────────────────────────────────────────────
  console.log("\n─────────────────────────────────────────────");
  console.log(" Deployment complete");
  console.log("─────────────────────────────────────────────");
  console.log("LandRegistry    :", registryAddress);
  console.log("MultiSigTransfer:", transferAddress);
  console.log("OfficerMultiSig :", officerMultiSigAddress);

  if (isLocal) {
    console.log("\n📋 Local test accounts:");
    console.log("   Buyer    #0:", (await provider.getSigner(0)).address);
    console.log("   Seller   #1:", (await provider.getSigner(1)).address);
    console.log("   Officer1 #2:", officers[0]);
    console.log("   Officer2 #3:", officers[1]);
    console.log("   Officer3 #4:", officers[2]);
    console.log("\n🔑 Import seller into MetaMask:");
    console.log("   Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    console.log("\n⚙️  Add to backend .env:");
    console.log(`   LAND_REGISTRY_ADDRESS=${registryAddress}`);
    console.log(`   MULTI_SIG_TRANSFER_ADDRESS=${transferAddress}`);
    console.log(`   OFFICER_MULTI_SIG_ADDRESS=${officerMultiSigAddress}`);
  } else {
    console.log("\n🔗 Verify on explorer:");
    [
      ["LandRegistry",     registryAddress],
      ["MultiSigTransfer", transferAddress],
      ["OfficerMultiSig",  officerMultiSigAddress],
    ].forEach(([name, addr]) =>
      console.log(`  ${name}: https://amoy.polygonscan.com/address/${addr}`)
    );
  }
  console.log("─────────────────────────────────────────────");
}

main().catch((err) => {
  console.error("\nDeployment failed:", err.message);
  process.exit(1);
});