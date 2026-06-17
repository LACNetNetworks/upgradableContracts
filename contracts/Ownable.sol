// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Initializable.sol";
import "./Context.sol";

/**
 * Minimal owner-based access control for upgradeable contracts — a
 * dependency-free replacement for OpenZeppelin's OwnableUpgradeable.
 *
 * The owner is the upgrade authority (see UUPSUpgradeable._authorizeUpgrade).
 * Ownership checks use `_msgSender()` (NOT raw `msg.sender`): on LACChain every
 * transaction is relayed through the network's relay hub, so `msg.sender` is the
 * hub, and only `_msgSender()` (EIP-2771, via the trusted forwarder) yields the
 * real owner. Using `msg.sender` here would reject the legitimate owner.
 */
abstract contract Ownable is Initializable, Context {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error ZeroAddressOwner();

    function __Ownable_init(address initialOwner) internal onlyInitializing {
        if (initialOwner == address(0)) revert ZeroAddressOwner();
        _transferOwnership(initialOwner);
    }

    modifier onlyOwner() {
        if (_msgSender() != _owner) revert NotOwner();
        _;
    }

    function owner() public view returns (address) {
        return _owner;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddressOwner();
        _transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal {
        address previous = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(previous, newOwner);
    }
}
