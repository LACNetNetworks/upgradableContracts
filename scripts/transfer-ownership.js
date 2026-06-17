// scripts/transfer-ownership.js
// Transfers ownership of the proxy's ProxyAdmin to a new account.
//
// Why: the original deployer key was exposed in plaintext (and in pre-rewrite
// git history), so it must be considered compromised. After rotating to a fresh
// key, run this with the OLD key as the signer to hand ProxyAdmin ownership to
// the NEW account. Whoever owns the ProxyAdmin controls all future upgrades.
//
// Usage:
//   1. Set NEW_OWNER below to the new account's address.
//   2. Keep PRIVATE_KEY in .env as the CURRENT (old) owner key for this one call.
//   3. npx hardhat run scripts/transfer-ownership.js --network mainnet
//   4. Afterwards, rotate PRIVATE_KEY in .env to the new key for all other scripts.
const hre = require("hardhat");
const { ethers, upgrades } = hre;
const { LacchainProvider, LacchainSigner } = require("@lacchain/gas-model-provider");

// ---- Configure this ----
const PROXY_ADDRESS = "0xbACfDa212f9989D3A2c75108Fe9D96638ACdceaF";
const NEW_OWNER = ""; // <-- set to the new owner's address (0x...)
// -------------------------

const proxyAdminArtifact = require("../artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json");

async function main() {
  if (!ethers.isAddress(NEW_OWNER)) {
    throw new Error("Set NEW_OWNER to a valid address before running.");
  }

  const yourRPCNode = hre.network.config.url;
  const nodeAddress = hre.network.config.nodeAddress;
  const privateKey = process.env.PRIVATE_KEY; // loaded from .env via hardhat.config.js
  const expiration_date = new Date().getTime() + 5 * 60 * 1000;

  const provider = new LacchainProvider(yourRPCNode);
  const signer = new LacchainSigner(privateKey, provider, nodeAddress, expiration_date);
  const signerAddress = await signer.getAddress();

  // Resolve the ProxyAdmin (admin of the transparent proxy) and verify ownership.
  const adminAddress = await upgrades.erc1967.getAdminAddress(PROXY_ADDRESS);
  console.log("ProxyAdmin:", adminAddress);
  const proxyAdmin = new ethers.Contract(adminAddress, proxyAdminArtifact.abi, signer);

  const currentOwner = await proxyAdmin.owner();
  console.log("Current owner:", currentOwner);
  if (currentOwner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(`Signer ${signerAddress} is not the current owner (${currentOwner}); cannot transfer.`);
  }
  if (currentOwner.toLowerCase() === NEW_OWNER.toLowerCase()) {
    throw new Error(`New owner ${NEW_OWNER} is already the owner; nothing to do.`);
  }

  console.log("Transferring ProxyAdmin ownership ->", NEW_OWNER);
  const tx = await proxyAdmin.transferOwnership(NEW_OWNER);
  await tx.wait();

  const newOwner = await proxyAdmin.owner();
  if (newOwner.toLowerCase() !== NEW_OWNER.toLowerCase()) {
    throw new Error(`Transfer did not take effect; owner is still ${newOwner}.`);
  }
  console.log("Ownership transferred. New owner:", newOwner);
  console.log("Remember to rotate PRIVATE_KEY in .env to the new owner's key.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
