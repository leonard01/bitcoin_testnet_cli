#!/usr/bin/env node

//todo 

// update address help with correct syntax
// finsh create tx - need testnet faucets

import { Command } from 'commander';
import fs from 'fs';
import { randomBytes } from 'crypto';

// If on Node <18, install and import node-fetch:
import fetch from 'node-fetch';
import * as bitcoin from 'bitcoinjs-lib';
import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// Create an ECPair factory from ecpair + tiny-secp256k1
const ECPair = ECPairFactory(ecc);

// Set fixed fee for tx's
const fee = 100;

// We'll store each user’s data under users/<username>.json
const usersDir = 'users';
if (!fs.existsSync(usersDir)) {
  fs.mkdirSync(usersDir, { recursive: true });
}

// Helper: Build the path for a given user's JSON file
function getUserFilePath(username) {
  return `${usersDir}/${username}.json`;
}

// Helper: Create a new key pair on TESTNET
function createTestnetKeyPair() {
  // Use ECPair.makeRandom with "network: testnet" to ensure testnet WIF
  const keyPair = ECPair.makeRandom({
    rng: (size) => randomBytes(size),
    network: bitcoin.networks.testnet,
  });
  return keyPair;
}

// Helper: Convert publicKey (sometimes Uint8Array) to a Node Buffer
function toBuffer(pubKey) {
  return Buffer.isBuffer(pubKey) ? pubKey : Buffer.from(pubKey);
}

// Helper: Derive a TESTNET Bech32 address from a keyPair
function deriveTestnetAddress(keyPair) {
  const pubkeyBuf = toBuffer(keyPair.publicKey);

  const { address } = bitcoin.payments.p2wpkh({
    pubkey: pubkeyBuf,
    network: bitcoin.networks.testnet,
  });
  return address;
}

// Create a new Commander program
const program = new Command();



program
  .name('bin/address.js')
  .description(`
A simple BTC testnet CLI.

Commands:
  CreateAddress <username>
  Address Balance <username>
  Airdrop <username>
  Send <fromUser> <amountSats> <toUser>

Examples:
  ./bin/address.js CreateAddress Alice
  ./bin/address.js Address Balance Alice
  ./bin/address.js Airdrop Alice
  ./bin/address.js Send Alice 500 Bob
`)
  .version('1.0.0');

// ---------------------------------------------------------
// 1) CREATEADDRESS <username>
// ---------------------------------------------------------
program
  .command('CreateAddress <username>')
  .description('Create or update a testnet private key/public key/address for <username>')
  .action((username) => {
    const userFile = getUserFilePath(username);

    if (!fs.existsSync(userFile)) {
      console.log(`User "${username}" does not exist. Generating new testnet keys...`);
      const keyPair = createTestnetKeyPair();
      const privateKeyWIF = keyPair.toWIF();
      const address = deriveTestnetAddress(keyPair);

      // Store them
      const userData = {
        privateKey: privateKeyWIF,
        publicKey: keyPair.publicKey.toString('hex'), // just for reference
        address,
      };
      fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));

      console.log(`Created: ${userFile}`);
      console.log(`Private Key (WIF): ${privateKeyWIF}`);
      console.log(`Public Key (hex):  ${userData.publicKey}`);
      console.log(`Address:           ${address}`);
    } else {
      console.log(`User "${username}" already exists. Checking existing keys...`);
      let userData;
      try {
        userData = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
      } catch (err) {
        console.error('Error reading user file:', err.message);
        process.exit(1);
      }

      // Attempt to parse the private key
      let keyPair;
      try {
        keyPair = ECPair.fromWIF(userData.privateKey, bitcoin.networks.testnet);
      } catch (err) {
        // If invalid, generate new
        console.warn('Existing private key is invalid. Generating new testnet key...');
        keyPair = createTestnetKeyPair();
      }

      // Overwrite userData with up-to-date info
      userData.privateKey = keyPair.toWIF();
      userData.publicKey = keyPair.publicKey.toString('hex');
      userData.address = deriveTestnetAddress(keyPair);

      fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));
      console.log(`Updated: ${userFile}`);
      console.log(`Private Key (WIF): ${userData.privateKey}`);
      console.log(`Public Key (hex):  ${userData.publicKey}`);
      console.log(`Address:           ${userData.address}`);
    }
  });

