# peaqOS CLI Reference

Full reference for the `peaqos` command. All commands require the CLI to be installed
and `.env` to be configured (or env vars exported). Run `peaqos --help` for live help text.

Install:
```bash
python3 -m venv .peaqos-env
source .peaqos-env/bin/activate
pip install peaq-os-cli
```

---

## Global flags

| Flag | Effect |
|------|--------|
| `--version` | Print CLI and SDK versions |
| `-v` / `--verbose` | Enable DEBUG logging to stderr |
| `-q` / `--quiet` | Suppress progress output; only print errors |
| `-h` / `--help` | Help for any command |

---

## `peaqos init`

Interactive wizard that writes a `.env` file.

```bash
peaqos init                    # interactive
peaqos init --non-interactive  # read all values from existing env vars
peaqos init --force            # overwrite existing .env without prompting
```

**Prompts (interactive mode):**
1. Network (`mainnet` / `testnet`)
2. Private key source (`paste` / `generate` / `wallet`)
3. RPC URL (default shown per network)
4. MCR API URL
5. Gas Station URL
6. Contract addresses (mainnet: fetched from GitHub; testnet: entered manually)

Finishes by running `peaqos whoami` to verify the config loaded correctly.

**Private key source options:**
- `paste` — enter an existing raw private key; written as `PEAQOS_PRIVATE_KEY` in `.env`
- `generate` — generates a fresh secp256k1 keypair; key printed once to stderr, written to `.env`
- `wallet` — creates an OWS encrypted vault wallet (requires `pip install "peaq-os-sdk[ows]"`); writes `PEAQOS_OWS_WALLET=<name>` to `.env` instead of a raw key

**Notes:**
- Mainnet contract addresses are fetched automatically from the peaq GitHub repo.
- Testnet (agung) addresses must be entered manually — use values from `examples/.env.example`.
- Gas Station is not available on agung testnet — leave blank and use `--skip-funding`.

---

## `peaqos whoami`

Print the active wallet address, network, chain ID, and all contract addresses.

```bash
peaqos whoami
```

Output:
```
  Address :  0xAbCd...1234
  Network :  testnet
  RPC URL :  https://peaq-agung.api.onfinality.io/public
  Chain ID:  9990
  MCR API :  https://mcr.peaq.xyz

  Contracts:
    IdentityRegistry:  0x9E94...5971
    IdentityStaking :  0x55f3...564E
    EventRegistry   :  0x2DAD...0040
    MachineNFT      :  0xB41C...b1c
    DID Registry    :  0x0000...0800
    Batch Precompile:  0x0000...0805
```

Exit code 3 if any required env var is missing.

---

## `peaqos activate`

End-to-end machine onboarding in 6 steps.

```bash
# Self-managed mode (machine = operator)
peaqos activate

# Self-managed, skip funding (testnet — fund via web faucet first)
peaqos activate --skip-funding

# Proxy-managed mode
peaqos activate --for 0xMachineAddress --machine-key ./machine.key

# Proxy-managed, skip funding
peaqos activate --for 0xMachineAddress --machine-key ./machine.key --skip-funding
```

**Flags:**

| Flag | Default | Purpose |
|------|---------|---------|
| `--for <address>` | — | Machine EOA address. Triggers proxy mode. Requires `--machine-key`. |
| `--machine-key <path>` | — | Path to file containing machine's 0x-prefixed hex private key. Required with `--for`. |
| `--doc-url <url>` | `""` | Documentation URL written to machine DID |
| `--data-api <url>` | `""` | Data API URL written to machine DID |
| `--visibility` | `public` | `public` / `private` / `onchain` |
| `--skip-funding` | false | Skip steps 1–3 (balance check, 2FA, gas station). Use on testnet. |

**The 6 steps:**

| Step | Name | What happens |
|------|------|-------------|
| 1 | Balance check | Reads wallet balance(s). Flags wallets below 0.5 PEAQ. |
| 2 | 2FA enrollment | Renders QR code in terminal for authenticator app. Prompts for TOTP code. |
| 3 | Gas station funding | Calls gas station with TOTP to fund insufficient wallets. |
| 4 | Register machine | Calls `IdentityRegistry.registerMachine()` or `registerFor(machineAddress)`. Returns machine ID. |
| 5 | Mint NFT | Calls `MachineNFT.mintNft(machineId, recipient)`. Returns token ID. |
| 6 | Write DID attributes | Writes 6 machine DID attributes. In proxy mode, machine key signs this step. |

