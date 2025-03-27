# bitcoin_testnet_cli

A bitcoin(BTC....possibly BCH * BSV) cli that performs various functions

Overview
The CLI currently supports one primary operation:

Create

Creates a new private/public key pair for a given username, storing it in a JSON file.

If the user already exists, it will notify you and not overwrite the existing key.

Dependencies
Node.js (version 16+ recommended; Node 19+ if you want built-in Web Crypto without extra steps)

commander

bitcoinjs-lib

ecpair

tiny-secp256k1

These packages are primarily used for:

Command-line argument parsing (commander).

Key generation and Bitcoin-related crypto (bitcoinjs-lib, ecpair, tiny-secp256k1).

Installation
Clone the repository or download the project folder.

Install the dependencies:

```bash
npm install
```
or

```bash
(Optional) Make the script executable on Unix-like systems:
chmod +x keys.js
```

Usage
The script keys.js expects two arguments:

Command: Currently supports Create.

Username: A string (e.g., Alice).

Create a New User
To create a new user (and generate a private/public key pair):

```bash

./keys.js Create Alice
```

If users/Alice.json does not exist, a new key pair is generated and saved to users/Alice.json.

If users/Alice.json already exists, the script will inform you that the user already exists and will not generate new keys.

A typical JSON file (e.g., users/Alice.json) looks like this:

```json
{
  "privateKey": "KwDiBf89QgGbjEhKnhXJuH7LrciV6s7gGBi3EZTyU7C3XsjJ2pPh",
  "publicKey": "03abf12cd3...hexstring..."
}
```
privateKey is the Wallet Import Format (WIF) for the generated private key.

publicKey is the compressed public key in hex form.

Directory Structure
bitcoin_testnet_cli/
├─ keys.js
├─ users/
│  └─ Alice.json
├─ package.json
├─ package-lock.json
└─ README.md

keys.js: The main CLI script for creating users and generating keys.

users/: A directory storing one JSON file per user.

README.md: This file, explaining usage and setup.

Notes on Security
DO NOT COMMIT REAL PRIVATE KEYS to source control. This script is a basic demo and should not be used for production without proper security measures.

Consider storing your keys in an encrypted form or using a secure wallet solution for real funds.

Use testnet (or a local regtest network) for experimentation to avoid risking real Bitcoin.

License
You may include the license of your choosing (e.g., MIT, Apache 2.0, etc.) here. If this is just a private project, you can omit or state “All rights reserved.”

