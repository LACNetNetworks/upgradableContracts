// hardhat.config.js
require("@nomicfoundation/hardhat-ethers");
require("@openzeppelin/hardhat-upgrades"); // Añade esta línea
const { LacchainGasModelProvider } = require("@lacchain/gas-model-provider");

// Minimal .env loader (dependency-free). Hardhat evaluates this config before
// running any task/script, so PRIVATE_KEY becomes available process-wide.
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
}

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY is not set. Add it to a .env file (see README).");
}

module.exports = {
solidity: "0.8.22", // Min version required by OpenZeppelin v5.2 proxy contracts
  networks: {
    testnet: {
      url: "https://testnet-writer1.l-net.io", // URL del nodo LACChain
      chainId: 648540, // Chain ID de LACChain
      nodeAddress: "0xad730de8c4bfc3d845f7ce851bcf2ea17c049585", // Dirección del nodo validador
      provider: () => {
        return new LacchainGasModelProvider({
          privateKey: PRIVATE_KEY, // loaded from .env
          nodeAddress: "0xad730de8c4bfc3d845f7ce851bcf2ea17c049585", // Dirección del nodo validador
          rpcUrl: "https://testnet-writer1.l-net.io", // URL del nodo RPC
          expiration: 1739101897293, // Tiempo de expiración en segundos (1 hora)
        });
      },
    },

    mainnet: {
      url: "http://34.73.228.200", // URL del nodo LACChain
    //  chainId: 648541, // Chain ID de LACChain
      nodeAddress: "0x099864e3608b66c89a634f62932db3e6c96fd53a", // Dirección del nodo validador
      provider: () => {
        return new LacchainGasModelProvider({
          privateKey: PRIVATE_KEY, // loaded from .env
          nodeAddress: "0x099864e3608b66c89a634f62932db3e6c96fd53a", // Dirección del nodo validador
          rpcUrl: "http://34.73.228.200", // URL del nodo RPC
          expiration: 1739101897293, // Tiempo de expiración en segundos (1 hora)
        });
      },
    },



  },
};