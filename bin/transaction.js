// transaction.js
import fs from 'fs';
import fetch from 'node-fetch'; // or another HTTP library
import * as bitcoin from 'bitcoinjs-lib';
import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// We'll store user data in ./users/<username>.json
const usersDir = 'users';

// Convert a username to the path of its JSON file
function getUserFilePath(user) {
  return `${usersDir}/${user}.json`;
}

// Create an ECPair factory for testnet keys
const ECPair = ECPairFactory(ecc);

/**
 * Build and sign a transaction spending `amountSats` from `fromUser` to `toUser`.
 * Returns the signed transaction in hex. Does NOT broadcast.
 *
 * Throws an Error if either user file doesn't exist, or funds are insufficient, etc.
 */
export async function createTransaction(fromUser, toUser, amountSats) {
  // 1) Check if the users exist
  const fromPath = getUserFilePath(fromUser);
  const toPath = getUserFilePath(toUser);

  if (!fs.existsSync(fromPath)) {
    throw new Error(`User "${fromUser}" does not exist.`);
  }
  if (!fs.existsSync(toPath)) {
    throw new Error(`User "${toUser}" does not exist.`);
  }

  // 2) Load "fromUser" data
  let fromData;
  try {
    fromData = JSON.parse(fs.readFileSync(fromPath, 'utf-8'));
  } catch (err) {
    throw new Error(`Error reading JSON for user "${fromUser}": ${err.message}`);
  }
  const fromPrivateKeyWIF = fromData.privateKey;
  const fromAddress = fromData.address;

  // 3) Load "toUser" data
  let toData;
  try {
    toData = JSON.parse(fs.readFileSync(toPath, 'utf-8'));
  } catch (err) {
    throw new Error(`Error reading JSON for user "${toUser}": ${err.message}`);
  }
  const toAddress = toData.address;

  // 4) Validate amount
  const amount = parseInt(amountSats, 10);
  if (isNaN(amount) || amount <= 0) {
    throw new Error(`Invalid amount (satoshis): ${amountSats}`);
  }

  // 5) Fetch UTXOs from mempool.space for the "fromUser" address
  const utxoUrl = `https://mempool.space/testnet/api/address/${fromAddress}/utxo`;
  let utxos;
  try {
    const response = await fetch(utxoUrl);
    if (!response.ok) {
      throw new Error(`Fetch error, status = ${response.status}`);
    }
    utxos = await response.json();
  } catch (err) {
    throw new Error(`Failed to fetch UTXOs for ${fromAddress}: ${err.message}`);
  }

  if (!utxos || utxos.length === 0) {
    throw new Error(`No UTXOs found for address: ${fromAddress}`);
  }

  // 6) Coin selection: we pick a fixed fee (e.g. 1000 sats), then gather UTXOs until we reach (amount + fee)
  const fee = 1000;
  const target = amount + fee;
  let selectedUtxos = [];
  let totalSelected = 0;

  for (const u of utxos) {
    selectedUtxos.push(u);
    totalSelected += u.value;
    if (totalSelected >= target) break;
  }

  if (totalSelected < target) {
    throw new Error(`Insufficient funds. Need at least ${target}, only have ${totalSelected} sats`);
  }

  // 7) Build and sign the transaction using PSBT
  let keyPair;
  try {
    keyPair = ECPair.fromWIF(fromPrivateKeyWIF, bitcoin.networks.testnet);
  } catch (err) {
    throw new Error(`Invalid private key WIF for "${fromUser}": ${err.message}`);
  }

  // Start building PSBT
  const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });

  // Add inputs
  for (const utxo of selectedUtxos) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      // Provide witness info for P2WPKH
      witnessUtxo: {
        script: bitcoin.payments.p2wpkh({
          pubkey: keyPair.publicKey,
          network: bitcoin.networks.testnet
        }).output,
        value: utxo.value,
      },
    });
  }

  // Add output: "toAddress"
  psbt.addOutput({
    address: toAddress,
    value: amount,
  });

  // Send leftover back to "fromAddress" as change
  const change = totalSelected - target;
  if (change > 0) {
    psbt.addOutput({
      address: fromAddress,
      value: change
    });
  }

  // Sign all inputs
  psbt.signAllInputs(keyPair);

  // Finalize
  psbt.finalizeAllInputs();

  // Extract the full transaction in hex
  const txHex = psbt.extractTransaction().toHex();
  return txHex;
}
