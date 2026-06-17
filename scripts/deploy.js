// scripts/deploy.js
const hre = require("hardhat");
const { ethers, upgrades } = hre;
const { LacchainProvider, LacchainSigner } = require("@lacchain/gas-model-provider");
const contractAbi = require("../artifacts/contracts/MyContract.sol/MyContract.json");

async function main() {

  // Mainnet Configuration
  const yourRPCNode = hre.network.config.url; // RPC node from the active --network config
  const nodeAddress = hre.network.config.nodeAddress; // validator node address from config

  // Contract Owner's Private Key
  const privateKey = "REDACTED"; // Replace with your private key

  console.log("Starting deployment of MyContractV1...");

// Calculate expiration date (1 minute from now to match deployment timeout)
const now = new Date();
const expiration_date = now.getTime() + 1 * 60 * 1000;

  // Create Lacchain Provider and Signer
  const provider = new LacchainProvider(yourRPCNode);
  const signer = new LacchainSigner(privateKey, provider, nodeAddress, expiration_date);

  console.log("Creating Factory for MyContract...");

  // Create the contract factory with the custom signer
//  const MyContractV1 = await ethers.getContractFactory("MyContractV1", signer);

  const MyContract = new ethers.ContractFactory(
    contractAbi.abi,
    contractAbi.bytecode,
    signer
  );


// Trusted forwarder the contract accepts relayed calls from (mainnet)
const trustedForwarder = "0xEAA5420AF59305c5ecacCB38fcDe70198001d147";

const myContract = await upgrades.deployProxy(MyContract, [42, trustedForwarder], {
initializer: "initialize",
timeout: 60000, // 1 minuto
pollingInterval: 4000, // 4 segundos
});

  await myContract.waitForDeployment();

  console.log("MyContract deployed to:", await myContract.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });