// contracts/MyContract.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./BaseRelayRecipient.sol";

contract MyContract is Initializable, BaseRelayRecipient {
    uint256 public value;

    function initialize(uint256 _value, address _trustedForwarder) public initializer {
        __BaseRelayRecipient_init(_trustedForwarder);
        value = _value;
    }

    function setValue(uint256 _value) public {
        value = _value;
    }
}