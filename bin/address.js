#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import * as bitcoin from 'bitcoinjs-lib';
import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';

const ECPair = ECPairFactory(ecc);

const program = new Command();

// This script supports:
// 1) "Create Address <username>" => Creates/updates an address
// 2) "Address Balance <username>" => Checks the testnet balance (prints final BTC balance, plus satoshis if <1 BTC)
// 3) "Airdrop <username>" => Faucet instructions
program
  .argument('<command>', 'Command ("Create", "Address", or "Airdrop")')
  .argument('[subcommand]', 'Subcommand ("Address", "Balance") or <username> depending on the command')
  .argument('[username]', 'Username (e.g. "Alice")')
  .parse(process.argv);

const [command, subcommand, username] = program.args;

// Ensure the "users" directory exists
const usersDir = 'users';
if (!fs.existsSync(usersDir)) {
  fs.mkdirSync(usersDir, { recursive: true });
}

// Helper: path to user file
function getUserFilePath(user) {
  return `${usersDir}/${user}.json`;
}

// Helper: derive a testnet Bech32 address (P2WPKH)
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

/* =============================
   1) CREATE ADDRESS <username>
   ============================= */
if (command?.toLowerCase() === 'create' && subcommand?.toLowerCase() === 'address') {
  if (!username) {
    console.error('Missing <username>. Usage: ./address.js Create Address Bob');
    process.exit(1);
  }

  const userFilePath = getUserFilePath(username);

  if (!fs.existsSync(userFilePath)) {
    console.log(`User "${username}" does not exist. Generating new keys...`);

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
    console.log(`Created: ${userFilePath}`);
    console.log(`Private key (WIF): ${privateKeyWIF}`);
    console.log(`Public key (hex):  ${publicKeyHex}`);
    console.log(`Address:           ${address}`);
  } else {
    console.log(`User "${username}" already exists. Generating an address from existing keys...`);

    let userData;
    try {
      userData = JSON.parse(fs.readFileSync(userFilePath, 'utf-8'));
    } catch (err) {
      console.error('Error reading user file. Exiting.');
      process.exit(1);
    }

    let keyPair;
    try {
      keyPair = ECPair.fromWIF(userData.privateKey, bitcoin.networks.testnet);
    } catch (err) {
      console.error('Invalid or missing private key. Generating new key pair...');
      keyPair = ECPair.makeRandom({ rng: (size) => randomBytes(size) });
      userData.privateKey = keyPair.toWIF();
      userData.publicKey = Buffer.from(keyPair.publicKey).toString('hex');
    }

    userData.address = deriveTestnetAddress(keyPair);
    fs.writeFileSync(userFilePath, JSON.stringify(userData, null, 2));
    console.log(`Updated: ${userFilePath}`);
    console.log(`Private key (WIF): ${userData.privateKey}`);
    console.log(`Public key (hex):  ${userData.publicKey}`);
    console.log(`Address:           ${userData.address}`);
  }

/* =============================
   2) ADDRESS BALANCE <username>
   ============================= */
} else if (command?.toLowerCase() === 'address' && subcommand?.toLowerCase() === 'balance') {
  if (!username) {
    console.error('Missing <username>. Usage: ./address.js Address Balance Alice');
    process.exit(1);
  }

  const userFilePath = getUserFilePath(username);
  if (!fs.existsSync(userFilePath)) {
    console.error(`User "${username}" does not exist. Run: ./address.js Create Address ${username}`);
    process.exit(1);
  }

  let userData;
  try {
    userData = JSON.parse(fs.readFileSync(userFilePath, 'utf-8'));
  } catch (err) {
    console.error('Error reading user file. Exiting.');
    process.exit(1);
  }

  if (!userData.address) {
    console.error(`User "${username}" does not have an address. Run: ./address.js Create Address ${username}`);
    process.exit(1);
  }

  try {
    console.log(`Checking balance for "${username}" at ${userData.address}...`);
    const cmd = `curl -s "https://mempool.space/testnet/api/address/${userData.address}"`;
    const rawJson = execSync(cmd, { encoding: 'utf-8' });

    const data = JSON.parse(rawJson);
    const chainStats = data.chain_stats || {};
    const funded = chainStats.funded_txo_sum || 0;  // total sats received
    const spent = chainStats.spent_txo_sum || 0;    // total sats spent
    const balanceSats = funded - spent;
    const balanceBtc = balanceSats / 1e8;

    console.log(`Confirmed Balance (BTC): ${balanceBtc}`);

    // If less than 1 BTC, also show satoshis
    if (balanceBtc < 1) {
      console.log(`Confirmed Balance (Satoshis): ${balanceSats}`);
    }
  } catch (err) {
    console.error('Failed to fetch or parse balance data:', err.message);
  }

/* =============================
   3) AIRDROP <username>
   ============================= */
} else if (command?.toLowerCase() === 'airdrop') {
  if (!subcommand) {
    console.error('Missing <username>. Usage: ./address.js Airdrop Alice');
    process.exit(1);
  }

  const usernameForAirdrop = subcommand;
  const userFilePath = getUserFilePath(usernameForAirdrop);

  if (!fs.existsSync(userFilePath)) {
    console.log(`User "${usernameForAirdrop}" does not exist.`);
    console.log(`Run: ./address.js Create Address ${usernameForAirdrop}`);
    process.exit(0);
  }

  let userData;
  try {
    userData = JSON.parse(fs.readFileSync(userFilePath, 'utf-8'));
  } catch (err) {
    console.error('Error reading user JSON. Exiting.');
    process.exit(1);
  }

  if (!userData.address) {
    console.log(`User "${usernameForAirdrop}" does not have an address yet.`);
    console.log(`Try: ./address.js Create Address ${usernameForAirdrop}`);
    process.exit(0);
  }

  console.log(`Airdrop requested for user "${usernameForAirdrop}".`);
  console.log(`Address: ${userData.address}`);
  console.log('');
  console.log('No open REST APIs exist for automatic testnet airdrops.');
  console.log('Use a public faucet with a browser + CAPTCHA, e.g.:');
  console.log('  - https://mempool.space/testnet/faucet');
  console.log('  - https://coinfaucet.eu/en/btc-testnet/');
  console.log('');
  console.log('Steps:');
  console.log(`  1) Copy your address: ${userData.address}`);
  console.log('  2) Visit the faucet URL in a browser.');
  console.log('  3) Paste the address, solve the CAPTCHA, click "Send Testnet BTC".');
  console.log('  4) Funds arrive after a few confirmations.');
} else {
  console.error('Unknown command. Examples:');
  console.error('  ./address.js Create Address <username>');
  console.error('  ./address.js Address Balance <username>');
  console.error('  ./address.js Airdrop <username>');
  process.exit(1);
}
