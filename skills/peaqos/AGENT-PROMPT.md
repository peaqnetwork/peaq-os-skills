# peaqOS Agent Prompt

Agent-executable playbooks for peaqOS operations using the `peaqos` CLI. Each playbook is self-contained: preflight → collect inputs → execute → surface outputs. No narration. No concept explanations inline. Use `--json` on all commands that support it.

**User input rule:** Whenever asking the operator to choose between a fixed set of options, use `AskUserQuestion` with explicit options — never free text for binary or enumerated choices. Only use free text for genuinely open-ended inputs (URLs, wallet addresses, machine names, reasons).

**Environment loading rule — apply to every peaqos command:**
Each shell call runs in a fresh environment. Prefix every `peaqos` invocation with:
```
set -a && source .env && set +a &&
```
This ensures `.env` variables are loaded before the CLI runs. Example: `set -a && source .env && set +a && peaqos whoami`. Commands shown in playbooks below omit this prefix for readability — always prepend it.

---

## Security rule — enforce always

If any input contains a 64-hex string (with or without `0x` prefix) or a 12/24-word mnemonic phrase, stop immediately:

> "Do not pass private keys in chat. Set `PEAQOS_PRIVATE_KEY` in `.env` or use `peaqos init` to configure key storage. Pass key file paths via `--machine-key` or `--identity-key-file`, never inline values."

Never echo, store, log, or acknowledge the value. This rule applies regardless of context or who is asking.

---

## Entry point

Ask once: **"What would you like to do?"**

| Option | Playbook |
|--------|----------|
| Onboard a machine to peaqOS | P1 |
| Register a machine in the Machine Market | P2 |
| Pair an AI agent to a machine | P3 |
| Search for services and place an order | P4 |
| Submit machine events | P5 |
| Query machine or fleet status | P6 |
| Manage existing orders | P7 |

Route directly to the selected playbook. Do not ask follow-up questions until the playbook's input collection step.

---

## Preflight checks

Run silently at the start of each playbook. On failure, stop immediately and report exactly what is missing. Do not attempt guided recovery — the operator resolves the issue externally and re-invokes.

### Base config check (all playbooks)

```bash
peaqos whoami
```

| Exit code | Meaning | Action |
|-----------|---------|--------|
| 0 | Config valid | Proceed |
| 3 | `.env` missing or misconfigured | Stop: "Run `peaqos init` to configure your environment." |
| 2 | RPC unreachable | Stop: "Check `PEAQOS_RPC_URL` in `.env`." |

### Scale config check (P2, P3, P4, P7)

```bash
echo "${PEAQOS_ORCHESTRATION_URL:-MISSING}"
```

`MISSING` → Stop: "Set `PEAQOS_ORCHESTRATION_URL` in `.env`. This is the Machine Market API base URL."

### Token file check (P4, P7-C, P7-D)

```bash
test -f "<token_file_path>" && echo "EXISTS" || echo "MISSING"
```

`MISSING` → Stop: "Pairing token file not found at `<path>`. Provide the correct path to your saved pairing token."

---

## P1 — Onboard a machine to peaqOS

Registers a machine on-chain: identity registry, NFT, DID attributes, MCR baseline event.

### Preflight

Check CLI is installed:

```bash
peaqos --version 2>/dev/null || echo "NOT_INSTALLED"
```

`NOT_INSTALLED` → Offer to install it:

> "The `peaqos` CLI is not installed. Install it now?"

If the operator confirms:

```bash
pip install peaq-os-cli
```

If that exits non-zero (e.g. permissions error), retry with:

```bash
pip install --user peaq-os-cli
```

Then verify:

```bash
peaqos --version
```

If still not found after install, stop: "Installation succeeded but `peaqos` is not on PATH. You may need to add pip's bin directory to your PATH, or activate a virtual environment. Run `peaqos --version` manually to confirm, then re-invoke the skill."

If the operator declines installation, stop — the CLI is required to proceed.

Check for existing config:

```bash
[ -f .env ] && echo "ENV_EXISTS" || echo "NO_ENV"
```

- `NO_ENV` → No environment configured yet. This is the normal starting point for a first-time onboarding. Proceed directly to Step 1 (run `peaqos init`).
- `ENV_EXISTS` → Run `peaqos whoami` to check the existing config:
  - Exit 0 → Show the configured address and network. `AskUserQuestion`: "An existing environment is configured (`<address>` on `<network>`). What would you like to do?" → `Activate a new machine with this wallet` / `Resume an interrupted activation`
  - Exit 3 → The `.env` exists but is broken. Stop: "Your `.env` is misconfigured — check `PEAQOS_PRIVATE_KEY` / `PEAQOS_OWS_WALLET` is set correctly, or re-run `peaqos init --force` to regenerate it."

