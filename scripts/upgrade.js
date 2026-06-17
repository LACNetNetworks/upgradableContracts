// scripts/upgrade.js
// Upgrades the manually-deployed TransparentUpgradeableProxy to a new
// implementation, using the manual receipt-based pattern that works around the
// Lacchain gas-model provider (which breaks CREATE address prediction for both
// ethers and @openzeppelin/hardhat-upgrades).
//
// Steps:
//   1. Deploy the new implementation directly (real address read from receipt).
//   2. Call ProxyAdmin.upgradeAndCall(proxy, newImpl, migrationData) as the owner.
//
// To use: point NEW_IMPL_ARTIFACT at the new contract's artifact, optionally set
// MIGRATION_CALLDATA (e.g. a reinitializer call), then:
//   npx hardhat run scripts/upgrade.js --network mainnet
const hre = require("hardhat");
const { ethers, upgrades } = hre;
const { LacchainProvider, LacchainSigner } = require("@lacchain/gas-model-provider");

// ---- Configure these ----
const PROXY_ADDRESS = "0xbACfDa212f9989D3A2c75108Fe9D96638ACdceaF";
// Artifact of the NEW implementation to upgrade to (defaults to current MyContract).
const NEW_IMPL_ARTIFACT = require("../artifacts/contracts/MyContract.sol/MyContract.json");
// Calldata to run against the proxy during the upgrade (e.g. a reinitializer).
// Use "0x" for no migration call. Example to call a v2 reinitializer:
//   const iface = new ethers.Interface(NEW_IMPL_ARTIFACT.abi);
//   const MIGRATION_CALLDATA = iface.encodeFunctionData("initializeV2", [args...]);
const MIGRATION_CALLDATA = "0x";
// -------------------------

// Precompiled artifact shipped with the package (no local compile needed).
const proxyAdminArtifact = require("@openzeppelin/contracts/build/contracts/ProxyAdmin.json");

async function main() {
  const yourRPCNode = hre.network.config.url;
  const nodeAddress = hre.network.config.nodeAddress;
  const privateKey = process.env.PRIVATE_KEY; // loaded from .env via hardhat.config.js
  const expiration_date = new Date().getTime() + 5 * 60 * 1000;

  const provider = new LacchainProvider(yourRPCNode);
  const signer = new LacchainSigner(privateKey, provider, nodeAddress, expiration_date);
  const ownerAddress = await signer.getAddress();

  // Deploy a contract and return its REAL on-chain address from the receipt.
  // (ethers' predicted address is wrong under the relayed Lacchain deployment.)
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

  const Impl = new ethers.ContractFactory(NEW_IMPL_ARTIFACT.abi, NEW_IMPL_ARTIFACT.bytecode, signer);

  // 1. Validate the new implementation against the current one (storage layout,
  //    initializer/constructor safety, etc.) BEFORE spending gas on a deploy.
  //    Reads the existing layout from the manifest (recorded by force-import).
  //    Throws with a detailed report if the upgrade would be unsafe.
  console.log("Validating upgrade against current implementation...");
  await upgrades.validateUpgrade(PROXY_ADDRESS, Impl, { kind: "transparent" });
  console.log("Validation passed.");

  // 2. Deploy the new implementation.
  console.log("Deploying new implementation...");
  const newImplAddress = await deployAndGetAddress(Impl, [], "New implementation");

  // 3. Resolve the ProxyAdmin (admin of the transparent proxy) and its owner.
  const adminAddress = await upgrades.erc1967.getAdminAddress(PROXY_ADDRESS);
  console.log("ProxyAdmin:", adminAddress);
  const proxyAdmin = new ethers.Contract(adminAddress, proxyAdminArtifact.abi, signer);
  const currentOwner = await proxyAdmin.owner();
  if (currentOwner.toLowerCase() !== ownerAddress.toLowerCase()) {
    throw new Error(`Signer ${ownerAddress} is not the ProxyAdmin owner (${currentOwner}); cannot upgrade.`);
  }

  // 4. Upgrade (and optionally run migration calldata).
  console.log("Upgrading proxy", PROXY_ADDRESS, "->", newImplAddress);
  const tx = await proxyAdmin.upgradeAndCall(PROXY_ADDRESS, newImplAddress, MIGRATION_CALLDATA);
  await tx.wait();
  console.log("Upgrade complete.");

  // 5. Confirm the new implementation is wired up.
  const implNow = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
  console.log("Proxy now points at implementation:", implNow);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
