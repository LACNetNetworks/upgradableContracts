// scripts/upgrade.js
// Upgrades the custom UUPS proxy to a new implementation. With UUPS the upgrade
// entrypoint lives in the IMPLEMENTATION, so we call upgradeTo / upgradeToAndCall
// THROUGH the proxy (using MyContract's ABI at the proxy address) as the owner.
//
// Steps:
//   1. Deploy the new implementation (real address read from the receipt).
//   2. Call proxy.upgradeTo(newImpl) — or upgradeToAndCall(newImpl, migration).
//
// Usage: set NEW_IMPL_ARTIFACT / MIGRATION_CALLDATA, then
//   npx hardhat run scripts/upgrade.js --network <testnet|mainnet>
const hre = require("hardhat");
const { ethers } = hre;
const { LacchainProvider, LacchainSigner } = require("@lacchain/gas-model-provider");

// ---- Configure these ----
const PROXY_ADDRESS = ""; // <-- set to the deployed proxy address
// Artifact of the NEW implementation (defaults to current MyContract).
const NEW_IMPL_ARTIFACT = require("../artifacts/contracts/MyContract.sol/MyContract.json");
// Migration calldata run against the proxy during the upgrade (e.g. a
// reinitializer). Use "0x" for none. Example:
//   const iface = new ethers.Interface(NEW_IMPL_ARTIFACT.abi);
//   const MIGRATION_CALLDATA = iface.encodeFunctionData("initializeV2", [args]);
const MIGRATION_CALLDATA = "0x";
// -------------------------

async function main() {
  if (!ethers.isAddress(PROXY_ADDRESS)) {
    throw new Error("Set PROXY_ADDRESS before running.");
  }

  const privateKey = process.env.PRIVATE_KEY; // loaded from .env via hardhat.config.js
  const expiration_date = new Date().getTime() + 5 * 60 * 1000;

  const provider = new LacchainProvider(hre.network.config.url);
  const signer = new LacchainSigner(privateKey, provider, hre.network.config.nodeAddress, expiration_date);
  const signerAddress = await signer.getAddress();

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

  const proxied = new ethers.Contract(PROXY_ADDRESS, NEW_IMPL_ARTIFACT.abi, signer);

  // Verify the signer is the owner (the only account allowed to upgrade).
  const owner = await proxied.owner();
  if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(`Signer ${signerAddress} is not the owner (${owner}); cannot upgrade.`);
  }

  // 1. Deploy the new implementation.
  console.log("Deploying new implementation...");
  const Impl = new ethers.ContractFactory(NEW_IMPL_ARTIFACT.abi, NEW_IMPL_ARTIFACT.bytecode, signer);
  const newImplAddress = await deployAndGetAddress(Impl, [], "New implementation");

  // 2. Upgrade through the proxy (UUPS). The contract verifies proxiableUUID to
  //    avoid bricking; _authorizeUpgrade enforces onlyOwner.
  console.log("Upgrading proxy", PROXY_ADDRESS, "->", newImplAddress);
  let tx;
  if (MIGRATION_CALLDATA && MIGRATION_CALLDATA !== "0x") {
    tx = await proxied.upgradeToAndCall(newImplAddress, MIGRATION_CALLDATA);
  } else {
    tx = await proxied.upgradeTo(newImplAddress);
  }
  await tx.wait();

  const implNow = await proxied.implementation();
  if (implNow.toLowerCase() !== newImplAddress.toLowerCase()) {
    throw new Error(`Upgrade did not take effect; implementation is still ${implNow}.`);
  }
  console.log("Upgrade complete. Proxy now points at:", implNow);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