// ---------------------------------------------------------
// 2) ADDRESS BALANCE <username>
// ---------------------------------------------------------
program
  .command('Address Balance <username>')
  .description('Fetch the testnet balance for <username>')
  .action(async (username) => {
    const userFile = getUserFilePath(username);
    if (!fs.existsSync(userFile)) {
      console.error(`User "${username}" does not exist.`);
      process.exit(1);
    }

    let userData;
    try {
      userData = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
    } catch (err) {
      console.error('Error reading user file:', err.message);
      process.exit(1);
    }

    if (!userData.address) {
      console.error(`User "${username}" has no address. Try: ./bin/address.js CreateAddress ${username}`);
      process.exit(1);
    }

    console.log(`Fetching balance for "${username}" at ${userData.address}...`);

    const addrUrl = `https://mempool.space/testnet/api/address/${userData.address}`;
    try {
      const res = await fetch(addrUrl);
      if (!res.ok) {
        throw new Error(`HTTP error: status = ${res.status}`);
      }
      const data = await res.json();
      const funded = data.chain_stats?.funded_txo_sum || 0;
      const spent = data.chain_stats?.spent_txo_sum || 0;
      const balanceSats = funded - spent;
      const balanceBtc = balanceSats / 1e8;

      console.log(`Confirmed balance (BTC): ${balanceBtc}`);
      if (balanceBtc < 1) {
        console.log(`Confirmed balance (Satoshis): ${balanceSats}`);
      }
    } catch (err) {
      console.error('Failed to fetch balance:', err.message);
    }
  });

// ---------------------------------------------------------
// 3) AIRDROP <username>
// ---------------------------------------------------------
program
  .command('Airdrop <username>')
  .description('Show instructions for manually getting testnet BTC')
  .action((username) => {
    const userFile = getUserFilePath(username);
    if (!fs.existsSync(userFile)) {
      console.log(`User "${username}" does not exist. Try: ./bin/address.js CreateAddress ${username}`);
      process.exit(0);
    }

    let userData;
    try {
      userData = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
    } catch (err) {
      console.error('Error reading user file:', err.message);
      process.exit(1);
    }

    if (!userData.address) {
      console.log(`User "${username}" has no address. Try: ./bin/address.js CreateAddress ${username}`);
      process.exit(0);
    }

    console.log(`Airdrop requested for "${username}". Address: ${userData.address}`);
    console.log('No REST-based faucets are publicly open. Use a browser faucet with CAPTCHA, e.g.:');
    console.log('  - https://mempool.space/testnet/faucet');
    console.log('  - https://coinfaucet.eu/en/btc-testnet/');
  });

// ---------------------------------------------------------
// 4) CreateTx <fromUser> <amountSats> <toUser>
// ---------------------------------------------------------