### Inputs (collect all upfront)

| Input | Required | Notes |
|-------|----------|-------|
| Mode | Yes | `AskUserQuestion`: "Management mode?" → `self-managed` (wallet controls itself) / `proxy-managed` (separate operator wallet manages the machine) |
| Machine address (`--for`) | Proxy only | EVM address of the machine |
| Machine key file path (`--machine-key`) | Proxy only | Path to file containing machine's 0x-prefixed hex private key |
| Network | Yes | `mainnet` or `testnet` — confirm matches `peaqos whoami` output |
| `--doc-url` | **Effectively required** | Documentation URL for machine DID. The DID write rejects empty strings — always provide a value. Ask: "Documentation URL?" (free text). Use `https://example.com/docs` if none. |
| `--data-api` | **Effectively required** | Data API URL for machine DID. Same constraint. Ask: "Data API URL?" (free text). Use `https://example.com/api` if none. |
| `--visibility` | No | `AskUserQuestion`: "Data visibility?" → `public` (default) / `private` / `onchain` |

### Execute

**Step 1 — Configure environment** *(skip if `.env` already exists and `peaqos whoami` passed)*

Ask the operator using `AskUserQuestion`:
- "Which network?" → options: `testnet` (agung, no real funds, use faucet) / `mainnet` (requires real PEAQ)

Then generate a keypair and write `.env` in one step. The private key is written directly to disk — it never appears in this conversation.

```bash
python3 - << 'PYEOF'
import os, stat, secrets
from eth_account import Account

import sys

network = sys.argv[1] if len(sys.argv) > 1 else "testnet"
key  = "0x" + secrets.token_hex(32)
addr = Account.from_key(key).address

if network == "testnet":
    RPC_URL     = "https://peaq-agung.api.onfinality.io/public"
    MCR_URL     = "https://mcr.peaq.xyz"
    GAS_STATION = ""
    ID_REG      = "0x9E9463a65c7B74623b3b6Cdc39F71be7274e5971"
    ID_STAKE    = "0x55f336714aDb0749DbFE33b057a1702405564E3d"
    EVT_REG     = "0x2DAD8905380993940e340C5cE6d313d5c2780040"
    MACH_NFT    = "0xB41C2A4f1c19b6B06beaAce0F5CD8439e77C4b1c"
else:  # mainnet
    RPC_URL     = "https://peaq.api.onfinality.io/public"
    MCR_URL     = "https://api.peaqos.io"
    GAS_STATION = "https://depinstation.peaq.xyz"
    ID_REG      = "0xb53Af985765031936311273599389b5B68aC9956"
    ID_STAKE    = "0x11c05A650704136786253e8685f56879A202b1C7"
    EVT_REG     = "0x43c6AF2E14dc1327dc3cc6c7117D1CD72fffEcbA"
    MACH_NFT    = "0x2943F80e9DdB11B9Dd275499C661Df78F5F691F9"

# Precompiles are the same on all peaq networks
DID_REG = "0x0000000000000000000000000000000000000800"
BATCH   = "0x0000000000000000000000000000000000000805"

content = f"""# peaqOS CLI — environment configuration
# SECURITY: Never commit this file to version control.

PEAQOS_PRIVATE_KEY={key}
PEAQOS_NETWORK={network}
PEAQOS_RPC_URL={RPC_URL}
PEAQOS_MCR_API_URL={MCR_URL}
PEAQOS_GAS_STATION_URL={GAS_STATION}

IDENTITY_REGISTRY_ADDRESS={ID_REG}
IDENTITY_STAKING_ADDRESS={ID_STAKE}
EVENT_REGISTRY_ADDRESS={EVT_REG}
MACHINE_NFT_ADDRESS={MACH_NFT}
DID_REGISTRY_ADDRESS={DID_REG}
BATCH_PRECOMPILE_ADDRESS={BATCH}

PEAQOS_ORCHESTRATION_URL=
PEAQOS_ORCH_API_KEY=
"""

with open(".env", "w") as f:
    f.write(content)
os.chmod(".env", 0o600)

# Only address is safe to display — key never appears in output
print(f"{addr}:{network}")
PYEOF
```

Run as: `set -a && source .env && set +a && python3 <script> <network>` where `<network>` is `testnet` or `mainnet`.

Parse the output: `address:network` (split on `:`).

Show address to operator:
> "Wallet created. Address: `<address>`
> Your private key has been written to `.env`. **Back it up now** — run `grep PEAQOS_PRIVATE_KEY .env` in your terminal to see it, then save it somewhere safe."

**Step 2 — Verify config**

```bash
peaqos whoami
```

Confirm address and network with operator before proceeding.

