const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "MATIC");

  // 1. Deploy LandRegistry
  console.log("\n📄 Deploying LandRegistry...");
  const LandRegistry = await hre.ethers.getContractFactory("LandRegistry");
  const registry = await LandRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("✅ LandRegistry deployed to:", registryAddr);

  // 2. Deploy MultiSigTransfer (linked to LandRegistry)
  console.log("\n📄 Deploying MultiSigTransfer...");
  const MultiSigTransfer = await hre.ethers.getContractFactory("MultiSigTransfer");
  const multisig = await MultiSigTransfer.deploy(registryAddr);
  await multisig.waitForDeployment();
  const multisigAddr = await multisig.getAddress();
  console.log("✅ MultiSigTransfer deployed to:", multisigAddr);

  // 3. Save deployment addresses
  const deployment = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      LandRegistry: registryAddr,
      MultiSigTransfer: multisigAddr,
    },
  };

  const outDir = path.resolve(__dirname, "../deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `${hre.network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log(`\n📁 Deployment saved to: ${outFile}`);

  // 4. Also copy ABIs to backend for integration
  const abiDir = path.resolve(__dirname, "../../land-registry-backend/src/contracts");
  if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir, { recursive: true });

  const registryArtifact = await hre.artifacts.readArtifact("LandRegistry");
  const multisigArtifact = await hre.artifacts.readArtifact("MultiSigTransfer");

  fs.writeFileSync(
    path.join(abiDir, "LandRegistry.json"),
    JSON.stringify({ abi: registryArtifact.abi, address: registryAddr }, null, 2)
  );
  fs.writeFileSync(
    path.join(abiDir, "MultiSigTransfer.json"),
    JSON.stringify({ abi: multisigArtifact.abi, address: multisigAddr }, null, 2)
  );

  console.log("📁 ABIs copied to backend/src/contracts/");
  console.log("\n🎉 Deployment complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