// A simple command that builds and signs a transaction:
program
  .command('CreateTx <fromUser> <amountSats> <toUser>')
  .description('Build, sign, and print a raw transaction hex')
  .action(async (fromUser, amountSats, toUser) => {
    // 1) Load user files and parse private key
    const fromFile = getUserFilePath(fromUser);
    const toFile = getUserFilePath(toUser);

    if (!fs.existsSync(fromFile)) {
      console.error(`User "${fromUser}" does not exist.`);
      process.exit(1);
    }
    if (!fs.existsSync(toFile)) {
      console.error(`User "${toUser}" does not exist.`);
      process.exit(1);
    }

    let fromData, toData;
    try {
      fromData = JSON.parse(fs.readFileSync(fromFile, 'utf-8'));
      toData = JSON.parse(fs.readFileSync(toFile, 'utf-8'));
    } catch (err) {
      console.error('Error reading user files:', err.message);
      process.exit(1);
    }

    if (!fromData.privateKey || !fromData.address) {
      console.error(`User "${fromUser}" must have a private key and address.`);
      process.exit(1);
    }
    if (!toData.address) {
      console.error(`User "${toUser}" must have an address.`);
      process.exit(1);
    }

    // 2) Convert amount to integer
    const sendAmount = parseInt(amountSats, 10);
    if (isNaN(sendAmount) || sendAmount <= 0) {
      console.error(`Invalid amount: ${amountSats}`);
      process.exit(1);
    }

    // 3) Load the "fromUser" private key as an ECPair (testnet example)
    let keyPair;
    try {
      keyPair = ECPair.fromWIF(fromData.privateKey, bitcoin.networks.testnet);
    } catch (err) {
      console.error(`Invalid private key for "${fromUser}": ${err.message}`);
      process.exit(1);
    }

    // 4) Fetch UTXOs from mempool.space (testnet). If you have them locally, skip this.
    console.log(`Fetching UTXOs for ${fromData.address}...`);
    const url = `https://mempool.space/testnet/api/address/${fromData.address}/utxo`;
    let utxos;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`UTXO fetch failed. HTTP status = ${res.status}`);
      }
      utxos = await res.json();
    } catch (err) {
      console.error('Failed to fetch UTXOs:', err.message);
      process.exit(1);
    }

    if (!utxos || utxos.length === 0) {
      console.error(`No UTXOs for address: ${fromData.address}`);
      process.exit(1);
    }

    // 5) Do a simple coin selection with a fixed FEE-sat fee
    const needed = sendAmount + fee;
    let selected = [];
    let totalValue = 0;

    for (const u of utxos) {
      selected.push(u);
      totalValue += u.value;
      if (totalValue >= needed) break;
    }

    if (totalValue < needed) {
      console.error(`Insufficient funds. Need >= ${needed}, have ${totalValue}.`);
      process.exit(1);
    }

    // 6) Create a new PSBT
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });

    const pubkeyBuf = toBuffer(keyPair.publicKey);

    // Add inputs
    for (const utxo of selected) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: bitcoin.payments.p2wpkh({ pubkey: pubkeyBuf, network: bitcoin.networks.testnet }).output,
          value: utxo.value,
        },
      });
    }

    // Add output to the "toUser" address
    psbt.addOutput({
      address: toData.address,
      value: sendAmount,
    });

    // If leftover, add change back to fromUser
    const change = totalValue - needed;
    if (change > 0) {
      psbt.addOutput({
        address: fromData.address,
        value: change,
      });
    }

    // 7) Sign all inputs (with fromUser’s private key)
    psbt.signAllInputs(keyPair);

    // 8) Finalize the transaction
    psbt.finalizeAllInputs();

    // 9) Extract the final raw transaction hex
    const txHex = psbt.extractTransaction().toHex();

    console.log('\n======================================================');
    console.log('Signed Transaction Hex (NOT broadcast):');
    console.log(txHex);
    console.log('======================================================');
    console.log('You can broadcast it at https://blockstream.info/testnet/tx/push');
  });



// program
//   .command('Send <fromUser> <amountSats> <toUser>')
//   .description('Create and sign a transaction sending <amountSats> from <fromUser> to <toUser>')
//   .action(async (fromUser, amountSats, toUser) => {
//     // 1) Check user files
//     const fromFile = getUserFilePath(fromUser);
//     const toFile = getUserFilePath(toUser);
//     if (!fs.existsSync(fromFile)) {
//       console.error(`User "${fromUser}" does not exist.`);
//       process.exit(1);
//     }
//     if (!fs.existsSync(toFile)) {
//       console.error(`User "${toUser}" does not exist.`);
//       process.exit(1);
//     }