**Step 3 — Activate** ⚠️ *Requires operator confirmation — irreversible on-chain action*

Before running, confirm the wallet is funded:
- **Testnet:** `AskUserQuestion`: "Wallet funded with testnet tokens?" → `Yes, ready to activate` / `No, need to fund first`. If not funded → direct to faucet: https://docs.peaq.xyz/peaqchain/build/getting-started/get-test-tokens (3 AGNG/day limit).
- **Mainnet:** `AskUserQuestion`: "Does this wallet have PEAQ tokens for gas?" → `Yes, wallet is funded` / `No, need to transfer PEAQ first`. If not funded → tell operator to transfer PEAQ to `<wallet_address>`, then confirm when ready.

Wait for confirmation before proceeding.

Use the doc-url and data-api collected in inputs. If the operator did not provide values, use placeholder URLs — do not omit these flags or step 6 will fail:

```bash
# Testnet, self-managed
peaqos activate --skip-funding \
  --doc-url <doc-url or "https://example.com/docs"> \
  --data-api <data-api or "https://example.com/api"> \
  [--visibility <mode>]

# Testnet, proxy-managed
peaqos activate --skip-funding \
  --for <machine-address> --machine-key <path> \
  --doc-url <doc-url or "https://example.com/docs"> \
  --data-api <data-api or "https://example.com/api">

# Mainnet, self-managed
peaqos activate \
  --doc-url <doc-url or "https://example.com/docs"> \
  --data-api <data-api or "https://example.com/api"> \
  [--visibility <mode>]

# Mainnet, proxy-managed
peaqos activate \
  --for <machine-address> --machine-key <path> \
  --doc-url <doc-url or "https://example.com/docs"> \
  --data-api <data-api or "https://example.com/api">
```

Notes:
- `activate` is idempotent — safe to re-run after partial failure; completed steps are skipped
- Progress goes to stderr; stdout contains Machine ID, Token ID, and Machine DID (plus Machine Address and Operator DID in proxy mode)
- Testnet: fund wallet via faucet before running; use `--skip-funding` to bypass steps 1–3
- **Mainnet interactive checkpoint:** On mainnet without `--skip-funding`, step 2 pauses and renders a QR code to the terminal. Surface this to the operator: "Open your authenticator app, scan the QR code, then enter the TOTP code when prompted." Wait for the operator to complete this step. Step 3 then calls the gas station automatically.

**Step 4 — Submit baseline event**

There is a known CLI bug where `peaqos qualify event` fails with a VM revert even when the machine is correctly staked. Use the SDK directly instead — it is more reliable for event submission:

```bash
python3 - << 'PYEOF'
import os, sys, time
from web3 import Web3
from eth_account import Account

# Explicit env var reads — avoids load_dotenv() frame issues in Python 3.14+
private_key = os.environ["PEAQOS_PRIVATE_KEY"]
rpc_url     = os.environ.get("PEAQOS_RPC_URL", "https://peaq-agung.api.onfinality.io/public")
event_reg   = os.environ["EVENT_REGISTRY_ADDRESS"]
machine_id  = int(sys.argv[1])

w3      = Web3(Web3.HTTPProvider(rpc_url))
account = Account.from_key(private_key)

# Exact ABI from EventRegistry.json — parameter order and types verified from contract source
ABI = [{"inputs":[
    {"name":"machineId",    "type":"uint256"},
    {"name":"eventType",    "type":"uint8"},
    {"name":"value",        "type":"uint256"},
    {"name":"currency",     "type":"string"},
    {"name":"timestamp",    "type":"uint256"},
    {"name":"dataHash",     "type":"bytes32"},   # dataHash BEFORE trustLevel
    {"name":"trustLevel",   "type":"uint8"},
    {"name":"sourceChainId","type":"uint256"},    # uint256, not uint8
    {"name":"sourceTxHash", "type":"bytes32"},
    {"name":"metadata",     "type":"bytes"}],
    "name":"submitEvent","outputs":[],"stateMutability":"nonpayable","type":"function"}]

contract = w3.eth.contract(address=Web3.to_checksum_address(event_reg), abi=ABI)

# Brief wait to allow bonding state to settle after activation
time.sleep(5)

tx = contract.functions.submitEvent(
    machine_id,         # machineId
    1,                  # eventType: 1=activity (0=revenue)
    0,                  # value
    "",                 # currency (empty for activity)
    int(time.time()),   # timestamp
    b'\x00'*32,         # dataHash
    0,                  # trustLevel: 0=self
    0,                  # sourceChainId: 0=same chain
    b'\x00'*32,         # sourceTxHash
    b''                 # metadata
).build_transaction({
    "from": account.address,
    "nonce": w3.eth.get_transaction_count(account.address),
    "gas": 200000,
    "gasPrice": w3.eth.gas_price,
})
signed  = account.sign_transaction(tx)
tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
print(f"tx_hash={tx_hash.hex()} status={receipt.status}")
PYEOF
```