**Idempotent:** Re-running `activate` against an already-activated machine is safe — each step
checks on-chain state and skips if already complete. Exit 0 with no transactions submitted.

**Proxy precondition:** In proxy mode, the operator must already be registered (have run
`peaqos activate` in self mode first). Fails fast with exit 2 if not.

**Output streams:**
- `stdout`: Final summary (Machine ID, Token ID, Machine DID)
- `stderr`: Step-by-step progress (`[1/6]`, `[2/6]`, …)

**Idempotency log:** Appends JSONL entries to `./peaqos.log` — useful for audit and partial-failure recovery.

**Example output (self mode, first run):**
```
[1/6] Balance check
  Operator 0xDC5b...17B5: 1.0000 PEAQ (sufficient)
[2/6] 2FA enrollment - skipped (all wallets funded)
[3/6] Fund from Gas Station - skipped (all wallets funded)
[4/6] Register machine
  Registered. machine_id=42
[5/6] Mint NFT
  Minted NFT for machine_id=42 -> token_id=11 (tx 0x...)
[6/6] Write DID attributes
  Wrote 6 machine DID attributes (tx 0x...)

Machine activated successfully.
  Machine ID:   42
  Token ID:     11
  Machine DID:  did:peaq:0xDC5b20847F43d67928F49Cd4f85D696b5A7617B5
```

---

## `peaqos qualify event`

Submit a single machine event to the EventRegistry.

```bash
# Revenue event (self-reported)
peaqos qualify event --machine-id 42 --type revenue --value 123 --ts 1735000000

# Activity event with ISO timestamp
peaqos qualify event --machine-id 42 --type activity --value 0 --ts "2026-04-22T12:00:00Z"

# On-chain verified revenue event
peaqos qualify event --machine-id 42 --type revenue --value 500 --ts 1735000000 \
  --trust onchain --source-tx 0xabc...def

# With currency code (non-USD)
peaqos qualify event --machine-id 42 --type revenue --value 1000 --ts 1735000000 \
  --currency HKD
```

**Required flags:**

| Flag | Purpose |
|------|---------|
| `--machine-id <n>` | Machine ID from activation (positive integer) |
| `--type revenue\|activity` | Event type |
| `--value <n>` | Value in ISO 4217 subunits (e.g. USD cents). Must be ≥ 0. |
| `--ts <timestamp>` | Unix seconds or ISO 8601 with timezone (e.g. `2026-04-22T12:00:00Z`) |

**Optional flags:**

| Flag | Default | Purpose |
|------|---------|---------|
| `--trust self\|onchain\|hardware` | `self` | Trust level |
| `--source-chain same\|peaq\|base` | `same` | Source chain |
| `--source-tx <hash>` | — | 32-byte source tx hash. Required when `--trust onchain`. |
| `--raw-data <file>` | — | File path; bytes are hashed and stored as data hash |
| `--metadata <file>` | — | File path; bytes attached as on-chain metadata |
| `--currency <code>` | SDK default | Currency code (e.g. `USD`, `HKD`). Revenue defaults to `USD`. Activity should be `""`. |

**Important:** `--value` is always in subunits. HK$1.23 → `--value 123 --currency HKD`.
Using whole numbers here is a common mistake — 1000 means $10.00 USD, not $1000.00.

**Output:**
```
Event submitted.
  Machine ID:   42
  Type:         revenue
  Value:        123
  Trust:        self-reported
  Tx:           0x3f4a...
  Data Hash:    0xa1b2...
```

---

## `peaqos qualify mcr`

Fetch the Machine Credit Rating for a DID.

```bash
peaqos qualify mcr did:peaq:0x9a5F1E244c15e491Ae571c5bF77fDD836ddc37C5
peaqos qualify mcr did:peaq:0x9a5F1E244c15e491Ae571c5bF77fDD836ddc37C5 --json
```

DID format: `did:peaq:0x` followed by exactly 40 hex characters.

`--json` emits raw JSON to stdout for scripting. Human output includes:
Rating, Score, Bond Status, event counts (Total/Revenue/Activity), 30-day revenue trend,
last updated timestamp, and FX degraded flag.

**FX Degraded:** `yes` means at least one scored event used a degraded FX source
(stale exchange rate or outage). Score may be conservative — not a failure.

---

## `peaqos show machine`

Full on-chain profile for a machine DID.

```bash
peaqos show machine did:peaq:0x<40-hex>
peaqos show machine did:peaq:0x<40-hex> --json
```

Displays: Machine ID, Operator DID, DID attributes (doc URL, data visibility), MCR snapshot
(rating, score, bond status), and recent event summary.

