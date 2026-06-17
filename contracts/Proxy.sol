// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * Minimal EIP-1967 proxy — a dependency-free replacement for OpenZeppelin's
 * ERC1967Proxy, used with the UUPS pattern.
 *
 * The proxy itself has NO admin and NO upgrade logic: every call is forwarded by
 * delegatecall to the implementation, and the upgrade entrypoints live in the
 * implementation (see UUPSUpgradeable). The implementation address is stored in
 * the standard EIP-1967 slot so explorers/tooling can find it.
 *
 * Compiled locally with evmVersion "paris" (see hardhat.config.js) so the
 * bytecode contains no PUSH0 opcode, which LACChain's EVM does not support.
 */
contract Proxy {
    /// bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
    bytes32 internal constant _IMPL_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    error ImplementationNotContract();

    /**
     * @param implementation_ the logic contract
     * @param data            optional initializer calldata, delegatecalled once
     *                        in the proxy's context (e.g. `initialize(...)`)
     */
    constructor(address implementation_, bytes memory data) payable {
        if (implementation_.code.length == 0) revert ImplementationNotContract();
        assembly {
            sstore(_IMPL_SLOT, implementation_)
        }
        if (data.length > 0) {
            (bool ok, bytes memory ret) = implementation_.delegatecall(data);
            if (!ok) {
                assembly {
                    revert(add(32, ret), mload(ret))
                }
            }
        }
    }

    function _implementation() internal view returns (address impl) {
        assembly {
            impl := sload(_IMPL_SLOT)
        }
    }

    /// Forwards every call (and plain ETH transfers with empty calldata) to the
    /// implementation via delegatecall, returning/​reverting with its result.
    fallback() external payable {
        address impl = _implementation();
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }
}
