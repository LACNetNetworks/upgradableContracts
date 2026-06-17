// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * Provides the effective sender of a call. By default this is `msg.sender`, but
 * BaseRelayRecipient overrides it to recover the original sender from a trusted
 * forwarder (EIP-2771).
 *
 * On LACChain this matters for ALL state-changing calls: transactions are
 * relayed through the network's relay hub, so `msg.sender` is the hub — not the
 * user. Access control (e.g. Ownable.onlyOwner) MUST compare against
 * `_msgSender()`, or it will reject the real owner.
 */
abstract contract Context {
    function _msgSender() internal virtual returns (address) {
        return msg.sender;
    }
}
