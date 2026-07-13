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
7. **Orchestration API URL** — base URL of the Machine Markets API. Default is empty; paste the value provided by your platform admin, or leave blank if you're not using Scale yet (every other phase works without it).
8. **Orchestration API key** — hidden input. Default is empty; only set this if your deployment requires it. An `AUTH_REQUIRED` error on a later Scale command is the signal to come back and add it.

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

Prompts for vault passphrase. Prints the address and stores the encrypted wallet in `~/.ows/`. **The mnemonic is not displayed during creation** — back it up immediately afterward with `peaqos wallet export <name>` (requires interactive confirmation) and store the phrase somewhere safe.

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

## `peaqos stream`

Data-stream commands (CLI 0.0.5+; `distribute`/`pay`/`payproof` and `consume --download-url` require **0.0.6+**). A machine's data is chunked, encrypted per chunk (XChaCha20-Poly1305), and signed as a chain (Ed25519); buyers get the chunk keys re-wrapped to their X25519 public key. The crypto commands (`publish`, `grant`, `consume` in local mode) are offline — no wallet, no on-chain writes. The paid-flow commands (`distribute`, `pay`, `payproof`) talk to HTTP endpoints and chains.

**Key files:** all keys are passed as **file paths**, never inline — X25519 keys are 64 hex chars (optional `0x` prefix), one per line. Generate and guard them like private keys.

### `peaqos stream publish`

Seller: chunk, encrypt, and sign a data file into an output directory. Writes `chunk-<i>.json` (envelope) + `chunk-<i>.bin` (ciphertext) per chunk plus a `manifest.json` (`peaq.stream.chunks.v1`).

```bash
peaqos stream publish \
  --input ./telemetry.bin \
  --output-dir ./out \
  --owner-public-key 0x<64hex> \
  --operator-public-key 0x<64hex> \
  --machine-public-key 0x<64hex> \
  --signing-key-file ./machine-ed25519.key \
  --machine-did did:peaq:0x<40hex> \
  --machine-key-id "did:peaq:0x<40hex>#keys-1"
```

**Required:** `--input` (file path or http(s) URL), `--output-dir`, the three X25519 recipient public keys (owner/operator/machine), `--signing-key-file` (Ed25519 private key file), `--machine-did`, `--machine-key-id`.

**Optional:** `--chunk-size` (bytes, default `262144`), `--json`, and S3 upload: `--s3 s3://bucket/prefix/`, `--s3-region`, `--s3-endpoint` (MinIO/R2). S3 needs `pip install "peaq-os-cli[s3]"` plus `PEAQOS_S3_ACCESS_KEY_ID` / `PEAQOS_S3_SECRET_ACCESS_KEY` (or the boto3 chain).

**Exit codes:** 0 success · 1 validation (bad key hex, missing input) · 2 URL download or S3 upload failure

### `peaqos stream grant`

Seller: re-wrap the chunk keys for one buyer — fully offline, a local re-key, not an on-chain grant. Writes `peaq.stream.buyer-access.v1` files.

```bash
peaqos stream grant \
  --chunk-dir ./out \
  --buyer-public-key 0x<64hex> \
  --buyer-id did:peaq:0x<buyer> \
  --owner-private-key-file ./owner-x25519.key \
  --output-dir ./buyer-access
```

**Optional:** `--max-file-size` (bytes per access file, default `512000`), `--json`.

**Exit codes:** 0 success · 1 validation · 2 key-commitment mismatch (**wrong owner key** — the most common failure)

### `peaqos stream consume`

Buyer: verify, decrypt, and reassemble purchased data. Two input modes:

```bash
# Local mode — offline
peaqos stream consume \
  --chunk-dir ./out --access-dir ./buyer-access --data-dir ./out \
  --buyer-private-key-file ./buyer-x25519.key \
  --buyer-id did:peaq:0x<buyer> \
  --output ./recovered.bin

# Remote mode (0.0.6+) — fetch a self-contained release bundle
peaqos stream consume \
  --download-url "https://bundles.example.com/releases/ord-001/" \
  --buyer-private-key-file ./buyer-x25519.key \
  --buyer-id did:peaq:0x<buyer> \
  --output ./recovered.bin
```

- `--download-url` is **mutually exclusive** with `--chunk-dir`/`--access-dir`/`--data-dir`. The URL must serve a **self-contained release package** — chunk envelopes + `.bin` blobs + access files — as a `manifest.json` file listing or a ZIP archive.
- ⚠️ `--download-url` does **not** accept the pre-signed URL printed by `peaqos stream distribute` — that URL delivers only the buyer-access files. A full distribute→consume roundtrip needs a self-hosted bundle.
- Optional: `--work-dir` / `--keep-files` (remote mode), `--skip-verify` (debugging only), `--json`.

