# peaqOS Operator Guide

Framework-agnostic manual for the `peaqos` CLI. Any agent or human can read and follow this top-to-bottom. Covers both agung testnet and mainnet.

---

## Install

Requires Python ≥ 3.10.

**From PyPI (once released):**

```bash
python3 -m venv .peaqos-env
source .peaqos-env/bin/activate
pip install peaq-os-cli
peaqos --version
```

**From source (pre-release / local development):**

```bash
git clone https://github.com/peaqnetwork/peaq-os-cli-py
cd peaq-os-cli-py
python3 -m venv .peaqos-env
source .peaqos-env/bin/activate
pip install -e .
peaqos --version
```

---

## Demo happy path {#demo-happy-path}

A complete testnet walkthrough. Produces a real peaqID, Machine NFT, first event, and MCR query on agung testnet. Takes ~15 minutes.

### Step 1 — Install CLI

```bash
python3 -m venv .peaqos-env && source .peaqos-env/bin/activate
pip install peaq-os-cli
```

### Step 2 — Configure environment {#step-2-init}

```bash
peaqos init
```

When prompted:
- **Network:** `testnet`
- **Private key source:** `generate` (creates a fresh keypair; save the key securely). Alternatively, choose `wallet` to create an OWS encrypted vault wallet — see `#admin-wallet-options` for details.
- **RPC URL:** `https://peaq-agung.api.onfinality.io/public`
- **MCR API URL:** `https://mcr.peaq.xyz`
- **Gas Station URL:** leave blank (not available on agung)
- **Contract addresses:** enter the agung values from `examples/.env.example`

Verify with `peaqos whoami` — should show Chain ID 9990.

### Step 3 — Fund the wallet {#step-3-fund}

The gas station is not available on agung testnet. Fund via the web faucet:

1. Copy your wallet address from `peaqos whoami`
2. Go to: https://docs.peaq.xyz/peaqchain/build/getting-started/get-test-tokens
3. Request test tokens (3 AGNG/day)
4. Wait for balance to appear — poll with `peaqos whoami` or check the block explorer

Block explorer: https://testnet.peaqscan.xyz/

On **mainnet**, `peaqos activate` handles funding automatically via the gas station (steps 1–3 in the activation flow). No manual funding needed.

### Step 4 — Activate the machine {#step-4-activate}

```bash
peaqos activate --skip-funding
```

`--skip-funding` bypasses the gas station flow since we funded manually in Step 3. Watch the 6-step progress on stderr:

```
[4/6] Register machine
  Registered. machine_id=42
[5/6] Mint NFT
  Minted NFT for machine_id=42 -> token_id=11 (tx 0x...)
[6/6] Write DID attributes
  Wrote 6 machine DID attributes (tx 0x...)

Machine activated successfully.
  Machine ID:   42
  Token ID:     11
  Machine DID:  did:peaq:0xYourAddress
```

Save the **Machine DID** — you'll need it for event submission and MCR queries.

Re-running `activate` is safe — it skips already-completed steps.

### Step 5 — Submit first event {#step-5-event}

```bash
peaqos qualify event \
  --machine-id 42 \
  --type activity \
  --value 0 \
  --ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

Use `activity` type with `--value 0` for a first heartbeat — lowest cognitive load, always valid.

Output:
```
Event submitted.
  Machine ID:   42
  Type:         activity
  Value:        0
  Trust:        self-reported
  Tx:           0x...
  Data Hash:    0x...
```

### Step 6 — Verify with MCR {#step-6-verify}

```bash
peaqos qualify mcr did:peaq:0xYourAddress
```

The MCR indexer takes up to 90 seconds to reflect new events. If you see `Provisioned`, wait 30s and retry. Eventually you'll see:

```
MCR for did:peaq:0xYourAddress

  Rating:          Provisioned → CC (first event builds history)
  Score:           ...
  Bond Status:     bonded
  Events:
    Total:         1
    Activity:      1
