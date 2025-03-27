#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs';
import { randomBytes } from 'crypto';
import * as bitcoin from 'bitcoinjs-lib';
import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';

const ECPair = ECPairFactory(ecc);

const program = new Command();

// This script supports three sub-commands:
// 1) "Create Address <username>"
// 2) "Airdrop <username>"
// (We intentionally keep "Create Address" as separate words.)
program
  .argument('<command>', 'Command (e.g. "Create" or "Airdrop")')
  .argument('[subcommand]', 'Subcommand (e.g. "Address") - optional for "Create Address" flow')
  .argument('[username]', 'Username (e.g. "Bob")')
  .parse(process.argv);

const [command, subcommand, username] = program.args;

if (!command) {
  console.error('Usage Examples:');
  console.error('  ./address.js Create Address Bob');
  console.error('  ./address.js Airdrop Bob');
  process.exit(1);
}

// Ensure the "users" directory
const usersDir = 'users';
if (!fs.existsSync(usersDir)) {
  fs.mkdirSync(usersDir, { recursive: true });
}

// Helper function to build file path for the user
function getUserFilePath(user) {
  return `${usersDir}/${user}.json`;
}

// Helper function to convert publicKey to a Buffer and then derive a P2WPKH testnet address
function deriveTestnetAddress(keyPair) {
  const pubkey = Buffer.isBuffer(keyPair.publicKey)
    ? keyPair.publicKey
    : Buffer.from(keyPair.publicKey);

  const { address } = bitcoin.payments.p2wpkh({
    pubkey,
    network: bitcoin.networks.testnet,
  });
  return address;
}

if (command.toLowerCase() === 'create' && subcommand?.toLowerCase() === 'address') {
  // -----------------------------------------------------
  // Command: ./address.js Create Address <username>
  // -----------------------------------------------------
  if (!username) {
    console.error('Missing <username>. Usage: ./address.js Create Address Bob');
    process.exit(1);
  }

  const userFilePath = getUserFilePath(username);

  if (!fs.existsSync(userFilePath)) {
    // Create new key + address
    console.log(`User "${username}" does not exist. Generating new private key, public key, and address...`);

    const keyPair = ECPair.makeRandom({ rng: (size) => randomBytes(size) });
    const privateKeyWIF = keyPair.toWIF();
    const publicKeyHex = Buffer.from(keyPair.publicKey).toString('hex');
    const address = deriveTestnetAddress(keyPair);

    const userData = {
      privateKey: privateKeyWIF,
      publicKey: publicKeyHex,
      address: address,
    };

    fs.writeFileSync(userFilePath, JSON.stringify(userData, null, 2));
    console.log(`New user file created at: ${userFilePath}`);
    console.log(`Private key (WIF): ${privateKeyWIF}`);
    console.log(`Public key (hex):  ${publicKeyHex}`);
    console.log(`Address:           ${address}`);
  } else {
    // File exists, derive address from existing key or generate new if invalid
    console.log(`User "${username}" already exists. Generating an address from existing keys...`);

    let userData;
    try {
      userData = JSON.parse(fs.readFileSync(userFilePath, 'utf-8'));
    } catch (err) {
      console.error('Error reading user JSON. Exiting.');
      process.exit(1);
    }

    let keyPair;
    try {
      keyPair = ECPair.fromWIF(userData.privateKey, bitcoin.networks.testnet);
    } catch (err) {
      console.error('Invalid or missing private key. Generating a new key pair...');
      keyPair = ECPair.makeRandom({ rng: (size) => randomBytes(size) });
      userData.privateKey = keyPair.toWIF();
      userData.publicKey = Buffer.from(keyPair.publicKey).toString('hex');
    }

    const address = deriveTestnetAddress(keyPair);
    userData.address = address;

    fs.writeFileSync(userFilePath, JSON.stringify(userData, null, 2));
    console.log(`Updated user file with new address: ${userFilePath}`);
    console.log(`Private key (WIF): ${userData.privateKey}`);
    console.log(`Public key (hex):  ${userData.publicKey}`);
    console.log(`Address:           ${address}`);
  }
} else if (command.toLowerCase() === 'airdrop') {
  // -----------------------------------------------------
  // Command: ./address.js Airdrop <username>
  // -----------------------------------------------------
  if (!subcommand) {
    console.error('Missing <username>. Usage: ./address.js Airdrop Bob');
    process.exit(1);
  }

  const usernameForAirdrop = subcommand;
  const userFilePath = getUserFilePath(usernameForAirdrop);

  // Check if the user file exists
  if (!fs.existsSync(userFilePath)) {
    console.log(`User "${usernameForAirdrop}" does not exist.`);
    console.log('Please create a private key and address first:');
    console.log(`  ./address.js Create Address ${usernameForAirdrop}`);
    process.exit(0);
  }

  // File exists; check if there's an address
  let userData;
  try {
    userData = JSON.parse(fs.readFileSync(userFilePath, 'utf-8'));
  } catch (err) {
    console.error('Error reading user JSON. Exiting.');
    process.exit(1);
  }

  if (!userData.address) {
    console.log(`User "${usernameForAirdrop}" does not have an address yet.`);
    console.log(`Try running: ./address.js Create Address ${usernameForAirdrop}`);
    process.exit(0);
  }

  // Inform about faucets (no REST calls) and how to manually do an airdrop
  console.log(`Airdrop requested for user "${usernameForAirdrop}".`);
  console.log(`Address: ${userData.address}`);
  console.log('');
  console.log('Currently, no open REST APIs exist for automated testnet airdrops.');
  console.log('You must use a public faucet that requires a browser and captcha. For example:');
  console.log('  - https://testnet.help/en/btcfaucet/testnet/');
  console.log('  - https://bitcoinfaucet.uo1.net/');
  console.log('');
  console.log('Steps to get testnet BTC:');
  console.log('  1) Open one of the faucet sites above in your web browser.');
  console.log(`  2) Copy and paste your address: ${userData.address}`);
  console.log('  3) Solve the CAPTCHA or sign in if required.');
  console.log('  4) Click the button to send testnet BTC.');
  console.log('');
  console.log("You'll receive testnet BTC after the faucet processes your request.");
} else {
  // Unknown command
  console.error('Unknown command. Usage examples:');
  console.error('  ./address.js Create Address <username>');
  console.error('  ./address.js Airdrop <username>');
  process.exit(1);
}
