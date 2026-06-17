// SPDX-License-Identifier:MIT
pragma solidity >=0.8.0 <0.9.0;

import "./Initializable.sol";
import "./Context.sol";

/**
* A base contract to be inherited by any contract that want to receive relayed transactions
* A subclass must use "_msgSender()" instead of "msg.sender"
*/
abstract contract BaseRelayRecipient is Initializable, Context {

   /*
    * Forwarder singleton we accept calls from
    */
   address internal trustedForwarder;

   /*
    * Set the trusted forwarder address the contract accepts calls from.
    * Must be called from the inheriting contract's initializer.
    */
   function __BaseRelayRecipient_init(address _trustedForwarder) internal onlyInitializing {
       trustedForwarder = _trustedForwarder;
   }
   /**
    * return the sender of this call.
    * if the call came through our Relay Hub, return the original sender.
    * should be used in the contract anywhere instead of msg.sender
    */
   function _msgSender() internal virtual override returns (address sender) {
       bytes memory bytesRelayHub;
       (,bytesRelayHub) = trustedForwarder.staticcall(abi.encodeWithSignature("getRelayHub()"));

       if (msg.sender == abi.decode(bytesRelayHub, (address))){ //sender is RelayHub then return origin sender
           bytes memory bytesSender;
           (,bytesSender) = trustedForwarder.staticcall(abi.encodeWithSignature("getMsgSender()"));

           return abi.decode(bytesSender, (address));
       } else { //sender is not RelayHub, so it is another smart contract
           return msg.sender;
       }
   }
}