**Exit codes:** 0 success · 1 validation (missing dirs, `--download-url` combined with a dir flag) · 2 decryption/integrity/download failure. Error messages are specific: `access not granted for this buyer private key` = wrong buyer key; `No buyer access for chunk N` = `--buyer-id` doesn't match the access files.

### `peaqos stream distribute` (0.0.6+)

Seller: wait for a buyer's payment confirmation, then auto-generate access files (same re-key as `grant`) and deliver them to S3, returning a pre-signed download URL. Polls `--confirmation-url` every `--poll-interval`s (default 30) until confirmed or `--timeout`s (default 3600). The endpoint must return JSON with `status`, `buyer_id`, `buyer_public_key_hex`.

```bash
peaqos stream distribute \
  --chunk-dir ./out \
  --owner-private-key-file ./owner-x25519.key \
  --confirmation-url https://api.example.com/orders/ord-001/status \
  --order-id ord-001 \
  --delivery s3 \
  --s3 s3://my-bucket/distributes/
```

**Required:** `--chunk-dir`, `--owner-private-key-file`, `--confirmation-url`, `--order-id`, `--delivery` (**only `s3`** — the SDK's P2P delivery channel has no CLI flag), `--s3`.

**Optional:** `--poll-interval`, `--timeout`, `--s3-region`, `--s3-endpoint`, `--presign-expiry` (default 3600), `--max-file-size`, `--json`.

**Exit codes:** 0 success · 1 validation · 2 confirmation timeout or S3 failure · 3 `boto3` missing (`pip install "peaq-os-cli[s3]"`)

### `peaqos stream pay` (0.0.6+)

Buyer: transfer tokens on-chain to the seller — native or ERC-20/SPL on `peaq`, `base`, or `solana` — and optionally submit the tx hash as proof in the same run. Without `--confirmation-url`, only the transfer runs and the CLI prints the matching `payproof` command. The tx hash always prints before the proof step, so it survives a failed proof.

```bash
peaqos stream pay \
  --seller-address 0x<seller> \
  --amount 1.0 \
  --chain base \
  --order-id order-002 \
  --rpc-url https://mainnet.base.org \
  --token-address 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
  --confirmation-url https://api.example.com/payments/proof
```

**Required:** `--seller-address` (EVM `0x…` or Solana base58), `--amount` (human-readable), `--chain`, `--order-id`.

**Optional:** `--confirmation-url`, `--token-address` (omit for native token), `--token-decimals`, `--rpc-url` (**required** for `base` and `solana`), `--private-key-file` (falls back to `PEAQOS_PRIVATE_KEY`), `--json`.

Solana support needs `pip install "peaq-os-sdk[solana]"`.

**Exit codes:** 0 success · 1 validation/signing (never leaks key material) · 2 insufficient balance, revert, or proof HTTP failure · 3 config

### `peaqos stream payproof` (0.0.6+)

Buyer: submit proof for a transfer done outside `stream pay`, or retry a failed proof step.

```bash
peaqos stream payproof \
  --tx-hash 0x<hash> --order-id order-001 \
  --confirmation-url https://api.example.com/payments/proof \
  --chain peaq --payer-address 0x<payer> --payee-address 0x<seller> \
  --amount 10.5
```

**Required:** `--tx-hash`, `--order-id`, `--confirmation-url`, `--chain`, `--payer-address`, `--payee-address`, `--amount` (must match the transfer). **Optional:** `--token`, `--token-address`, `--json`.

---

## `peaqos scale`

Machine Market orchestration commands. All `scale` subcommands require `PEAQOS_ORCHESTRATION_URL`. `PEAQOS_ORCH_API_KEY` is optional — only needed if the deployment requires platform API key auth.

> **SDK note:** If using the Python SDK directly (`PeaqosClient`), the equivalent env var is `PEAQOS_API_KEY` (not `PEAQOS_ORCH_API_KEY`). Both hold the same platform API key value — the names differ between the CLI and the SDK.

> **Auth modes:** Scale commands use two auth mechanisms. Platform commands (machine CRUD, list, status, order list) use the platform API key (`PEAQOS_ORCH_API_KEY`) if configured. Agent commands (search, order create/execute, order received, order dispute) authenticate with the pairing token via `x-agent-pairing-token` and always require `--pairing-token-file`.

### `peaqos scale machine onboard`

Register a machine in the Machine Market. Distinct from `peaqos activate` — on-chain identity must exist first.

```bash
peaqos scale machine onboard \
  --identity-ref did:peaq:0x<40-hex> \
  --display-name "Solar Inverter #4821" \
  --owner-id <owner-id> \
  --machine-type edge-node \
  --runtime-profile linux-docker \
  --capabilities inference,data-feed \
  --skill-keys oracle.price-feed \
  --labels env=production,region=eu \
  --identity-key-file ./controller.key
```

**Flags:**

| Flag | Required | Purpose |
|------|----------|---------|
| `--identity-ref` | Yes | DID (`did:peaq:0x...`) or `peaqos:machine:<id>` |
| `--display-name` | Yes | Human-readable machine name |
| `--owner-id` | Yes | Operator/owner identifier |
| `--machine-type` | Yes | e.g. `edge-node`, `robot`, `sensor` |
| `--runtime-profile` | Yes | e.g. `linux-docker` |
| `--capabilities` | No | Comma-separated capability list |
| `--skill-keys` | No | Skill keys the machine supports |
| `--labels` | No | `key=value` pairs, comma-separated |
| `--identity-key-file` | No | DID controller private key for signing |
| `--identity-signature-file` | No | Pre-signed EIP-191 signature file (mutually exclusive with `--identity-key-file`) |
| `--skip-activate` | No | Register in draft status without activating |
| `--yes` / `-y` | No | Skip confirmation prompt |
| `--json` | No | Machine-readable output (requires non-interactive signing) |

**Signing modes (checked in order):**
1. `--identity-signature-file` — pre-signed signature from file
2. `--identity-key-file` — sign with provided private key
3. OWS wallet active — sign via active OWS wallet automatically
4. Manual fallback — CLI prompts to paste EIP-191 signature

**Exit codes:** 0 success · 1 validation error · 2 API/proof error · 3 config error (missing `PEAQOS_ORCHESTRATION_URL`)

---

### `peaqos scale machine status`

Check a machine's status in the Market.

```bash
peaqos scale machine status <machine-id>
peaqos scale machine status <machine-id> --json
```

---

### `peaqos scale machine list`

List machines registered in the Market.

```bash
peaqos scale machine list
peaqos scale machine list --json
```

---

### `peaqos scale agent pair`

Pair an AI agent to a machine via the challenge-sign flow. Produces a **one-time pairing token** — store it securely immediately.

```bash
peaqos scale agent pair \
  --machine-id <id> \
  --agent-address 0x<address> \
  --agent-provider teneo \
  --agent-role machine-market-buyer \
  --agent-did did:pkh:eip155:1:0x<address> \
  --per-tx-limit 10.00 \
  --daily-limit 100.00 \
  --currency USD \
  --allowed-skills oracle.price-feed \
  --agent-signature-file ./agent.sig
```

**Flags:**

| Flag | Required | Purpose |
|------|----------|---------|
| `--machine-id` | Yes | Machine to pair to |
| `--agent-address` | Yes | Agent's on-chain address |
| `--agent-provider` | Yes | Provider identifier (e.g. `teneo`) |
| `--agent-role` | Yes | e.g. `machine-market-buyer` |
| `--agent-did` | No | Agent DID |
| `--agent-signature-file` | No | Pre-signed challenge signature (required for `--json` mode) |
| `--description` | No | Human-readable pairing description |
| `--per-tx-limit` | No | Max spend per transaction |
| `--daily-limit` | No | Max daily spend |
| `--currency` | No | Budget currency (e.g. `USD`) |
| `--allowed-skills` | No | Comma-separated allowed skill keys |
| `--denied-skills` | No | Comma-separated denied skill keys |
| `--allowed-service-ids` | No | Comma-separated allowed service IDs |
| `--denied-service-ids` | No | Comma-separated denied service IDs |
| `--yes` / `-y` | No | Skip confirmation |
| `--json` | No | Machine-readable output |

**Exit codes:** 0 success · 1 validation error · 2 API/proof error · 3 config error

---

### `peaqos scale search`

Search the Machine Market for services matching a task.

```bash
peaqos scale search \
  --machine-id <id> \
  --service-type oracle.price-feed \
  --pairing-token-file ./pairing.token \
  --operation get-latest-price \
  --capabilities realtime,verified \
  --region eu-west \
  --budget-amount 5.00 \
  --budget-max 10.00 \
  --budget-currency USD \
  --max-results 5
```

**Flags:**

| Flag | Required | Purpose |
|------|----------|---------|
| `--machine-id` | Yes | Machine performing the search |
| `--service-type` | Yes | Service type (e.g. `oracle.price-feed`) |
| `--pairing-token-file` | Yes | Path to agent pairing token file |
| `--agent-pairing-id` | No | Agent pairing ID |
| `--operation` | No | Desired operation (e.g. `get-latest-price`) |
| `--capabilities` | No | Required capabilities, comma-separated |
| `--region` | No | Preferred region |
| `--max-results` | No | Max quotes to return |
| `--budget-amount` | No | Budget amount |
| `--budget-max` | No | Maximum budget amount |
| `--budget-currency` | No | Budget currency (e.g. `USD`) |
| `--native-only` | No | Require native execution (no external handoff) |
| `--allow-handoff` | No | Allow external handoff |
| `--provider-credentials` | No | Path to JSON file with provider credentials |
| `--json` | No | Machine-readable output |

Returns a ranked table of quotes. Output includes `search_id` and per-quote `quote_id`, `service_id`, `operation`, `score`, `execution_mode`.

**Exit codes:** 0 success · 1 validation error · 2 API error · 3 config error (missing URL)

---

### `peaqos scale order <service-id>`

Place a market order for a service. `<service-id>` is the UUID from a search result.

```bash
peaqos scale order <service-id> \
  --machine-id <id> \
  --agent-pairing-id <pairing-id> \
  --pairing-token-file ./pairing.token \
  --search-id <search-id> \
  --quote-id <quote-id> \
  --operation get-latest-price \
  --input ./input.json \
  --budget-amount 5.00 \
  --budget-currency USD
```

**Payment flags:**

| Flag | Purpose |
|------|---------|
| `--payment-tx-hash` | Pre-completed payment tx hash |
| `--payment-chain` | Chain for payment proof (required with `--payment-tx-hash`) |
| `--payment-token` | Token for payment proof (required with `--payment-tx-hash`) |
| `--skip-payment` | Skip payment step (requires `--payment-tx-hash`) |

**Payment flows:**
- **No payment required**: 2-step create → execute
- **Wallet payment (EVM)**: 5-step create → intent → send → proof/escrow → execute. OWS wallets handle EVM transfers automatically.
- **Pre-completed**: pass `--payment-tx-hash` + `--payment-chain` + `--payment-token` with `--skip-payment`
- **x402 (CLI 0.0.6+)**: 6-step create → intent → sign → proof → execute → confirm, used by paid-HTTP Agentic Market providers (e.g. Wolfram Alpha over USDC on Base). The CLI signs the provider's payment challenge **locally** with the active wallet (OWS wallet when `PEAQOS_OWS_WALLET` is set, otherwise the local key) and hands the signed `PAYMENT-SIGNATURE` header to peaqOS, which pays the provider during execute. **No separate on-chain transfer and no tx-hash prompt**; delivery is confirmed automatically in step 6. If execution fails after proof is recorded, the error shows the current payment status — run `peaqos scale order status <id>` to check whether the authorization is held.

Set `PEAQOS_ORDER_STEP_DELAY_SEC` to pause between placement steps (demos, eventually-consistent state); unset = no delay.

**Exit codes:** 0 success · 1 validation error · 2 API/payment error · 3 config error

---

### `peaqos scale order status`

Check the status of a market order.

```bash
peaqos scale order status <order-id>
peaqos scale order status <order-id> --json
```

---

### `peaqos scale order list`

List market orders for a machine. Uses platform auth — no pairing token needed.

```bash
peaqos scale order list --machine-id <id>
peaqos scale order list --machine-id <id> --json
peaqos scale order list --machine-id <id> --limit 10 --cursor <cursor>
```

---

### `peaqos scale order received`

Confirm delivery of a market order. Releases held payment to the provider.

```bash
peaqos scale order received <order-id> --pairing-token-file ./pairing.token
```

---

### `peaqos scale order dispute`

Dispute a market order. Freezes payment pending resolution.

```bash
peaqos scale order dispute <order-id> \
  --reason "Service output did not match expected schema" \
  --pairing-token-file ./pairing.token
```

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
| `PEAQOS_ORCHESTRATION_URL` | Yes (Scale commands) | Base URL of the Machine Markets API |
| `PEAQOS_ORCH_API_KEY` | No (Scale commands) | Platform API key for orchestration — optional, only required if deployment enforces API key auth |
| `PEAQOS_S3_ACCESS_KEY_ID` | No (`stream publish --s3` / `stream distribute`) | S3 credentials; the standard boto3 chain works too |
| `PEAQOS_S3_SECRET_ACCESS_KEY` | No | Paired with the above |
| `PEAQOS_S3_REGION` | No | Default S3 region for stream uploads |
| `PEAQOS_ORDER_STEP_DELAY_SEC` | No | Seconds to pause between `scale order` placement steps (unset = no delay) |
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