---

## `peaqos wallet`

Manage OWS (Open Wallet Standard) encrypted vault wallets. Requires `pip install "peaq-os-sdk[ows]"`. Without OWS installed, all wallet subcommands exit with code 3 and an install hint.

Wallets are stored encrypted in `~/.ows/wallets/`, protected by a vault passphrase. The passphrase is prompted interactively or read from `OWS_PASSPHRASE` env var.

### `peaqos wallet create <name>`

Create a new BIP-39 mnemonic-backed wallet.

```bash
peaqos wallet create my-operator
peaqos wallet create my-operator --words 24
peaqos wallet create my-operator --json
```

**Flags:**

| Flag | Default | Purpose |
|------|---------|---------|
| `--words 12\|24` | `12` | Mnemonic word count |
| `--json` | false | Machine-readable output |

Prompts for vault passphrase. Prints address and mnemonic — **save the mnemonic immediately**.

### `peaqos wallet import <name>`

Import an existing wallet from a mnemonic or private key file.

```bash
peaqos wallet import my-operator --mnemonic
peaqos wallet import my-operator --private-key-file ./key.txt
peaqos wallet import my-operator --mnemonic --index 1
```

**Flags:**

| Flag | Default | Purpose |
|------|---------|---------|
| `--mnemonic` | — | Prompt for BIP-39 mnemonic phrase |
| `--private-key-file <path>` | — | Path to file containing 0x-prefixed hex private key |
| `--index <n>` | `0` | HD derivation index |
| `--json` | false | Machine-readable output |

### `peaqos wallet list`

List all wallets in the vault.

```bash
peaqos wallet list
peaqos wallet list --json
```

### `peaqos wallet show <name>`

Display wallet details and all chain addresses.

```bash
peaqos wallet show my-operator
peaqos wallet show my-operator --json
```

### `peaqos wallet export <name>`

Export the wallet's recovery phrase. Requires interactive confirmation.

```bash
peaqos wallet export my-operator
```

### `peaqos wallet delete <name>`

Securely delete a wallet from the vault. Requires interactive confirmation.

```bash
peaqos wallet delete my-operator
```

### `peaqos wallet use <name>`

Set a wallet as the active default. Writes `PEAQOS_OWS_WALLET=<name>` to `.env`.

```bash
peaqos wallet use my-operator
```

---

## `peaqos show operator machines`

List all machines managed by an operator DID.

```bash
peaqos show operator machines did:peaq:0x<40-hex>
peaqos show operator machines did:peaq:0x<40-hex> --json
```

Output: tabular list of `peaqID`, `Machine ID`, `MCR score`, `Rating`.

---

## Environment variables

All commands read from `.env` in the working directory (loaded automatically) or from shell env vars.

| Variable | Required | Purpose |
|----------|----------|---------|
| `PEAQOS_PRIVATE_KEY` | Yes (write commands, if not using OWS) | Operator private key (0x-prefixed hex) |
| `PEAQOS_OWS_WALLET` | Yes (write commands, if not using raw key) | OWS wallet name — alternative to `PEAQOS_PRIVATE_KEY` |
| `OWS_PASSPHRASE` | No | Vault passphrase for OWS wallets; prompted interactively if absent |
| `PEAQOS_NETWORK` | Yes | `mainnet` or `testnet` |
| `PEAQOS_RPC_URL` | No | Override RPC endpoint |
| `PEAQOS_GAS_STATION_URL` | No | Gas station URL (not needed with `--skip-funding`) |
| `PEAQOS_MCR_API_URL` | No | Override MCR API URL |
| `IDENTITY_REGISTRY_ADDRESS` | Yes | IdentityRegistry contract |
| `IDENTITY_STAKING_ADDRESS` | Yes | IdentityStaking contract |
| `EVENT_REGISTRY_ADDRESS` | Yes | EventRegistry contract |
| `MACHINE_NFT_ADDRESS` | Yes | MachineNFT contract |
| `DID_REGISTRY_ADDRESS` | Yes | DID precompile (usually `0x0000...0800`) |
| `BATCH_PRECOMPILE_ADDRESS` | Yes | Batch precompile (usually `0x0000...0805`) |

---

## Exit codes

| Code | Meaning | Common causes |
|------|---------|---------------|
| 0 | Success | — |
| 1 | User / validation error | Bad flag values, invalid DID, missing `--source-tx` with onchain trust |
| 2 | Network / RPC / on-chain error | Connection failure, tx revert, API 404/503 |
| 3 | Config error | Missing env var, invalid private key |