Run as: `set -a && source .env && set +a && python3 <script> <machine-id>`

`status=1` → event landed. `status=0` → revert (wait 10s and retry once — bonding lag immediately after activate can cause transient reverts).

**Step 5 — Verify MCR**

```bash
peaqos qualify mcr <machine-did> --json
```

Poll every 15s for up to 90s. In `--json` output, read the `mcr` field. Terminate when `mcr` is any value other than `Provisioned`.

**Important:** After a fresh activation the MCR indexer takes several minutes to index a new machine, not just 90s. If `qualify mcr` returns "Machine not found" or `Provisioned` after the polling window, **this is not a failure** — the machine is registered on-chain. Stop polling, surface the outputs, and proceed. The operator can check MCR status later via P6.

### Outputs

Surface to operator on completion:

| Name | Description | Used in |
|------|-------------|---------|
| `machine_id` | Integer (e.g. `42`) | P5 event submission |
| `token_id` | NFT token ID | Reference |
| `machine_did` | `did:peaq:0x...` | P2, P6 MCR/show queries |
| `machine_address` | EVM address of the machine (proxy mode only) | Reference |
| `operator_did` | Operator DID (proxy mode only) | P6 fleet queries |

---

## P2 — Register machine in the Machine Market

Registers an on-chain machine in the Scale Machine Market. Produces a Market machine ID distinct from the on-chain integer ID.

### Preflight

- Base config check
- Scale config check
- Confirm `machine_did` is available — from P1 output or `peaqos whoami`

### Inputs (collect all upfront)

| Input | Required | Notes |
|-------|----------|-------|
| `--identity-ref` | Yes | Machine DID (`did:peaq:0x...`) from P1 |
| `--display-name` | Yes | Human-readable name |
| `--owner-id` | Yes | Operator/owner identifier |
| `--machine-type` | Yes | e.g. `edge-node`, `robot`, `sensor` |
| `--runtime-profile` | Yes | e.g. `linux-docker` |
| Signing method | Yes | See signing modes below |
| `--capabilities` | No | Comma-separated capability list |
| `--skill-keys` | No | Skill keys the machine supports, comma-separated |
| `--labels` | No | `key=value` pairs, comma-separated |

**Signing modes — ask using `AskUserQuestion`:** "How would you like to sign the identity challenge?"
- `Key file` — I have a DID controller private key file (`--identity-key-file`)
- `Pre-signed file` — I have a pre-computed EIP-191 signature file (`--identity-signature-file`)
- `OWS wallet` — `PEAQOS_OWS_WALLET` is set in `.env` (signs automatically)
- `Manual paste` — I'll paste the signature when prompted

| Mode | Condition | Flags |
|------|-----------|-------|
| Key file | Have a DID controller key file | `--identity-key-file <path>` |
| Pre-signed file | Have a pre-computed EIP-191 signature file | `--identity-signature-file <path>` |
| OWS wallet | `PEAQOS_OWS_WALLET` set in `.env` | No extra flag — signs automatically |
| Manual paste | None of the above | CLI displays challenge; operator pastes EIP-191 signature |

> Note: `PEAQOS_PRIVATE_KEY` in `.env` does **not** auto-sign the identity challenge. Without `--identity-signature-file`, `--identity-key-file`, or an OWS wallet, the CLI always falls through to manual paste. `--identity-signature-file` and `--identity-key-file` are mutually exclusive — passing both exits 1.

### Execute

⚠️ *Requires operator confirmation before registration*

```bash
# With key file (non-interactive, supports --json)
peaqos scale machine onboard \
  --identity-ref <did> \
  --display-name "<name>" \
  --owner-id <owner-id> \
  --machine-type <type> \
  --runtime-profile <profile> \
  [--capabilities <caps>] \
  [--skill-keys <keys>] \
  [--labels <labels>] \
  --identity-key-file <path> \
  --yes \
  --json

# With pre-signed file (non-interactive, supports --json)
peaqos scale machine onboard \
  --identity-ref <did> \
  --display-name "<name>" \
  --owner-id <owner-id> \
  --machine-type <type> \
  --runtime-profile <profile> \
  --identity-signature-file <path> \
  --yes \
  --json

# Manual paste (omit --json — it will exit 1 without a signing method)
peaqos scale machine onboard \
  --identity-ref <did> \
  --display-name "<name>" \
  --owner-id <owner-id> \
  --machine-type <type> \
  --runtime-profile <profile> \
  --yes
```

