import { ethers } from "ethers";

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

  const wallets = [
    { name: "Deployer", address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
    { name: "Seller",   address: "0x1017F090c9D72479fED4A02dE0280522425D94EF" },
    { name: "Buyer",    address: "0x926f57CB8B45103157b485051F93Ddf424c01c91" },
    { name: "Officer1", address: "0x74732dFBc423839357D9740Cae6e3563236823ef" },
    { name: "Officer2", address: "0x387C24987d804372E3C31F030356D80af35Cd8D4" },
    { name: "Officer3", address: "0x6eBea10B9a3180ced99F1Dc3e6511f6B6A56232C" },
  ];

  console.log("\n Wallet Balances:");
  console.log("─".repeat(70));

  for (const wallet of wallets) {
    const balance = await provider.getBalance(wallet.address);
    const eth = ethers.formatEther(balance);
    console.log(`${wallet.name.padEnd(10)} | ${wallet.address} | ${eth} ETH`);
  }

  console.log("─".repeat(70));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});