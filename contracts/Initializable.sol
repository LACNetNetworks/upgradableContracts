// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * Minimal initializer pattern for upgradeable (proxied) contracts — a
 * dependency-free replacement for OpenZeppelin's Initializable.
 *
 * Why it exists: a proxied contract cannot use a constructor for its state
 * (the constructor runs in the implementation's context, not the proxy's), so
 * state is set once via an `initializer` function that runs in proxy storage.
 *
 * Storage: occupies slot 0 (`_initialized` + `_initializing` packed together).
 */
abstract contract Initializable {
    uint8 private _initialized;
    bool private _initializing;

    event Initialized(uint8 version);

    error AlreadyInitialized();
    error NotInitializing();

    /// Runs the body exactly once (the first initialization).
    modifier initializer() {
        if (_initializing || _initialized >= 1) revert AlreadyInitialized();
        _initialized = 1;
        _initializing = true;
        _;
        _initializing = false;
        emit Initialized(1);
    }

    /// Runs the body once per increasing `version` — used by upgrade migrations.
    modifier reinitializer(uint8 version) {
        if (_initializing || _initialized >= version) revert AlreadyInitialized();
        _initialized = version;
        _initializing = true;
        _;
        _initializing = false;
        emit Initialized(version);
    }

    /// Restricts a function to only run while an initializer is executing.
    modifier onlyInitializing() {
        if (!_initializing) revert NotInitializing();
        _;
    }

    /**
     * Locks the contract so `initialize` can never be called on it. MUST be
     * called from the implementation's constructor: it prevents an attacker
     * from initializing the implementation directly and (combined with the
     * `onlyProxy` guard on upgrades) blocks the classic UUPS takeover. This is
     * especially important on LACChain, whose pre-Cancun EVM still honours
     * SELFDESTRUCT.
     */
    function _disableInitializers() internal {
        if (_initializing) revert AlreadyInitialized();
        if (_initialized < type(uint8).max) {
            _initialized = type(uint8).max;
            emit Initialized(type(uint8).max);
        }
    }
}
