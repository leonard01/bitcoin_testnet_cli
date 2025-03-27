#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs';
import { randomBytes } from 'crypto';
import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// Create the ECPair factory
const ECPair = ECPairFactory(ecc);

const program = new Command();

// Expect two positional arguments: "Create" and <username>
program
.name('bin/keys.js')
.description(`A simple keys management CLI. Usage:

./bin/keys.js Create <username>
./bin/keys.js SomeOtherCommand ...
`)
.version('1.0.0', '-v, --version', 'Output the current version')
.exitOverride((err) => {
  // If Commander displayed help, exit with code 0 (no error)
  if (err.code === 'commander.helpDisplayed') {
    process.exit(0);
  }
  // Otherwise, handle or rethrow
  process.exit(err.exitCode || 1);
})
  .parse(process.argv);

const [command, username] = program.args;

if (!command || !username) {
  console.error('Error: Please provide a command and a username.');
  process.exit(1);
}

// 1) Ensure "users" folder exists
const usersDir = 'users';
if (!fs.existsSync(usersDir)) {
  fs.mkdirSync(usersDir, { recursive: true });
}

// 2) Build the path to the user's JSON file
const userFilePath = `${usersDir}/${username}.json`;

// 3) Handle the "Create" command
if (command.toLowerCase() === 'create') {
  // Check if user file already exists
  if (fs.existsSync(userFilePath)) {
    console.log(`User "${username}" already exists. No new keys generated.`);
    process.exit(0);
  }

  // Otherwise, create new private/public keys
  console.log(`Creating new private/public keys for "${username}"...`);

  // Generate a new key pair
  const keyPair = ECPair.makeRandom({
    rng: (size) => randomBytes(size),
  });

  const privateKeyWIF = keyPair.toWIF();
  const publicKeyHex = keyPair.publicKey.toString('hex');

  // Save to JSON
  const userData = {
    privateKey: privateKeyWIF,
    publicKey: publicKeyHex,
  };
  fs.writeFileSync(userFilePath, JSON.stringify(userData, null, 2));

  console.log(`New user file created: ${userFilePath}`);
  console.log(`Private key (WIF): ${privateKeyWIF}`);
  console.log(`Public key (hex): ${publicKeyHex}`);
} else {
  console.error(`Unrecognized command "${command}". Currently only "Create" is supported.`);
  process.exit(1);
}
