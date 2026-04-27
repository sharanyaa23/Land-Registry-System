import { ethers } from "ethers";

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const deployer = await provider.getSigner(0);
  console.log("Funding from:", await deployer.getAddress());

  const wallets = [
    { name: "Seller",   address: "0x1017F090c9D72479fED4A02dE0280522425D94EF", amount: "100" },
    { name: "Buyer",    address: "0x926f57CB8B45103157b485051F93Ddf424c01c91", amount: "100" },
    { name: "Officer1", address: "0x74732dFBc423839357D9740Cae6e3563236823ef", amount: "1"   },
    { name: "Officer2", address: "0x387C24987d804372E3C31F030356D80af35Cd8D4", amount: "1"   },
    { name: "Officer3", address: "0x6eBea10B9a3180ced99F1Dc3e6511f6B6A56232C", amount: "1"   },
  ];

  for (const wallet of wallets) {
    const tx = await deployer.sendTransaction({
      to: wallet.address,
      value: ethers.parseEther(wallet.amount),
    });
    await tx.wait();
    console.log(`Funded ${wallet.name} (${wallet.address}) with ${wallet.amount} ETH — tx: ${tx.hash}`);
  }

  console.log("\nAll wallets funded!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});