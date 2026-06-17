// scripts/deploy-manual.js
// Deploys the custom (no-OpenZeppelin) UUPS system on LACChain:
//   1. Deploy the MyContract implementation.
//   2. Deploy our minimal EIP-1967 Proxy(impl, initData), where initData is the
//      encoded initialize(value, forwarder, owner) call (delegatecalled once in
//      the proxy's context by the proxy constructor).
//
// LACChain notes:
//   - Addresses are read from the transaction RECEIPT (`contractAddress`), not
//     predicted from the EOA nonce, because the gas-model provider relays
//     deployments through the node.
//   - All contracts are compiled with evmVersion "paris" (no PUSH0).
const hre = require("hardhat");
const { ethers } = hre;
const { LacchainProvider, LacchainSigner } = require("@lacchain/gas-model-provider");

const implArtifact = require("../artifacts/contracts/MyContract.sol/MyContract.json");
const proxyArtifact = require("../artifacts/contracts/Proxy.sol/Proxy.json");

// ---- Configure these ----
const TRUSTED_FORWARDER = "0xEAA5420AF59305c5ecacCB38fcDe70198001d147";
const INITIAL_VALUE = 42;
// -------------------------

async function main() {
  const privateKey = process.env.PRIVATE_KEY; // loaded from .env via hardhat.config.js
  const expiration_date = new Date().getTime() + 5 * 60 * 1000;

  const provider = new LacchainProvider(hre.network.config.url);
  const signer = new LacchainSigner(privateKey, provider, hre.network.config.nodeAddress, expiration_date);
  const ownerAddress = await signer.getAddress();
  console.log("Deployer / owner (upgrade authority):", ownerAddress);

  // Deploy a contract and return its REAL on-chain address from the receipt.
  async function deployAndGetAddress(factory, args, label) {
    const contract = await factory.deploy(...args);
    const receipt = await contract.deploymentTransaction().wait();
    const address = receipt.contractAddress;
    if (!address || (await provider.getCode(address)) === "0x") {
      throw new Error(`${label}: no code at deployed address ${address}`);
    }
    console.log(`${label} deployed to:`, address);
    return address;
  }

  // 1. Implementation.
  console.log("Deploying MyContract implementation...");
  const Impl = new ethers.ContractFactory(implArtifact.abi, implArtifact.bytecode, signer);
  const implAddress = await deployAndGetAddress(Impl, [], "Implementation");

  // 2. Encode initialize(value, trustedForwarder, owner).
  const iface = new ethers.Interface(implArtifact.abi);
  const initData = iface.encodeFunctionData("initialize", [INITIAL_VALUE, TRUSTED_FORWARDER, ownerAddress]);

  // 3. Deploy the proxy with the init data.
  console.log("Deploying Proxy...");
  const ProxyFactory = new ethers.ContractFactory(proxyArtifact.abi, proxyArtifact.bytecode, signer);
  const proxyAddress = await deployAndGetAddress(ProxyFactory, [implAddress, initData], "Proxy");

  // 4. Sanity-check the proxied state (call MyContract's ABI at the proxy address).
  const proxied = new ethers.Contract(proxyAddress, implArtifact.abi, signer);
  console.log("Proxy value():         ", (await proxied.value()).toString());
  console.log("Proxy owner():         ", await proxied.owner());
  console.log("Proxy implementation():", await proxied.implementation());

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