```

If MCR doesn't update in 2 minutes, use chain-direct lookup instead:

```bash
peaqos show machine did:peaq:0xYourAddress
```

This reads directly from the chain (no indexer lag).

---

## Admin wallet options {#admin-wallet-options}

### W1 — Existing wallet

You already have an EOA with PEAQ (or ready to fund on testnet).

1. Add `PEAQOS_PRIVATE_KEY=0x<your-key>` to `.env`
2. Run `peaqos whoami` to confirm address and network

### W2 — Generate fresh keypair

```bash
peaqos init
# Choose: Private key source → generate
```

The CLI generates a secp256k1 keypair, prints the address, and writes the key to `.env`.
**The private key is shown once on stderr — save it immediately to a secure location.**

Fund the new address:
- **Testnet:** web faucet (Step 3 above)
- **Mainnet:** transfer PEAQ to the address shown in `peaqos whoami`

### W2.5 — OWS encrypted vault wallet

The CLI now supports Open Wallet Standard (OWS) for secure, encrypted key storage. Instead of a plaintext private key in `.env`, keys are stored encrypted in `~/.ows/` behind a vault passphrase.

**Requires OWS support:**
```bash
pip install "peaq-os-sdk[ows]"
```

**Create via `peaqos init`:**
```bash
peaqos init
# Choose: Private key source → wallet
# Enter a wallet name and vault passphrase when prompted
# Save the displayed mnemonic phrase securely
```

The init wizard derives your address for all peaq networks, and writes `PEAQOS_OWS_WALLET=<name>` to `.env`.

**Or create directly:**
```bash
peaqos wallet create my-operator          # 12-word mnemonic (default)
peaqos wallet create my-operator --words 24  # 24-word mnemonic
peaqos wallet use my-operator             # set as active in .env
```

**Avoid repeated passphrase prompts:**
```bash
export OWS_PASSPHRASE="your-vault-passphrase"
```

All existing commands (`activate`, `qualify event`, etc.) work transparently with OWS wallets — no flags needed.

**Useful wallet commands:**
```bash
peaqos wallet list                  # list all wallets in vault
peaqos wallet show my-operator      # display address and chain details
peaqos wallet export my-operator    # view recovery phrase (confirmation required)
peaqos wallet delete my-operator    # securely remove wallet (confirmation required)
```

### W3 — KMS / hardware wallet / multisig

OWS (W2.5) provides encrypted key storage and is the recommended approach for most production setups. For full enterprise-grade key management:
- **AWS KMS:** use a KMS-backed signer with the peaq SDK directly
- **Fireblocks:** API signer integration
- **Safe (multisig):** for operator wallets controlling many machines

For now: use OWS for testnet and early production; migrate to KMS before high-value load.

---

## Machine activation {#activation}

### Self-managed mode

The machine holds its own private key and signs all transactions.

**When to use:** machine has reliable connectivity, root access, and you want simplicity.

```bash
# Basic (gas station handles funding)
peaqos activate

# Testnet (fund manually first, then skip gas station)
peaqos activate --skip-funding

# With DID metadata
peaqos activate --skip-funding \
  --doc-url https://docs.example.com/machine \
  --data-api https://api.example.com/machine \
  --visibility public
```

### Proxy-managed mode

The operator holds the machine's private key and acts on its behalf.

**When to use:** machine doesn't have root access, is a black box, or is air-gapped.
**Precondition:** operator must already be registered in self mode.

```bash
# Step 0: Ensure operator is registered first
peaqos activate --skip-funding   # operator self-registers (testnet)

# Step 1: Generate or obtain the machine's keypair
# Save machine private key to a file (chmod 600)
echo "0x<machine-private-key>" > ./machine.key
chmod 600 ./machine.key

# Step 2: Activate on behalf of the machine
peaqos activate --skip-funding \
  --for 0xMachineAddress \
  --machine-key ./machine.key \
  --doc-url https://docs.example.com/machine \
  --data-api https://api.example.com/machine
```

**Security:** `--machine-key` reads from a file, not a CLI flag, to keep the key out of shell history and `ps` output.

**What the proxy flow does differently:**
- Operator pays gas for registration and NFT mint
- Machine EOA receives the NFT (not the operator)
- Machine's own key signs the DID write step (the peaq DID precompile enforces this)
- Operator's key signs the proxy DID attributes

---

## Event submission {#events}

Submit machine events to build MCR history.

### Revenue event (machine earned money)

```bash
peaqos qualify event \
  --machine-id 42 \
  --type revenue \
  --value 123 \
  --ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --currency USD
