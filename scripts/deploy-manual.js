// scripts/deploy-manual.js
// Manual proxy deployment that bypasses @openzeppelin/hardhat-upgrades address
// prediction (incompatible with the Lacchain gas-model provider). We deploy the
// implementation and a TransparentUpgradeableProxy directly via ethers, reading
// each address from the transaction receipt instead of predicting it from nonce.
const hre = require("hardhat");
const { ethers } = hre;
const { LacchainProvider, LacchainSigner } = require("@lacchain/gas-model-provider");

const myContractArtifact = require("../artifacts/contracts/MyContract.sol/MyContract.json");
const proxyArtifact = require("../artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json");

// Trusted forwarder the contract accepts relayed calls from (mainnet).
const TRUSTED_FORWARDER = "0xEAA5420AF59305c5ecacCB38fcDe70198001d147";
const INITIAL_VALUE = 42;

async function main() {
  const yourRPCNode = hre.network.config.url;
  const nodeAddress = hre.network.config.nodeAddress;

  // Contract Owner's Private Key
  const privateKey = process.env.PRIVATE_KEY; // loaded from .env via hardhat.config.js

  // Expiration far enough out to cover two sequential deployments.
  const expiration_date = new Date().getTime() + 5 * 60 * 1000;

  const provider = new LacchainProvider(yourRPCNode);
  const signer = new LacchainSigner(privateKey, provider, nodeAddress, expiration_date);
  const ownerAddress = await signer.getAddress();
  console.log("Deployer / proxy admin owner:", ownerAddress);

  // The Lacchain gas-model provider relays deployments through the node, so the
  // contract is NOT created by the EOA via standard CREATE. ethers' predicted
  // address (keccak(EOA, nonce)) is therefore wrong -- the authoritative address
  // is the receipt's `contractAddress`, which the node fills in. We deploy, then
  // read that field rather than trusting the predicted address / waitForDeployment.
  async function deployAndGetAddress(factory, args, label) {
    const contract = await factory.deploy(...args);
    const receipt = await contract.deploymentTransaction().wait();
    const address = receipt.contractAddress;
    if (!address || (await provider.getCode(address)) === "0x") {
      throw new Error(`${label}: no code at deployed address ${address} (receipt did not yield a valid contract address)`);
    }
    console.log(`${label} deployed to:`, address);
    return address;
  }

  // 1. Deploy the implementation (no constructor args; init happens via the proxy).
  console.log("Deploying MyContract implementation...");
  const Impl = new ethers.ContractFactory(myContractArtifact.abi, myContractArtifact.bytecode, signer);
  const implAddress = await deployAndGetAddress(Impl, [], "Implementation");

  // 2. Encode the initializer call: initialize(value, trustedForwarder).
  const iface = new ethers.Interface(myContractArtifact.abi);
  const initData = iface.encodeFunctionData("initialize", [INITIAL_VALUE, TRUSTED_FORWARDER]);

  // 3. Deploy the TransparentUpgradeableProxy(logic, initialOwner, data).
  //    OZ v5 deploys a ProxyAdmin internally, owned by initialOwner.
  console.log("Deploying TransparentUpgradeableProxy...");
  const Proxy = new ethers.ContractFactory(proxyArtifact.abi, proxyArtifact.bytecode, signer);
  const proxyAddress = await deployAndGetAddress(Proxy, [implAddress, ownerAddress, initData], "Proxy");

  // 4. Sanity-check the proxy-backed state.
  const proxied = new ethers.Contract(proxyAddress, myContractArtifact.abi, signer);
  console.log("Proxy value():", (await proxied.value()).toString());
  console.log("\nDeployment complete.");
  console.log("  Proxy (use this address):", proxyAddress);
  console.log("  Implementation:          ", implAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
