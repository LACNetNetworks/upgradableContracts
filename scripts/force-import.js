// scripts/force-import.js
// Registers the manually-deployed proxy in the .openzeppelin manifest so that
// future upgrades can use upgrades.upgradeProxy(...). Read-only: queries the
// chain and writes the local manifest, sending no transactions.
const hre = require("hardhat");
const { ethers, upgrades } = hre;
const { LacchainProvider, LacchainSigner } = require("@lacchain/gas-model-provider");

const myContractArtifact = require("../artifacts/contracts/MyContract.sol/MyContract.json");

// Proxy deployed via scripts/deploy-manual.js (mainnet).
const PROXY_ADDRESS = "0xbACfDa212f9989D3A2c75108Fe9D96638ACdceaF";

async function main() {
  const yourRPCNode = hre.network.config.url;
  const nodeAddress = hre.network.config.nodeAddress;
  const privateKey = "REDACTED"; // Replace with your private key
  const expiration_date = new Date().getTime() + 5 * 60 * 1000;

  const provider = new LacchainProvider(yourRPCNode);
  const signer = new LacchainSigner(privateKey, provider, nodeAddress, expiration_date);

  const MyContract = new ethers.ContractFactory(
    myContractArtifact.abi,
    myContractArtifact.bytecode,
    signer
  );

  console.log("Importing proxy", PROXY_ADDRESS, "...");
  const imported = await upgrades.forceImport(PROXY_ADDRESS, MyContract, { kind: "transparent" });
  console.log("Imported. Proxy address:", await imported.getAddress());
  console.log("Manifest updated. Future upgrades can use upgrades.upgradeProxy().");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
