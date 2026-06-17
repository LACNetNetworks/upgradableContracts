# UpContract — EIP-2771 upgradeable contract on LACChain

An upgradeable smart contract (`MyContract`) that supports **meta-transactions**
(gasless / relayed calls) via an EIP-2771-style trusted forwarder, deployed
behind a transparent proxy on **LACChain** using the Lacchain gas-model provider.

This README documents not just *what* the project contains, but *why* each piece
was modified or adapted — in particular the workarounds required to deploy an
OpenZeppelin upgradeable proxy through the LACChain gas model.

---

## Contracts

### `contracts/BaseRelayRecipient.sol`
A base contract that lets any inheriting contract receive **relayed
transactions**. A relayer pays the gas and forwards the call through a trusted
*forwarder*; the recipient recovers the original sender via `_msgSender()`
(querying the forwarder's `getRelayHub()` / `getMsgSender()`), so subclasses use
`_msgSender()` instead of `msg.sender`.

**What changed and why:**

1. **Trusted forwarder is now a parameter, not a hardcoded address.**
   Originally the forwarder address was hardcoded:
   ```solidity
   address internal trustedForwarder = 0xEAA5420A...d147; // mainnet
   ```
   This baked a single network's forwarder into the bytecode, making the
   contract non-portable across networks/environments and impossible to
   configure at deploy time. It is now supplied externally.

2. **Initializer instead of constructor.**
   The first refactor used a constructor parameter. But `MyContract` is an
   **upgradeable** contract deployed behind a proxy — and **a constructor runs
   in the implementation contract's context, not the proxy's storage**. A
   constructor-set `trustedForwarder` would live on the implementation and read
   back as `address(0)` through the proxy.

   So `BaseRelayRecipient` was made `Initializable` and exposes:
   ```solidity
   function __BaseRelayRecipient_init(address _trustedForwarder) internal onlyInitializing
   ```
   The inheriting contract calls this from *its* initializer, so the forwarder
   is written to the **proxy's** storage where `_msgSender()` reads it. The
   `onlyInitializing` modifier guarantees it can only be set during
   initialization.

### `contracts/MyContract.sol`
The application contract. It is `Initializable` (upgradeable pattern) and now
also inherits `BaseRelayRecipient`. Its `initialize` wires up the forwarder:
```solidity
function initialize(uint256 _value, address _trustedForwarder) public initializer {
    __BaseRelayRecipient_init(_trustedForwarder);
    value = _value;
}
```
The previous constructor-based wiring was removed in favor of this initializer
for the proxy-storage reason above.

**Storage layout (must stay append-only across upgrades):**

| Slot | Variable           | Source              |
|------|--------------------|---------------------|
| 0    | `trustedForwarder` | `BaseRelayRecipient`|
| 1    | `value`            | `MyContract`        |

### `contracts/ProxyImport.sol`
A one-line file that imports OpenZeppelin's `TransparentUpgradeableProxy`. Its
**only purpose** is to make Hardhat compile the proxy + `ProxyAdmin` artifacts so
the deployment scripts can instantiate them directly (see workaround below).
It deploys no logic of its own.

---

## Configuration

### `hardhat.config.js`
- **Solidity compiler bumped `0.8.20` → `0.8.22`.** OpenZeppelin Contracts v5.2
  proxy contracts (`TransparentUpgradeableProxy`, `ProxyAdmin`,
  `ERC1967Utils`) declare `pragma solidity ^0.8.22`. The project contracts use
  `^0.8.0` / `>=0.8.0 <0.9.0`, so they remain compatible with the bump.
- Two networks are configured, **`testnet`** and **`mainnet`**, both using
  `@lacchain/gas-model-provider` (`LacchainGasModelProvider`) with the validator
  node address and signer key.

> 🔐 **Deployer key:** the deployer private key is read from a **gitignored
> `.env`** file (`PRIVATE_KEY=0x...`). `hardhat.config.js` contains a small
> dependency-free loader that reads `.env` before any task runs, so the scripts
> pick up `process.env.PRIVATE_KEY` automatically. Copy `.env.example` to `.env`
> and fill in the key. Never commit `.env`.

---

## The LACChain deployment workaround (important)

The headline adaptation in this project. Standard OpenZeppelin upgrade tooling
**does not work out of the box** with the LACChain gas-model provider.

### The problem
The Lacchain gas model **relays deployment transactions through the validator
node** rather than creating contracts directly from the EOA. Standard tooling
predicts a new contract's address as `keccak(deployer_EOA, nonce)` (the CREATE
formula). Because the *actual* creator is the node — not the EOA — the contract
lands at a **different address than predicted**.