> Note: passing `--json` without `--identity-key-file`, `--identity-signature-file`, or an active OWS wallet exits 1 immediately — no partial state is created and it is safe to correct and retry.

### Outputs

| Name | JSON path | Description | Used in |
|------|-----------|-------------|---------|
| `market_machine_id` | `.id` | Server-assigned string — distinct from on-chain integer | P3, P4, P7 |
| `status` | `.status` | `active` or `draft` | Reference |

---

## P3 — Pair an AI agent to a machine

Creates an agent pairing and issues a one-time pairing token. Prerequisite: P2 complete.

### Preflight

- Base config check
- Scale config check
- `market_machine_id` available — from P2 output or `peaqos scale machine list --json`

### Inputs (collect all upfront)

| Input | Required | Notes |
|-------|----------|-------|
| `--machine-id` | Yes | Market machine ID (`mach_*`) from P2 |
| `--agent-address` | Yes | Agent's on-chain EVM address |
| `--agent-provider` | Yes | Provider identifier (e.g. `virtuals`, `teneo`) |
| `--agent-role` | Yes | e.g. `machine-market-buyer` |
| `--agent-did` | No | Agent DID (e.g. `did:pkh:eip155:1:0x...`) |
| `--description` | No | Human-readable pairing description |
| `--agent-signature-file` | **Required if using `--json`** | Path to pre-computed EIP-191 signature file. Optional otherwise. Passing `--json` without this flag exits 1. |
| `--per-tx-limit` | No | Max spend per transaction |
| `--daily-limit` | No | Max daily spend |
| `--currency` | No | Budget currency (e.g. `USD`) |
| `--allowed-skills` | No | Comma-separated allowed skill keys |
| `--denied-skills` | No | Comma-separated denied skill keys |
| `--allowed-service-ids` | No | Comma-separated allowed service IDs |
| `--denied-service-ids` | No | Comma-separated denied service IDs |

### Execute

```bash
# With --agent-signature-file (non-interactive, supports --json)
peaqos scale agent pair \
  --machine-id <market-machine-id> \
  --agent-address <address> \
  --agent-provider <provider> \
  --agent-role <role> \
  --agent-signature-file <path> \
  [--per-tx-limit <n>] \
  [--daily-limit <n>] \
  [--currency <code>] \
  [--allowed-skills <keys>] \
  --yes \
  --json

# Without --agent-signature-file (human mode — blocks on signature prompt)
peaqos scale agent pair \
  --machine-id <market-machine-id> \
  --agent-address <address> \
  --agent-provider <provider> \
  --agent-role <role> \
  [--per-tx-limit <n>] \
  [--daily-limit <n>] \
  [--currency <code>] \
  [--allowed-skills <keys>] \
  --yes
```

> **Signing modes:**
> - With `--agent-signature-file` + `--json`: fully non-interactive. The pairing ID is at `.id` and the pairing token is at `.pairing_token` in the JSON response. Extract: `jq -r '.id'` for pairing ID, `jq -r '.pairing_token'` for the token.
> - Without `--agent-signature-file` (human mode): the CLI prints the challenge message to stderr, then blocks on "Paste the EIP-191 signature:" prompt. Surface the challenge message to the operator, wait for them to provide the signature, enter it at the prompt. The pairing token then appears in stdout. `--yes` suppresses the "Confirm pairing?" prompt — always include it to avoid a second blocking prompt.

### ⚠️ Pairing token gate

After the command completes:

1. **Check whether a token was returned.** In human mode, look for the "!! Pairing token (shown once)" block in stdout. In `--json` mode, check that `pairing_token` in the JSON response is non-empty. If no token was returned (falsy or absent), the pairing may have been created without issuing a token — tell the operator and offer to re-run.

2. **Stop and tell the operator:** "Copy the pairing token now and save it to a file (e.g. `./pairing.token`). It cannot be recovered after this point. Confirm when saved."

Do not proceed until the operator confirms the token is saved.

### Outputs

| Name | JSON path | Description | Used in |
|------|-----------|-------------|---------|
| `pairing_id` | `.id` | Agent pairing identifier | P4, P7 |
| `pairing_token` | `.pairing_token` | Saved to file by operator | P4, P7-C, P7-D |

---

## P4 — Search for services and place an order

Full buyer flow: search → select quote → place order → confirm or dispute. Prerequisites: P3 complete, pairing token file available.

### Preflight

- Base config check
- Scale config check
- Token file check (ask operator for pairing token file path)

### Inputs (collect all upfront)

