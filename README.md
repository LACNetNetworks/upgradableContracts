# UpContract — custom UUPS upgradeable contract on LACChain (no OpenZeppelin)

> **Branch `custom-uups-proxy`.** This branch implements upgradeability with a
> **fully custom, dependency-free UUPS stack** — no OpenZeppelin contracts. For
> the OpenZeppelin transparent-proxy version, see the `main` branch.

An upgradeable contract (`MyContract`) supporting **meta-transactions** (EIP-2771)
behind a minimal **UUPS** proxy written from scratch, deployed on **LACChain**
via the Lacchain gas-model provider. Everything is compiled with our own
toolchain so it stays compatible with LACChain's EVM.

---

## Why UUPS, and why custom

- **UUPS** keeps the proxy minimal: it only delegatecalls. The upgrade logic
  (`upgradeTo` / `upgradeToAndCall`) lives in the **implementation** and is gated
  by an owner. There is no separate ProxyAdmin contract.
- **No OpenZeppelin**: we control the source and compiler settings, which is what
  makes it deployable on LACChain (see the three constraints below). OZ's
  prebuilt artifacts are not usable here, and its tooling assumes standard
  deployment semantics that the gas-model provider breaks.

---

## Contracts

| File | Role |
|------|------|
| `Context.sol` | Provides `_msgSender()` (virtual). Default `msg.sender`; overridden for EIP-2771. |
| `Initializable.sol` | Initializer / reinitializer / `_disableInitializers` (proxy-safe init). |
| `Ownable.sol` | Owner-based access control; the owner is the upgrade authority. |
| `BaseRelayRecipient.sol` | EIP-2771 recipient; overrides `_msgSender()` to recover the relayed sender. |
| `UUPSUpgradeable.sol` | Minimal UUPS: EIP-1967 slot, `upgradeTo`/`upgradeToAndCall`, `onlyProxy`, bricking check. |
| `Proxy.sol` | Minimal EIP-1967 proxy (delegatecall fallback + init in constructor). No admin. |
| `MyContract.sol` | The app contract wiring all of the above together. |

**Storage layout (append-only across upgrades):**

| Slot | Variable                     | Source              |
|------|------------------------------|---------------------|
| 0    | `_initialized`/`_initializing` | `Initializable`   |
| 1    | `trustedForwarder`           | `BaseRelayRecipient`|
| 2    | `_owner`                     | `Ownable`           |
| 3    | `value`                      | `MyContract`        |

`Context` and `UUPSUpgradeable` add no sequential storage (UUPS uses the EIP-1967
slot plus an immutable baked into bytecode).

### Upgrade safety built in
- **`onlyProxy`** on `upgradeTo*`: the upgrade can only run through the proxy
  (delegatecall), never on the implementation directly.
- **`_disableInitializers()`** in the implementation constructor: the
  implementation can never be initialized on its own. Together these block the
  classic UUPS takeover — which matters on LACChain, whose pre-Cancun EVM still
  honours `SELFDESTRUCT`.
- **`proxiableUUID` check** before every upgrade: refuses an implementation that
  isn't UUPS-compatible / expects a different slot, so you can't brick the proxy.

---

## The three LACChain constraints (all learned the hard way)

Deploying upgradeable contracts on LACChain required solving three independent
problems. Each is handled in this branch:

### 1. Address prediction — the gas-model provider relays deployments
The Lacchain gas model relays transactions through the validator node, so a new
contract is **not** created by the EOA via standard `CREATE`. Tooling that
predicts the address as `keccak(EOA, nonce)` gets the wrong address.

**Fix:** the scripts read the real address from the transaction **receipt**
(`receipt.contractAddress`) and verify code exists there, instead of trusting the
predicted address.

### 2. The PUSH0 opcode — EVM version
`PUSH0` (opcode `0x5f`, EIP-3855) was added in the **Shanghai** hardfork. Modern
solc emits it by default, but **LACChain's EVM does not support it** — such
bytecode reverts (it surfaces as `missing revert data` at gas estimation).

**Fix:** `hardhat.config.js` pins **`evmVersion: "paris"`**, which predates
Shanghai, so neither our contracts nor the proxy ever contain `PUSH0`. (This is
also why we cannot use OpenZeppelin's prebuilt proxy artifacts, which are full of
`PUSH0`.)

### 3. Relayed `msg.sender` — access control must use `_msgSender()`
This is the subtle one. Because **every** transaction is relayed through the
network's relay hub, a contract sees `msg.sender` = the **relay hub**, not the
user's EOA. Access control written against `msg.sender` therefore rejects the
real owner — `initialize` worked (no sender check) but `upgradeTo` reverted with
`NotOwner`.

