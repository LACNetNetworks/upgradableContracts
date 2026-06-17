// contracts/MyContract.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Initializable.sol";
import "./BaseRelayRecipient.sol";
import "./Ownable.sol";
import "./UUPSUpgradeable.sol";

/**
 * Upgradeable application contract using a fully custom (no-OpenZeppelin) UUPS
 * stack: Initializable + BaseRelayRecipient (EIP-2771) + Ownable + UUPSUpgradeable.
 *
 * Storage layout (append-only across upgrades):
 *   slot 0: _initialized/_initializing  (Initializable)
 *   slot 1: trustedForwarder            (BaseRelayRecipient)
 *   slot 2: _owner                      (Ownable)
 *   slot 3: value                       (MyContract)
 */
contract MyContract is Initializable, BaseRelayRecipient, Ownable, UUPSUpgradeable {
    uint256 public value;

    /// Locks the implementation so it can only be used through a proxy.
    constructor() {
        _disableInitializers();
    }

    function initialize(uint256 _value, address _trustedForwarder, address _owner) public initializer {
        __BaseRelayRecipient_init(_trustedForwarder);
        __Ownable_init(_owner);
        value = _value;
    }

    function setValue(uint256 _value) public {
        value = _value;
    }

    /// Only the owner may authorize an upgrade (UUPS hook).
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// Resolve _msgSender to the EIP-2771 recipient implementation (relayed sender).
    function _msgSender() internal override(Context, BaseRelayRecipient) returns (address) {
        return BaseRelayRecipient._msgSender();
    }
}