| Input | Required | Notes |
|-------|----------|-------|
| `--machine-id` | Yes | Market machine ID (`mach_*`) |
| `--agent-pairing-id` | Required for order step; optional for search step | Pairing ID from P3 — always include it since it is known and improves search context |
| `--pairing-token-file` | Yes | Path to saved token file |
| `--service-type` | Yes | Valid values: `oracle.price-feed`, `compute.marketplace`, `storage.object`, `data.location`, `network.partner-console`, `identity.proof-of-person`, `device.control`, `machine.commerce` |
| `--operation` | No | e.g. `get-latest-price` |
| `--capabilities` | No | Required capabilities, comma-separated |
| `--region` | No | Preferred region |
| `--budget-amount` | No | Budget amount |
| `--budget-max` | No | Maximum budget |
| `--budget-currency` | No | e.g. `USD` |
| `--native-only` | No | Restrict to native execution only |
| `--allow-handoff` | No | Allow external handoff services |
| `--max-results` | No | Max quotes to return |
| `--input` | No | Path to JSON operation input file |
| `--provider-credentials` | No | Path to JSON provider credentials file (never logged) |

### Execute

**Step 1 — Search**

```bash
peaqos scale search \
  --machine-id <id> \
  --service-type <type> \
  --pairing-token-file <path> \
  --agent-pairing-id <pairing-id> \
  [--operation <op>] \
  [--capabilities <caps>] \
  [--budget-amount <n> --budget-currency <code>] \
  [--native-only | --allow-handoff] \
  --json
```

From `--json` output:
- `.id` → `search_id`
- `.quotes[0].id` → `quote_id`
- `.quotes[0].service_id` → `service_id`
- `.quotes[0].payment.required` → whether payment is needed (`true`/`false`)
- `.quotes[0].execution_mode` → `"native"` or `"external-handoff"`

If `.status` is `"no_match"` or `.quotes` is empty: stop and report. Suggest: remove `--native-only`, add `--allow-handoff`, increase budget, or use a different `--service-type` value.

**Step 2 — Confirm and place order**

Show operator the lead quote: `service_id`, `skill_key`, `provider_key`, `execution_mode`, and whether payment is required (`.quotes[0].payment.required`). ⚠️ *Requires operator confirmation if `.quotes[0].payment.required` is `true`.*

```bash
peaqos scale order <service-id> \
  --machine-id <id> \
  --agent-pairing-id <pairing-id> \
  --pairing-token-file <path> \
  --search-id <search-id> \
  --quote-id <quote-id> \
  [--operation <op>] \
  [--input <path>] \
  [--provider-credentials <path>] \
  --yes \
  --json
```

> Note: `<service-id>` is a positional argument, not a flag. The CLI treats any token that is not a registered subcommand (`status`, `list`, `received`, `dispute`) as a service UUID.

