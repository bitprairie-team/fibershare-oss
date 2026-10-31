#!/usr/bin/env node
// npm run rancher:passphrase
//
// Set the rancher passphrase for sign-in on your own hardware. Stores only a
// scrypt hash in .local/rancher.json (owner-only). Setting a new passphrase
// signs out every open session.
//   npm run rancher:passphrase            ask for it (typing is not shown)
//   npm run rancher:passphrase -- --remove  turn sign-in off
// With no terminal, the passphrase is read from the first line of stdin.
import { createInterface } from "node:readline";
import { hashPassphrase, MIN_PASSPHRASE, removeRecord, writeRecord } from "../server/local-auth.js";
import { RANCHER_FILE } from "../server/paths.js";

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.includes(question)) process.stdout.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function readStdinLine() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text.split(/\r?\n/)[0];
}

async function main() {
  if (process.argv.includes("--remove")) {
    removeRecord(RANCHER_FILE);
    console.log("rancher:passphrase: removed. Rancher sign-in is off until you set one again.");
    return 0;
  }
  let passphrase;
  if (process.stdin.isTTY) {
    passphrase = await askHidden("New rancher passphrase (at least " + MIN_PASSPHRASE + " characters): ");
    const again = await askHidden("Type it again: ");
    if (again !== passphrase) {
      console.error("rancher:passphrase: they did not match. Nothing changed.");
      return 1;
    }
  } else {
    passphrase = await readStdinLine();
  }
  try {
    writeRecord(RANCHER_FILE, hashPassphrase(passphrase));
  } catch (error) {
    console.error("rancher:passphrase: " + error.message + " Nothing changed.");
    return 1;
  }
  console.log("rancher:passphrase: saved a hash in .local/rancher.json. Open sessions are signed out.");
  return 0;
}

main().then((code) => process.exit(code));
