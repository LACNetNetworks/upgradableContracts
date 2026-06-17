// scripts/transfer-ownership.js
// Transfers ownership of the proxied contract to a new account. The owner is the
// upgrade authority (UUPS _authorizeUpgrade), so whoever owns it controls every
// future upgrade. Use this when rotating a compromised key: run it with the old
// key as signer, then update PRIVATE_KEY in .env to the new key.
//
// Ownership lives in the implementation's storage (Ownable), so we call
// transferOwnership THROUGH the proxy using MyContract's ABI.
//
// Usage: set NEW_OWNER, then
//   npx hardhat run scripts/transfer-ownership.js --network <testnet|mainnet>
const hre = require("hardhat");
const { ethers } = hre;
const { LacchainProvider, LacchainSigner } = require("@lacchain/gas-model-provider");

const contractArtifact = require("../artifacts/contracts/MyContract.sol/MyContract.json");

// ---- Configure these ----
const PROXY_ADDRESS = ""; // <-- set to the deployed proxy address
const NEW_OWNER = "";     // <-- set to the new owner's address (0x...)
// -------------------------

async function main() {
  if (!ethers.isAddress(PROXY_ADDRESS)) throw new Error("Set PROXY_ADDRESS before running.");
  if (!ethers.isAddress(NEW_OWNER)) throw new Error("Set NEW_OWNER to a valid address before running.");

  const privateKey = process.env.PRIVATE_KEY; // loaded from .env via hardhat.config.js
  const expiration_date = new Date().getTime() + 5 * 60 * 1000;

  const provider = new LacchainProvider(hre.network.config.url);
  const signer = new LacchainSigner(privateKey, provider, hre.network.config.nodeAddress, expiration_date);
  const signerAddress = await signer.getAddress();

  const proxied = new ethers.Contract(PROXY_ADDRESS, contractArtifact.abi, signer);

  const currentOwner = await proxied.owner();
  console.log("Current owner:", currentOwner);
  if (currentOwner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(`Signer ${signerAddress} is not the current owner (${currentOwner}); cannot transfer.`);
  }
  if (currentOwner.toLowerCase() === NEW_OWNER.toLowerCase()) {
    throw new Error(`New owner ${NEW_OWNER} is already the owner; nothing to do.`);
  }

  console.log("Transferring ownership ->", NEW_OWNER);
  const tx = await proxied.transferOwnership(NEW_OWNER);
  await tx.wait();

  const newOwner = await proxied.owner();
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