Payment handling (determined from the created order's payment block — not the search quote):
- Payment not required (`order.payment.default_rail == "not-required"` AND `order.payment.required == false`) → 2-step: create → execute. No payment interaction.
- Payment required → 5-step: create → payment intent → transfer → proof/escrow-lock → execute. OWS wallet (`PEAQOS_OWS_WALLET`) handles EVM transfers automatically. **When manual payment is required**, the CLI prints payment details (amount, chain, token, payee address) and blocks waiting for a tx hash — surface this to the operator and wait for them to complete the transfer. Solana always requires manual paste.
- Pre-completed → add `--payment-tx-hash <hash> --payment-chain <chain> --payment-token <token> --skip-payment`

Note: The search quote's `.quotes[0].payment.required` is a useful pre-confirmation signal to show the operator, but the actual payment code path is determined after order creation.

From `--json` output, capture `.order.id` as `order_id`. **On partial failure** (order created but later step failed), the error message includes the order ID. Run `peaqos scale order status <id> --json` and branch:
- Error code `QUOTE_EXPIRED` → order is unresumable; run a new search
- `.payment.status` is `intent_created` or `held` and error was payment RPC error → resume with `--payment-tx-hash + --skip-payment`
- `.order.status` is `executing` or `ready` and execution failed → retry the full `peaqos scale order <service-id>` command with the same parameters

Valid `MarketOrderStatus` values: `created` · `payment_pending` · `ready` · `executing` · `delivered` · `confirmed` · `disputed` · `cancelled` · `failed` · `handoff`

**Step 3 — Confirm or dispute**

`AskUserQuestion`: "Was the service delivered as expected?"
- `Yes — confirm delivery` → runs `order received`
- `No — raise a dispute` → ask for reason (free text), then runs `order dispute`

Confirm delivery:
```bash
peaqos scale order received <order-id> --pairing-token-file <path> --json
```

Raise dispute:
```bash
peaqos scale order dispute <order-id> \
  --reason "<reason>" \
  --pairing-token-file <path> \
  [--evidence <path>] \
  --yes \
  --json
```

### Outputs

| Name | JSON path | Description |
|------|-----------|-------------|
| `order_id` | `.order.id` | Order identifier |
| `status` | `.order.status` | Final order status |
| `payment_status` | `.payment.status` | Payment state (null if no payment) |

---

## P5 — Submit machine events

Submit an on-chain event for a registered machine. Prerequisite: P1 complete.

### Preflight

- Base config check
- `machine_id` (integer) must be known — from P1 output

### Inputs (collect all upfront)

| Input | Required | Notes |
|-------|----------|-------|
| `--machine-id` | Yes | Integer from P1 (e.g. `42`) — not the Market machine ID |
| `--type` | Yes | `activity` or `revenue` |
| `--value` | Yes | Non-negative integer in ISO 4217 subunits (activity: use `0`; revenue: e.g. USD cents) |
| `--ts` | Yes | Unix seconds (`$(date +%s)`) or ISO 8601 with timezone |
| `--trust` | No | `self` (default), `onchain`, `hardware` |
| `--source-tx` | Conditional | Required when `--trust onchain`; 32-byte hex |
| `--source-chain` | No | `same` (default), `peaq`, `base` |
| `--currency` | No | Currency code (e.g. `USD`, `HKD`); omit to use SDK default (`USD` for revenue, `""` for activity). Do not pass `--currency` for activity events. |
| `--raw-data` | No | File path; contents are hashed on submit |
| `--metadata` | No | File path; contents attached as on-chain metadata |

### Execute

Try the CLI first. If it exits 2 with a VM revert error, fall back to the SDK (see below).

```bash
peaqos qualify event \
  --machine-id <id> \
  --type <type> \
  --value <value> \
  --ts <timestamp> \
  [--trust <level>] \
  [--source-tx <hash>] \
  [--currency <code>]
```

Note: `qualify event` does not support `--json`. Capture `Tx:` and `Data Hash:` from stdout.

**If CLI exits 2 with VM revert — SDK fallback:**

```bash
python3 - << 'PYEOF'
import os, sys, time
from web3 import Web3
from eth_account import Account

# Read directly from env — avoids load_dotenv() frame issues in Python 3.14+
private_key = os.environ["PEAQOS_PRIVATE_KEY"]
rpc_url     = os.environ.get("PEAQOS_RPC_URL", "https://peaq-agung.api.onfinality.io/public")
event_reg   = os.environ["EVENT_REGISTRY_ADDRESS"]

# args: machine_id event_type value [currency] [timestamp]
# event_type: 0=revenue, 1=activity
machine_id  = int(sys.argv[1])
event_type  = int(sys.argv[2])
value       = int(sys.argv[3])
currency    = sys.argv[4] if len(sys.argv) > 4 else ""
ts          = int(sys.argv[5]) if len(sys.argv) > 5 else int(time.time())

w3      = Web3(Web3.HTTPProvider(rpc_url))
account = Account.from_key(private_key)

# Exact parameter order and types from EventRegistry.json contract ABI
ABI = [{"inputs":[
    {"name":"machineId",    "type":"uint256"},
    {"name":"eventType",    "type":"uint8"},
    {"name":"value",        "type":"uint256"},
    {"name":"currency",     "type":"string"},
    {"name":"timestamp",    "type":"uint256"},
    {"name":"dataHash",     "type":"bytes32"},   # dataHash BEFORE trustLevel
    {"name":"trustLevel",   "type":"uint8"},
    {"name":"sourceChainId","type":"uint256"},    # uint256, not uint8
    {"name":"sourceTxHash", "type":"bytes32"},
    {"name":"metadata",     "type":"bytes"}],
    "name":"submitEvent","outputs":[],"stateMutability":"nonpayable","type":"function"}]

contract = w3.eth.contract(address=Web3.to_checksum_address(event_reg), abi=ABI)
tx = contract.functions.submitEvent(
    machine_id, event_type, value, currency, ts,
    b'\x00'*32,  # dataHash
    0,           # trustLevel: 0=self
    0,           # sourceChainId: 0=same chain
    b'\x00'*32,  # sourceTxHash
    b''          # metadata
).build_transaction({
    "from": account.address,
    "nonce": w3.eth.get_transaction_count(account.address),
    "gas": 200000,
    "gasPrice": w3.eth.gas_price,
})
signed  = account.sign_transaction(tx)
tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
print(f"tx_hash={tx_hash.hex()} status={receipt.status}")
PYEOF
```

Run as: `set -a && source .env && set +a && python3 <script> <machine-id> <event-type> <value> [currency] [timestamp]`

Example (activity event): `... python3 <script> 284 1 0`
Example (revenue event, USD cents): `... python3 <script> 284 2 100 USD`

### Outputs

| Name | Description |
|------|-------------|
| `tx_hash` | On-chain transaction hash |

---

## P6 — Query machine or fleet status

Read-only lookups. No on-chain writes.

### Preflight

- Base config check
- Sub-actions D requires Scale config check

### Sub-actions

`AskUserQuestion`: "What would you like to query?"
- `A — MCR score` — Machine Credit Rating for a specific machine
- `B — Full machine profile` — On-chain identity, DID attributes, events
- `C — Operator fleet` — All machines managed by an operator
- `D — Machine Market status` — Market registration status (requires Scale config)

**A — MCR for a specific machine**

Input: `machine_did`

```bash
peaqos qualify mcr <machine-did> --json
```

**B — Full machine profile (on-chain + MCR + events)**

Input: `machine_did`

```bash
peaqos show machine <machine-did> --json
```

**C — All machines for an operator**

Input: `operator_did` (from `peaqos whoami` output)

```bash
peaqos show operator machines <operator-did> --json
```

**D — Machine Market status** (Scale config check required)

Input: `market_machine_id` for single machine query

```bash
# Single machine
peaqos scale machine status <market-machine-id> --json

# All machines registered in the Market
peaqos scale machine list --json
```

Surface output directly to operator.

---

## P7 — Manage existing orders

View and act on existing Market orders. Prerequisite: P2 complete.

### Preflight

- Base config check
- Scale config check

### Sub-actions

`AskUserQuestion`: "What would you like to do with your orders?"
- `A — List orders` — All orders for a machine (no token needed)
- `B — Check order status` — Status and payment state for a specific order
- `C — Confirm delivery` — Release payment to provider after service received
- `D — Dispute order` — Freeze payment and raise a dispute

**A — List orders for a machine** (platform auth — no token needed)

Input: `market_machine_id`

```bash
peaqos scale order list --machine-id <market-machine-id> --json
```

Pagination behaviour:
- `--json` without `--limit`: fetches all pages automatically and returns a flat JSON array. No cursor needed.
- `--json --limit <n>`: returns one page as `{"items": [...], "next_cursor": "..."}`. Read `.next_cursor` and pass as `--cursor` on the next call to page forward. When `.next_cursor` is `null`, you have reached the last page.

**B — Check a specific order** (platform auth — no token needed)

Input: `order_id`

```bash
peaqos scale order status <order-id> --json
```

Response shape: `{"order": {...}, "payment": {...} | null}`. Read `.order.status` for order state and `.payment.status` for payment state.

**C — Confirm delivery** (pairing token required)

Token file check required. Inputs: `order_id`, `pairing_token_file`.

```bash
peaqos scale order received <order-id> --pairing-token-file <path> --json
```

If exit 1 with "Token file is empty" or "Could not read token file" — verify the file was saved correctly after P3. If the token is lost, see `knowledge/troubleshooting.md` "Pairing token lost".

**D — Dispute an order** (pairing token required)

Token file check required. Inputs: `order_id`, `reason`, `pairing_token_file`, optionally `evidence` file path.

```bash
peaqos scale order dispute <order-id> \
  --reason "<reason>" \
  --pairing-token-file <path> \
  [--evidence <path>] \
  --yes \
  --json
```

---

## Error handling

All CLI commands exit with: `0` success · `1` validation error · `2` network/API/chain error · `3` config error.

| Exit code | Action |
|-----------|--------|
| 1 | Report the validation error verbatim. Stop — operator must correct input before retrying. **Exceptions:** `RateLimitExceeded` (exit 1) — wait for the rate limit window to reset, then retry. `ValueCapExceeded` (exit 1) — reduce `--value` or check configured caps. |
| 2 | Report the error. For `peaqos activate` (idempotent — safe to re-run), offer one retry. For `peaqos scale machine onboard` (not idempotent) — run `peaqos scale machine list --json` first to check whether the machine already exists; if it does and status is `draft`, do not re-run `onboard` with the same `--identity-ref` (it will fail with `MACHINE_IDENTITY_EXISTS`) — contact platform support to activate the draft. For order commands, run `peaqos scale order status <id> --json` first — see P4 partial failure branching above. |
| 3 | Report the missing config. Direct operator to `peaqos init` for base config or `examples/.env.example` for Scale config. |

For symptom-specific diagnosis read `knowledge/troubleshooting.md`.

---

## Reference files

- `knowledge/cli-reference.md` — complete command and flag reference with exit codes
- `knowledge/concepts.md` — technical definitions (machine ID types, MCR, trust levels, Scale auth)
- `knowledge/troubleshooting.md` — symptom → cause → fix
- `examples/.env.example` — environment variable reference