//     let fromData, toData;
//     try {
//       fromData = JSON.parse(fs.readFileSync(fromFile, 'utf-8'));
//       toData = JSON.parse(fs.readFileSync(toFile, 'utf-8'));
//     } catch (err) {
//       console.error('Error reading user files:', err.message);
//       process.exit(1);
//     }

//     if (!fromData.address || !fromData.privateKey) {
//       console.error(`User "${fromUser}" is missing address/privateKey data.`);
//       process.exit(1);
//     }
//     if (!toData.address) {
//       console.error(`User "${toUser}" has no address. Please create one first.`);
//       process.exit(1);
//     }

//     const amount = parseInt(amountSats, 10);
//     if (isNaN(amount) || amount <= 0) {
//       console.error(`Invalid amount: ${amountSats}`);
//       process.exit(1);
//     }

//     // 2) Load the "fromUser" private key as ECPair (testnet)
//     let keyPair;
//     try {
//       keyPair = ECPair.fromWIF(fromData.privateKey, bitcoin.networks.testnet);
//     } catch (err) {
//       console.error(`Invalid private key for "${fromUser}":`, err.message);
//       process.exit(1);
//     }

//     // 3) Fetch UTXOs
//     console.log(`Fetching UTXOs for ${fromData.address}...`);
//     const utxoUrl = `https://mempool.space/testnet/api/address/${fromData.address}/utxo`;
//     let utxos;
//     try {
//       const res = await fetch(utxoUrl);
//       if (!res.ok) {
//         throw new Error(`Fetch error, status = ${res.status}`);
//       }
//       utxos = await res.json();
//     } catch (err) {
//       console.error('Failed to fetch UTXOs:', err.message);
//       process.exit(1);
//     }

//     if (!utxos || utxos.length === 0) {
//       console.error(`No UTXOs found for address ${fromData.address}.`);
//       process.exit(1);
//     }

//     // 4) Simple coin selection with a 1000-sat fixed fee
//     const fee = 1000;
//     const needed = amount + fee;
//     let selected = [];
//     let totalValue = 0;

//     // Gather UTXOs until we reach needed
//     for (const u of utxos) {
//       selected.push(u);
//       totalValue += u.value;
//       if (totalValue >= needed) break;
//     }
//     if (totalValue < needed) {
//       console.error(`Insufficient funds: need >= ${needed}, have ${totalValue}.`);
//       process.exit(1);
//     }

//     // 5) Build the transaction via PSBT
//     const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });

//     // Convert pubkey to a Buffer for scripts
//     const pubkeyBuf = toBuffer(keyPair.publicKey);

//     // Add inputs
//     for (const u of selected) {
//       psbt.addInput({
//         hash: u.txid,
//         index: u.vout,
//         // For P2WPKH, must provide witnessUtxo
//         witnessUtxo: {
//           script: bitcoin.payments.p2wpkh({ pubkey: pubkeyBuf, network: bitcoin.networks.testnet }).output,
//           value: u.value,
//         },
//       });
//     }

//     // Add output to "toUser"
//     psbt.addOutput({
//       address: toData.address,
//       value: amount,
//     });

//     // If leftover, add change back to fromUser
//     const change = totalValue - needed;
//     if (change > 0) {
//       psbt.addOutput({
//         address: fromData.address,
//         value: change,
//       });
//     }

//     // Sign inputs
//     psbt.signAllInputs(keyPair);
//     psbt.finalizeAllInputs();

//     // Extract raw hex
//     const txHex = psbt.extractTransaction().toHex();

//     console.log('--------------------------------------------');
//     console.log('Signed Transaction Hex (not broadcast):');
//     console.log(txHex);
//     console.log('--------------------------------------------');
//     console.log('Push it at: https://blockstream.info/testnet/tx/push');
//   });

// Parse Commander args
program.parse(process.argv);
