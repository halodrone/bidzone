require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/**
 * BIDZONE Phase 6.5 — Hardhat configuration for Monad Testnet.
 *
 * Deployment key is provided ONLY via environment variable at deploy time.
 * NEVER commit private keys. .env is gitignored.
 */

const {
  MONAD_TESTNET_RPC_URL = "https://testnet-rpc.monad.xyz",
  MONAD_TESTNET_CHAIN_ID = "10143",
  DEPLOYER_PRIVATE_KEY = "",
} = process.env;

module.exports = {
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Monad is EVM bytecode-compatible as of the Osaka fork.
      // Ref: https://docs.monad.xyz/guides/deploy-smart-contract/hardhat
      evmVersion: "osaka",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    monadTestnet: {
      url: MONAD_TESTNET_RPC_URL,
      chainId: Number(MONAD_TESTNET_CHAIN_ID),
      accounts: DEPLOYER_PRIVATE_KEY
        ? [
            // Accept keys with or without the 0x prefix.
            DEPLOYER_PRIVATE_KEY.startsWith("0x")
              ? DEPLOYER_PRIVATE_KEY
              : "0x" + DEPLOYER_PRIVATE_KEY,
          ]
        : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: { timeout: 120000 },
};