This broke deployment in two layers:

1. **`@openzeppelin/hardhat-upgrades` (`deployProxy`)** failed with:
   ```
   InvalidDeployment: No contract at address 0x7C09…523 (Removed from manifest)
   ```
   OZ predicted the implementation address, found no bytecode there, and aborted.

2. **Raw ethers `ContractFactory.deploy()`** then failed at the proxy step with
   `ERC1967InvalidImplementation(0x…)` — the proxy rejected the implementation
   address because ethers had *also* handed back the predicted (empty) address.

### The fix
**Read the real deployed address from the transaction receipt's
`contractAddress` field** (which the node populates with where it actually
deployed) instead of trusting the predicted address. The scripts deploy, wait
for the receipt, take `receipt.contractAddress`, and verify code exists there
before continuing:

```js
const contract = await factory.deploy(...args);
const receipt   = await contract.deploymentTransaction().wait();
const address   = receipt.contractAddress;       // authoritative, node-assigned
if ((await provider.getCode(address)) === "0x") throw new Error("no code");
```

The proxy is then assembled manually rather than via `deployProxy`.

---

## Scripts

All scripts run with `npx hardhat run scripts/<file> --network <testnet|mainnet>`.

### `scripts/deploy-manual.js`
Deploys the system without OZ's address prediction:
1. Deploys the `MyContract` implementation (no constructor args).
2. Encodes `initialize(value, trustedForwarder)` as the proxy init data.
3. Deploys a `TransparentUpgradeableProxy(impl, owner, initData)` — OZ v5 spins
   up its own `ProxyAdmin` (owned by `owner`) internally.
4. Reads each address from the receipt and sanity-checks `value()` through the
   proxy.

### `scripts/force-import.js`
Registers the manually-deployed proxy into the `.openzeppelin/` manifest via
`upgrades.forceImport(...)`. Required because the proxy was **not** created
through `deployProxy`, so OZ doesn't know about it. Read-only (no transactions);
after this, `upgrades.validateUpgrade` / `upgradeProxy` can recognize the proxy.

### `scripts/upgrade.js`
A ready-to-go upgrade flow that also works around the Lacchain provider:
1. **Validates** the new implementation against the current storage layout
   (`upgrades.validateUpgrade`) — aborts on unsafe changes *before* spending gas.
2. Deploys the new implementation (receipt-based address).
3. Resolves the `ProxyAdmin` and verifies the signer is its owner.
4. Upgrades via `ProxyAdmin.upgradeAndCall(proxy, newImpl, migrationData)`.
5. Confirms the proxy's new implementation address.

Configure `NEW_IMPL_ARTIFACT` and (optionally) `MIGRATION_CALLDATA` at the top
of the file for the new version. Keep storage append-only and add new state via
a `reinitializer`.

### `scripts/transfer-ownership.js`
Transfers ownership of the proxy's `ProxyAdmin` to a new account. Use this when
**rotating the deployer key** (the original key was exposed and should be treated
as compromised): run it with the old key as the signer to hand control to the new
account, then update `PRIVATE_KEY` in `.env`. Set `NEW_OWNER` at the top first;
the script verifies the signer is the current owner and confirms the new owner
after the transfer.

