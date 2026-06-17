// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// ERC-1822: lets a proxy verify an implementation is upgrade-compatible.
interface IERC1822Proxiable {
    function proxiableUUID() external view returns (bytes32);
}

/**
 * Minimal UUPS (EIP-1822 / EIP-1967) upgradeability — a dependency-free
 * replacement for OpenZeppelin's UUPSUpgradeable.
 *
 * The upgrade logic lives in the IMPLEMENTATION (this contract), not the proxy.
 * A contract inheriting this exposes `upgradeTo` / `upgradeToAndCall`, which run
 * (via the proxy's delegatecall) in the proxy's context and rewrite the EIP-1967
 * implementation slot. Authorization is delegated to `_authorizeUpgrade`.
 *
 * No storage variables: state is the EIP-1967 slot (outside sequential layout)
 * plus an immutable baked into the implementation bytecode.
 */
abstract contract UUPSUpgradeable {
    /// bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
    bytes32 internal constant _IMPL_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    /// Address of the implementation at deploy time, used to detect direct calls.
    address private immutable __self = address(this);

    event Upgraded(address indexed implementation);

    error OnlyProxyCall();
    error ImplementationNotContract();
    error NotUUPSImplementation();
    error UnsupportedProxiableUUID(bytes32 slot);

    /**
     * Requires the call to come through the proxy (delegatecall), where
     * `address(this)` is the proxy rather than the implementation. This blocks
     * calling `upgradeTo` directly on the implementation — the vector behind the
     * classic UUPS takeover.
     */
    modifier onlyProxy() {
        if (address(this) == __self) revert OnlyProxyCall();
        _;
    }

    /// Implemented by the inheriting contract to gate who may upgrade.
    function _authorizeUpgrade(address newImplementation) internal virtual;

    /// ERC-1822 hook: returns the slot this implementation expects to live in.
    function proxiableUUID() external view virtual returns (bytes32) {
        return _IMPL_SLOT;
    }

    /// Current implementation the proxy points at.
    function implementation() external view returns (address impl) {
        assembly {
            impl := sload(_IMPL_SLOT)
        }
    }

    function upgradeTo(address newImplementation) external onlyProxy {
        _authorizeUpgrade(newImplementation);
        _upgradeToAndCall(newImplementation, "");
    }

    function upgradeToAndCall(address newImplementation, bytes calldata data) external payable onlyProxy {
        _authorizeUpgrade(newImplementation);
        _upgradeToAndCall(newImplementation, data);
    }

    function _upgradeToAndCall(address newImplementation, bytes memory data) private {
        if (newImplementation.code.length == 0) revert ImplementationNotContract();

        // Bricking protection: confirm the new implementation is UUPS-compatible
        // and expects the same storage slot before we point the proxy at it.
        try IERC1822Proxiable(newImplementation).proxiableUUID() returns (bytes32 slot) {
            if (slot != _IMPL_SLOT) revert UnsupportedProxiableUUID(slot);
        } catch {
            revert NotUUPSImplementation();
        }

        assembly {
            sstore(_IMPL_SLOT, newImplementation)
        }
        emit Upgraded(newImplementation);

        if (data.length > 0) {
            (bool ok, bytes memory ret) = newImplementation.delegatecall(data);
            if (!ok) {
                assembly {
                    revert(add(32, ret), mload(ret))
                }
            }
        }
    }
}