**Fix:** `Ownable.onlyOwner` compares against **`_msgSender()`**, which
`BaseRelayRecipient` overrides to recover the original sender from the trusted
forwarder (EIP-2771). This is exactly what `BaseRelayRecipient` is for — and it
applies to *all* owner-gated calls, not just app logic.

> ⚠️ Because access control relies on the trusted forwarder, the
> `trustedForwarder` configured at `initialize` must be the **correct forwarder
> for the target network** (the mainnet forwarder for mainnet, etc.). A wrong
> forwarder makes `_msgSender()` — and thus every owner-gated call — fail.

---

## Scripts

Run with `npx hardhat run scripts/<file> --network <testnet|mainnet>`.

- **`deploy-manual.js`** — deploys the implementation, then `Proxy(impl, initData)`
  where `initData` = `initialize(value, trustedForwarder, owner)`. Reads addresses
  from receipts.
- **`upgrade.js`** — deploys a new implementation and calls `upgradeTo` /
  `upgradeToAndCall` **through the proxy** as the owner. Verifies ownership first
  and confirms the new implementation after. Set `PROXY_ADDRESS`,
  `NEW_IMPL_ARTIFACT`, optional `MIGRATION_CALLDATA`.
- **`transfer-ownership.js`** — transfers the contract owner (the upgrade
  authority) through the proxy. Use when rotating keys.

There is no `force-import` step: without OpenZeppelin there is no manifest to
register.

> ⚠️ **No automated storage-layout validation.** OpenZeppelin's
> `validateUpgrade` is gone with the dependency. Keep the storage layout
> **append-only** by hand (never reorder/remove existing variables; add new state
> only at the end, via a `reinitializer`).

---

## Deployed addresses (LACChain mainnet)

Verified end-to-end on mainnet (deploy → upgrade → state preserved):

| Role | Address |
|------|---------|
| **Proxy** (use this)  | `0xC8CFaD92C0CAa02a4C474B9e557Bd5FB00F2FfA9` |
| Implementation (current) | `0x3c641b0B138bd07a18De1dC2F593A308ebdA7995` |
| Owner (upgrade authority) | `0xB75F7d6d206E6939F48b3eE13458666d74c40716` |
| Trusted forwarder | `0xEAA5420AF59305c5ecacCB38fcDe70198001d147` |

---

## Typical workflow

```shell
npm install
cp .env.example .env        # then set PRIVATE_KEY=0x... in .env
npx hardhat compile

# Deploy
npx hardhat run scripts/deploy-manual.js --network mainnet

# Later, to upgrade
#   1. edit MyContract.sol (append-only storage)
#   2. npx hardhat compile
#   3. set PROXY_ADDRESS / NEW_IMPL_ARTIFACT / MIGRATION_CALLDATA in scripts/upgrade.js
npx hardhat run scripts/upgrade.js --network mainnet
```

> 💡 Each deploy publishes the implementation before the proxy; failed or
> repeated attempts leave **permanent orphaned implementation contracts**
> on-chain (immutable bytecode, no `SELFDESTRUCT` in the contract). They are
> harmless but cannot be removed. Test on `testnet` first when you can — though
> note testnet needs the correct **testnet** trusted forwarder for owner-gated
> calls to work (see constraint #3).

---

## Security & key handling

- The deployer private key lives **only** in a gitignored `.env`
  (`PRIVATE_KEY=0x...`), loaded by `hardhat.config.js`. Never commit it.
- The contract **owner is the sole upgrade authority**. Protect that key as you
  would any admin key, and use `scripts/transfer-ownership.js` to rotate it.

## Repository layout

```
contracts/
  Context.sol              _msgSender() provider (EIP-2771 hook point)
  Initializable.sol        proxy-safe initializer pattern
  Ownable.sol              owner access control (uses _msgSender)
  BaseRelayRecipient.sol   EIP-2771 recipient; overrides _msgSender
  UUPSUpgradeable.sol      minimal UUPS upgrade logic (EIP-1967/1822)
  Proxy.sol                minimal EIP-1967 proxy (delegatecall, no admin)
  MyContract.sol           app contract wiring it all together
scripts/
  deploy-manual.js         deploy implementation + proxy (receipt-based)
  upgrade.js               deploy new impl + upgradeTo through the proxy
  transfer-ownership.js    transfer the owner / upgrade authority
hardhat.config.js          Solidity 0.8.22 (evmVersion paris), networks, .env loader
address.js                 helper to generate a fresh keypair
.env.example               template for the gitignored .env (PRIVATE_KEY)
```