```

`--value` is in ISO 4217 subunits: `123` = USD 1.23, `100` = HKD 1.00, `100` = JPY 100.

### Activity event (machine did work)

```bash
peaqos qualify event \
  --machine-id 42 \
  --type activity \
  --value 0 \
  --ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

### On-chain verified event (higher MCR weight)

```bash
peaqos qualify event \
  --machine-id 42 \
  --type revenue \
  --value 500 \
  --ts 1735000000 \
  --trust onchain \
  --source-tx 0xabc...def
```

`--source-tx` is required with `--trust onchain`. It's the 32-byte tx hash on the source chain that proves the event happened.

### Timestamp rules

- Use a timestamp at or **before** the current block time. Future timestamps revert with `FutureTimestamp`.
- Both Unix seconds (`1735000000`) and ISO 8601 with timezone (`2026-04-22T12:00:00Z`) are accepted.

---

## Queries and fleet management {#queries--fleet-management}

### Check a machine's MCR

```bash
peaqos qualify mcr did:peaq:0x<machine-address>

# Machine-readable output
peaqos qualify mcr did:peaq:0x<machine-address> --json | jq '.mcr_score'
```

### Inspect a machine's full profile

```bash
peaqos show machine did:peaq:0x<machine-address>
```

Shows: machine ID, operator DID, DID attributes, MCR snapshot, recent events.

### List an operator's fleet

```bash
peaqos show operator machines did:peaq:0x<operator-address>
```

Shows tabular output: peaqID, Machine ID, MCR score, Rating.

### Fleet management recipes

**Count machines in fleet:**
```bash
peaqos show operator machines did:peaq:0x<operator> --json | jq '.machines | length'
```

**Get MCR scores for all machines:**
```bash
peaqos show operator machines did:peaq:0x<operator> --json | jq '.machines[] | {did, mcr_score, mcr}'
```

**Find machines with no rating (NR):**
```bash
peaqos show operator machines did:peaq:0x<operator> --json \
  | jq '.machines[] | select(.mcr == "NR") | .did'
```

**Find machines rated A or above:**
```bash
peaqos show operator machines did:peaq:0x<operator> --json \
  | jq '.machines[] | select(.mcr_score >= 75) | {did, mcr_score, mcr}'
```

---

## Network reference {#network-reference}

### agung testnet

| Parameter | Value |
|-----------|-------|
| `PEAQOS_NETWORK` | `testnet` |
| Chain ID | 9990 |
| RPC URL | `https://peaq-agung.api.onfinality.io/public` |
| MCR API | `https://mcr.peaq.xyz` |
| Gas Station | Not available — use web faucet |
| Block explorer | https://testnet.peaqscan.xyz/ |
| Faucet | https://docs.peaq.xyz/peaqchain/build/getting-started/get-test-tokens |
| `IDENTITY_REGISTRY_ADDRESS` | `0x9E9463a65c7B74623b3b6Cdc39F71be7274e5971` |
| `IDENTITY_STAKING_ADDRESS` | `0x55f336714aDb0749DbFE33b057a1702405564E3d` |
| `EVENT_REGISTRY_ADDRESS` | `0x2DAD8905380993940e340C5cE6d313d5c2780040` |
| `MACHINE_NFT_ADDRESS` | `0xB41C2A4f1c19b6B06beaAce0F5CD8439e77C4b1c` |
| `DID_REGISTRY_ADDRESS` | `0x0000000000000000000000000000000000000800` |
| `BATCH_PRECOMPILE_ADDRESS` | `0x0000000000000000000000000000000000000805` |

### mainnet

| Parameter | Value |
|-----------|-------|
| `PEAQOS_NETWORK` | `mainnet` |
| Chain ID | 3338 |
| RPC URL | `https://peaq.api.onfinality.io/public` |
| MCR API | `https://api.peaqos.io` |
| Gas Station | `https://depinstation.peaq.xyz` |
| Contract addresses | Fetched automatically by `peaqos init` from GitHub |