---

## Deployed addresses (LACChain mainnet)

| Role                | Address                                      |
|---------------------|----------------------------------------------|
| **Proxy** (use this)| `0xbACfDa212f9989D3A2c75108Fe9D96638ACdceaF` |
| Implementation      | `0x3dCc104300D42638C623eD289cC178a2D3D1082B` |
| Proxy admin owner   | `0xB75F7d6d206E6939F48b3eE13458666d74c40716` |
| Trusted forwarder   | `0xEAA5420AF59305c5ecacCB38fcDe70198001d147` |

The proxy is registered in `.openzeppelin/unknown-648541.json` for future
upgrades.

---

## Typical workflow

```shell
npm install
cp .env.example .env        # then set PRIVATE_KEY=0x... in .env
npx hardhat compile

# First-time deploy
npx hardhat run scripts/deploy-manual.js --network mainnet

# Register the proxy with OpenZeppelin tooling (once)
npx hardhat run scripts/force-import.js --network mainnet

# Later, to upgrade
#   1. edit MyContract.sol (append-only storage)
#   2. npx hardhat compile
#   3. set NEW_IMPL_ARTIFACT / MIGRATION_CALLDATA in scripts/upgrade.js
npx hardhat run scripts/upgrade.js --network mainnet
```

## Security & key rotation

> ⚠️ **The original deployer key must be treated as compromised.** It was
> committed to source in plaintext and present in early git history. Although the
> key was later moved to a gitignored `.env` and **purged from git history** (the
> published repo contains no key), anyone who saw the repo before the rewrite —
> or any pre-rewrite clone — may still have it. Removing it from history does
> **not** un-expose it.

Whoever holds the key controls the **`ProxyAdmin`** (current owner
`0xB75F7d6d206E6939F48b3eE13458666d74c40716`), and therefore every future
upgrade of the proxy. The implementation holds no funds and no owner-gated
logic, so rotating `ProxyAdmin` ownership is sufficient to remove the old key's
authority.

### Key handling rules
- The private key lives **only** in a local, gitignored `.env` (`PRIVATE_KEY=0x...`).
- Never commit `.env`, paste the key into source, or share it in chat/tickets.
- `.env.example` is the only key-related file that is committed (a template).

### Rotating the key
1. Generate a fresh keypair (e.g. `node address.js`) and save it securely.
2. Authorize / fund the new account on LACChain as needed.
3. Set `NEW_OWNER` to the new address in `scripts/transfer-ownership.js`.
4. With the **old** key still in `.env`, transfer ownership:
   ```shell
   npx hardhat run scripts/transfer-ownership.js --network mainnet
   ```
   The script verifies the signer is the current owner and confirms the new
   owner after the transaction.
5. Replace `PRIVATE_KEY` in `.env` with the **new** key. All other scripts
   (`upgrade.js`, etc.) now act as the new owner.
6. Retire the old key everywhere it was used.

---

## Repository layout

```
contracts/
  BaseRelayRecipient.sol   EIP-2771 recipient base (initializer-based forwarder)
  MyContract.sol           App contract, upgradeable, inherits BaseRelayRecipient
  ProxyImport.sol          Pulls in proxy artifacts for manual deployment
scripts/
  deploy-manual.js         Manual impl + proxy deployment (Lacchain workaround)
  force-import.js          Register proxy in the OpenZeppelin manifest
  upgrade.js               Validate + deploy new impl + upgrade via ProxyAdmin
  transfer-ownership.js    Transfer ProxyAdmin ownership (e.g. on key rotation)
.openzeppelin/             OpenZeppelin upgrade manifests (deployment state)
hardhat.config.js          Solidity 0.8.22, LACChain networks, .env loader
address.js                 Standalone helper to generate a fresh keypair
.env.example               Template for the gitignored .env (PRIVATE_KEY)
```
