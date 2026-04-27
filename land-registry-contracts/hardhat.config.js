import "@nomicfoundation/hardhat-ethers";
import dotenv from "dotenv";
dotenv.config();

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!DEPLOYER_KEY) {
  console.warn("⚠️  DEPLOYER_PRIVATE_KEY not set in .env");
}

export default {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  },

  networks: {
    localhost: {
      type: "http",
      url: "http://127.0.0.1:8545",
    },
    amoy: {
      type: "http",
      url:      process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
      chainId:  80002,
      gasPrice: 30_000_000_000
    }
  },

  etherscan: {
    apiKey: {
      polygonAmoy: process.env.POLYGONSCAN_API_KEY || ""
    },
    customChains: [
      {
        network: "polygonAmoy",
        chainId: 80002,
        urls: {
          apiURL:     "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com"
        }
      }
    ]
  },

  paths: {
    sources:   "./contracts",
    tests:     "./tests",
    cache:     "./cache",
    artifacts: "./artifacts"
  }
};