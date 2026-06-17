// contracts/ProxyImport.sol
// SPDX-License-Identifier: MIT
// Imported solely so Hardhat compiles the proxy artifacts LOCALLY with our
// evmVersion ("paris"). This is required for LACChain: OpenZeppelin's prebuilt
// proxy artifacts are compiled with PUSH0 (Shanghai+), which LACChain's EVM
// rejects. Compiling here produces PUSH0-free bytecode that deploys correctly.
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
