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

If any input contains a **64-hex private key** (exactly 64 hex chars, 66 chars total with `0x` prefix) or a 12/24-word mnemonic phrase, stop immediately.

Note: EIP-191 signatures are 130 hex chars (132 with `0x`) — they are **not** private keys and are safe to receive from the operator when explicitly requested during agent pairing (P3 Path B).

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
| Stream data (publish, grant, consume) | P8 |

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
| 0 | Config valid | Surface active context (see below), then confirm before proceeding |
| 3 | `.env` missing or misconfigured | Stop: "Run `peaqos init` to configure your environment." |
| 2 | RPC unreachable | Stop: "Check `PEAQOS_RPC_URL` in `.env`." |

**On exit 0 — always show the active context and confirm:**

Show the operator:
> "Active configuration:
> - Network: `<network>` (Chain ID `<chain_id>`)
> - Wallet: `<address>`"

Then ask: `AskUserQuestion`: "Is this the right configuration?" → `Yes, continue` / `No, I need a different configuration`

If `No` → tell the operator: "To switch configuration, open a different working directory that contains the `.env` for the wallet and network you want, then re-invoke `/peaqos` from there." Stop.

This check applies to every playbook. It ensures the operator always knows which network and wallet is active before any commands run.

### Scale config check (P2, P3, P4, P7)

```bash
echo "${PEAQOS_ORCHESTRATION_URL:-MISSING}"
```

`MISSING` → check the network from `peaqos whoami`, then:

- **Mainnet** → set it automatically (no operator input needed):
  ```bash
  echo "PEAQOS_ORCHESTRATION_URL=https://orchestration.peaq.xyz" >> .env
  ```
  Source `.env` again and proceed.

- **Testnet** → the staging URL is environment-specific. `AskUserQuestion`: "Do you have a testnet Machine Market API URL?" → `Yes, I have it` / `No, I need to get one`
  - `Yes` → ask for the URL (free text), write to `.env`: `echo "PEAQOS_ORCHESTRATION_URL=<url>" >> .env`, source and proceed.
  - `No` → Stop: "Contact the peaqOS team to get the testnet Machine Market API URL. Once you have it, re-invoke this option."

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

**Testnet only — confirm wallet is funded before running:**

`AskUserQuestion`: "Wallet funded with testnet tokens?" → `Yes, ready to activate` / `No, need to fund first`

If not funded → direct to faucet: https://docs.peaq.xyz/peaqchain/build/getting-started/get-test-tokens (3 AGNG/day limit). Wait for confirmation before proceeding.

**Mainnet — no manual funding needed.** The gas station handles it automatically during activation steps 2–3. Step 2 will render a QR code to the terminal — surface this to the operator: "Open your authenticator app, scan the QR code, then enter the TOTP code when prompted." Step 3 then calls the gas station automatically with that code to fund the wallet. Do not ask the operator to fund the wallet manually.

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
- Testnet: fund wallet via faucet first, then use `--skip-funding` to bypass steps 1–3
- Mainnet (normal): do not use `--skip-funding`. The gas station handles funding via a 2FA/TOTP flow. Follow the steps below.
- Mainnet (gas station unavailable): if `activate` exits 2 with `Faucet error: NETWORK_ERROR`, offer: `AskUserQuestion`: "Gas station is unavailable. How would you like to proceed?" → `Fund wallet manually and skip gas station` / `Retry later`. If manual: tell the operator to transfer PEAQ to `<wallet_address>`, confirm when done, then run with `--skip-funding`.

**Mainnet 2FA handling (when gas station is reachable):**

The Bash tool has no TTY, so `peaqos activate` aborts when it can't get TOTP input. Use this two-step approach:

Step A — Run activate to capture the QR URL (it will abort — that's expected):
```bash
set -a && source .env && set +a && peaqos activate \
  --doc-url "<doc-url>" --data-api "<data-api>" 2>&1 || true
```
Parse the QR image URL from the output (look for `QR image URL: https://...`).

Step B — Display the QR inline and collect the TOTP code:
Fetch the QR image URL and display it to the operator. Ask:
`AskUserQuestion`: "Scan the QR code with your authenticator app and enter the 6-digit code" (free text — 6 digits)

Step C — Re-run with the code piped to stdin:
```bash
set -a; source .env; set +a; printf "<totp_code>\n" | peaqos activate \
  --doc-url "<doc-url>" --data-api "<data-api>"
```
Note the semicolons (not `&&`) so the pipe connects to just `peaqos activate`.

**Step 4 — Complete**

Onboarding is complete once `activate` succeeds. Surface the outputs and point the operator to the next steps. Do not attempt event submission or MCR checks here — the bonding state needs time to settle after a fresh activation, and these are ongoing operations with their own dedicated playbooks.

> "Your machine is registered on-chain. To start building your Machine Credit Rating, submit events via **P5 — Submit machine events** (use Machine ID `<machine_id>`). To check MCR status, use **P6 — Query machine status** (use Machine DID `<machine_did>`)."

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

Read `identity_ref` and `operator_address` from `peaqos whoami` output — do not ask the operator for these.

| Input | Required | Notes |
|-------|----------|-------|
| `--identity-ref` | Yes | Use the Machine DID from `peaqos whoami` (`did:peaq:0x<address>`) — already known from preflight |
| `--display-name` | Yes | Ask: "What would you like to name this machine?" (free text, e.g. "My Edge Node") |
| `--owner-id` | Yes | Default to the wallet address from `peaqos whoami` — only ask if the operator wants something different |
| `--machine-type` | Yes | `AskUserQuestion`: options: `edge-node` / `compute-node` / `iot-device` / `robot` / `sensor` / `Other (I'll type it)` |
| `--runtime-profile` | Yes | `AskUserQuestion`: options: `linux-docker` / `linux-native` / `Other (I'll type it)` |
| `--capabilities` | No | Ask: "Any capabilities to declare? (comma-separated, or skip)" |
| `--skill-keys` | No | Skip unless operator explicitly wants to set these |
| `--labels` | No | Skip unless operator explicitly wants to set these |

**Signing — handle automatically, do not ask:**

Check `.env` for `PEAQOS_OWS_WALLET` first. If set, OWS wallet signs automatically — no key file needed.

If `PEAQOS_OWS_WALLET` is not set, the operator's `PEAQOS_PRIVATE_KEY` in `.env` IS the DID controller key for a self-managed machine. Extract it to a temporary key file and use that:

```bash
grep PEAQOS_PRIVATE_KEY .env | cut -d= -f2 > /tmp/peaqos_controller.key && chmod 600 /tmp/peaqos_controller.key
```

Then pass `--identity-key-file /tmp/peaqos_controller.key`. Clean up after the command completes: `rm /tmp/peaqos_controller.key`.

Only fall back to manual paste if neither OWS nor `PEAQOS_PRIVATE_KEY` is available.

### Execute

⚠️ *Requires operator confirmation before registration*

Determine the signing flag automatically:
- If `PEAQOS_OWS_WALLET` is set in `.env` → no signing flag needed (OWS auto-signs)
- Otherwise → extract key to temp file first, then use `--identity-key-file`

```bash
# Step 1 (if not using OWS): extract key to temp file
grep PEAQOS_PRIVATE_KEY .env | cut -d= -f2 > /tmp/peaqos_ctrl.key && chmod 600 /tmp/peaqos_ctrl.key

# Step 2: register
peaqos scale machine onboard \
  --identity-ref <did-from-whoami> \
  --display-name "<name>" \
  --owner-id <address-from-whoami> \
  --machine-type <type> \
  --runtime-profile <profile> \
  [--capabilities <caps>] \
  --identity-key-file /tmp/peaqos_ctrl.key \
  --yes \
  --json

# Step 3: clean up temp file
rm /tmp/peaqos_ctrl.key
```

If the command exits 2 with a signer mismatch error, the key in `.env` doesn't control the machine DID — the operator will need to provide the correct key file manually via `--identity-key-file <path>`. If it exits with a manual paste prompt (unexpected), surface the challenge text to the operator and wait for their EIP-191 signature.

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
| `--agent-role` | Yes | `machine-market-buyer` (default for purchasing agents) |
| `--per-tx-limit` | No | Max spend per transaction |
| `--daily-limit` | No | Max daily spend |
| `--currency` | No | Budget currency (e.g. `USD`) |

Then ask: `AskUserQuestion`: "Do you have access to the agent's private key (e.g. from your Virtuals signer)?" → `Yes, I have the key` / `No, I'll sign externally`

### Execute

**Do not use the CLI to submit the pairing.** The CLI fetches its own fresh challenge when it runs, so the challenge_id it submits won't match the signature. Use direct API calls for both paths.

---

**Path A — Operator has the agent's private key**

Instruct the operator:
> "Save the agent's private key to a temp file in your terminal: `echo '0xYOUR_AGENT_KEY' > /tmp/agent.key && chmod 600 /tmp/agent.key` — confirm here when done."

Then run this single script — get challenge, sign, submit pairing, return token:

```bash
python3 - << 'PYEOF'
import os, sys, requests
from web3 import Web3
from eth_account import Account
from eth_account.messages import encode_defunct

machine_id = sys.argv[1]
agent_addr = Web3.to_checksum_address(sys.argv[2])
provider   = sys.argv[3]
role       = sys.argv[4]
orch_url   = os.environ["PEAQOS_ORCHESTRATION_URL"]
api_key    = os.environ.get("PEAQOS_ORCH_API_KEY", "")
headers    = {"Content-Type": "application/json"}
if api_key: headers["x-api-key"] = api_key

with open("/tmp/agent.key") as f:
    agent = Account.from_key(f.read().strip())

r = requests.post(f"{orch_url}/api/v1/machines/{machine_id}/agent-pairings/challenges",
    json={"agentAddress": agent_addr, "agentProvider": provider, "agentRole": role},
    headers=headers)
r.raise_for_status()
challenge = r.json()["item"]

sig = "0x" + agent.sign_message(encode_defunct(text=challenge["message"])).signature.hex()

r2 = requests.post(f"{orch_url}/api/v1/machines/{machine_id}/agent-pairings",
    json={"agentAddress": agent_addr, "agentProvider": provider, "agentRole": role,
          "agentProof": {"challengeId": challenge["challenge_id"], "signature": sig}},
    headers=headers)
if not r2.ok:
    print(f"Error {r2.status_code}: {r2.text}"); sys.exit(1)
pairing = r2.json()["item"]
print(f"pairing_id={pairing['id']}")
print(f"pairing_token={pairing.get('pairing_token','NOT_RETURNED')}")
PYEOF
```

Run as: `set -a && source .env && set +a && python3 <script> <machine-id> <agent-address> <provider> <role>`

Clean up: `rm -f /tmp/agent.key`

---

**Path B — Operator will sign externally (Virtuals, HSM, etc.)**

**Step 1 — Get challenge and save challenge_id:**

```bash
python3 - << 'PYEOF'
import os, sys, requests
from web3 import Web3

machine_id = sys.argv[1]
agent_addr = Web3.to_checksum_address(sys.argv[2])
provider   = sys.argv[3]
role       = sys.argv[4]
orch_url   = os.environ["PEAQOS_ORCHESTRATION_URL"]
api_key    = os.environ.get("PEAQOS_ORCH_API_KEY", "")
headers    = {"Content-Type": "application/json"}
if api_key: headers["x-api-key"] = api_key

r = requests.post(f"{orch_url}/api/v1/machines/{machine_id}/agent-pairings/challenges",
    json={"agentAddress": agent_addr, "agentProvider": provider, "agentRole": role},
    headers=headers)
if not r.ok:
    print(f"Error {r.status_code}: {r.text}"); sys.exit(1)
c = r.json()["item"]
open("/tmp/challenge_id.txt", "w").write(c["challenge_id"])
print(f"expires_at={c['expires_at']}")
print("--- SIGN THIS EXACT TEXT WITH EIP-191 (personal_sign) ---")
print(c["message"])
print("--- END ---")
PYEOF
```

Run as: `set -a && source .env && set +a && python3 <script> <machine-id> <agent-address> <provider> <role>`

Show the challenge message to the operator. Then ask using `AskUserQuestion` free text:
> "Sign the message above using EIP-191 personal_sign with the agent wallet. ⏱️ Expires at `<expires_at>`. Paste the 0x-prefixed signature — it is safe to paste, it is not a private key."

**Step 2 — Submit pairing using the saved challenge_id:**

```bash
python3 - << 'PYEOF'
import os, sys, requests
from web3 import Web3

machine_id = sys.argv[1]
agent_addr = Web3.to_checksum_address(sys.argv[2])
provider   = sys.argv[3]
role       = sys.argv[4]
signature  = sys.argv[5].replace(" ","").replace("\n","").strip()
orch_url   = os.environ["PEAQOS_ORCHESTRATION_URL"]
api_key    = os.environ.get("PEAQOS_ORCH_API_KEY", "")
headers    = {"Content-Type": "application/json"}
if api_key: headers["x-api-key"] = api_key

challenge_id = open("/tmp/challenge_id.txt").read().strip()

r = requests.post(f"{orch_url}/api/v1/machines/{machine_id}/agent-pairings",
    json={"agentAddress": agent_addr, "agentProvider": provider, "agentRole": role,
          "agentProof": {"challengeId": challenge_id, "signature": signature}},
    headers=headers)
if not r.ok:
    print(f"Error {r.status_code}: {r.text}"); sys.exit(1)
pairing = r.json()["item"]
print(f"pairing_id={pairing['id']}")
print(f"pairing_token={pairing.get('pairing_token','NOT_RETURNED')}")
PYEOF
```

Run as: `set -a && source .env && set +a && python3 <script> <machine-id> <agent-address> <provider> <role> <signature>`

Clean up: `rm -f /tmp/challenge_id.txt`

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

**Step 1.5 — Fetch operation contract and build `--input` file**

Before placing the order, fetch the service's `OperationContract` to get the exact input fields and a working example. The CLI's interactive example-input tip is skipped under `--json`/`--yes`, so this step is always required.

```python
# Save as /tmp/fetch_contract.py
import json, os
from peaq_os_sdk import PeaqOSClient
from peaq_os_sdk.types.orchestration.market_service import GetMarketServiceOptions

client = PeaqOSClient()
result = client.orchestration.get_market_service(
    os.environ["SERVICE_ID"],
    GetMarketServiceOptions(machine_id=os.environ.get("MACHINE_ID"))
)
for c in result.item.operation_contracts:
    if c.operation == os.environ.get("OPERATION", c.operation):
        print(f"Operation: {c.operation}")
        if c.summary: print(f"Summary: {c.summary}")
        for n in c.notes: print(f"Note: {n}")
        print("\nInput fields:")
        for f in c.input_fields:
            desc = f" — {f.description}" if f.description else ""
            print(f"  {f.key} ({f.type}){desc}")
        print("\nExample input:")
        print(json.dumps(c.example_input, indent=2))
        if not os.environ.get("OPERATION"): print("---")
```

Run as: `set -a && source .env && set +a && SERVICE_ID=<id> MACHINE_ID=<mach_id> OPERATION=<op> python3 /tmp/fetch_contract.py`

Show the operator the input fields and `example_input`. Collect their values and write to `/tmp/order_input.json`, then pass as `--input /tmp/order_input.json`.

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
  [--input /tmp/order_input.json] \
  [--provider-credentials <path>] \
  --yes \
  --json
```

> Note: `<service-id>` is a positional argument, not a flag. The CLI treats any token that is not a registered subcommand (`status`, `list`, `received`, `dispute`) as a service UUID.

**Payment handling** (determined from `order.payment.default_rail` after order creation, not the search quote):

- **`not-required`** → 2 steps: create → execute. No payment interaction.
- **`x402`** → 6 steps, fully automatic. CLI signs EIP-3009 `TransferWithAuthorization` locally (offline), records proof, executes, auto-confirms delivery. USDC debited at execution. **Skip Step 3 (confirm/dispute) entirely — x402 auto-confirms.** On partial failure check `.step`: `"x402 payment challenge"` → bad challenge from provider; `"x402 signing"` → check `PEAQOS_PRIVATE_KEY`.
- **`wallet` / `escrow`** → 5 steps: create → intent → transfer → proof/escrow-lock → execute. OWS wallet handles EVM transfers automatically. Solana always requires manual tx hash paste.
- **Pre-completed** → add `--payment-tx-hash <hash> --payment-chain <chain> --payment-token <token> --skip-payment`.

From `--json` output, capture `.order.id` as `order_id`. **On partial failure** (order created but later step failed), the error message includes the order ID. Run `peaqos scale order status <id> --json` and branch:
- Error code `QUOTE_EXPIRED` → order is unresumable; run a new search
- `.payment.status` is `intent_created` or `held` and error was payment RPC error → resume with `--payment-tx-hash + --skip-payment`
- `.order.status` is `executing` or `ready` and execution failed → retry the full `peaqos scale order <service-id>` command with the same parameters

Valid `MarketOrderStatus` values: `created` · `payment_pending` · `ready` · `executing` · `delivered` · `confirmed` · `disputed` · `cancelled` · `failed` · `handoff`

**Step 3 — Confirm or dispute** *(skip for x402 orders — auto-confirmed)*

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

## P8 — Stream data (publish, grant, consume)

Encrypted data streaming pipeline. Chunks, encrypts, and signs a data file for secure distribution; grants per-buyer decryption access; decrypts and reassembles on the buyer side. No Scale dependency — works on any machine with an active `.env`.

Prerequisite: P1 complete (machine DID required for publish). This playbook has three independent sub-actions that may be run by different parties.

### Preflight

- Base config check
- Confirm `cryptography` library is available (installed with `peaq-os-cli`):

```bash
python3 -c "from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey; print('OK')" 2>/dev/null || echo "MISSING"
```

`MISSING` → install: `pip install cryptography --break-system-packages`

### Sub-actions

`AskUserQuestion`: "What would you like to do?"
- `A — Publish data` — Chunk, encrypt, and sign a data file for distribution
- `B — Grant buyer access` — Re-wrap keys for a specific buyer
- `C — Consume data` — Decrypt and reassemble a purchased stream
- `D — Send stream payment` — Transfer tokens to a seller for a stream order
- `E — Retry payment proof` — Re-submit a proof when confirmation failed
- `F — Distribute data (seller)` — Poll for payment then deliver chunks to S3

---

**A — Publish data stream**

Chunks and encrypts a data file. Outputs per-chunk envelope files (`.json`), encrypted data blobs (`.bin`), and a `manifest.json` to a local directory.

**Step 1 — Key setup**

Stream publish requires three X25519 public keys (owner, operator, machine) and one Ed25519 signing key file. These are separate from `PEAQOS_PRIVATE_KEY` — they exist only for stream encryption and signing.

`AskUserQuestion`: "Do you have X25519 stream keypairs for this machine?" → `Yes, I have them already` / `No, generate them now`

If generating — run the script below. All private keys are written to files and never printed in chat.

```bash
python3 - << 'PYEOF'
import os, stat, sys
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

out = sys.argv[1] if len(sys.argv) > 1 else "."
os.makedirs(out, exist_ok=True)

def save(path, priv_hex, pub_hex, label):
    with open(path, "w") as f:
        f.write(priv_hex + "\n")
    os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    print(f"{label}_public_key={pub_hex}")
    print(f"{label}_key_file={path}")

owner = X25519PrivateKey.generate()
save(f"{out}/stream-owner.key",    owner.private_bytes_raw().hex(),    owner.public_key().public_bytes_raw().hex(),    "owner")

operator = X25519PrivateKey.generate()
save(f"{out}/stream-operator.key", operator.private_bytes_raw().hex(), operator.public_key().public_bytes_raw().hex(), "operator")

machine = X25519PrivateKey.generate()
save(f"{out}/stream-machine.key",  machine.private_bytes_raw().hex(),  machine.public_key().public_bytes_raw().hex(),  "machine")

signing = Ed25519PrivateKey.generate()
save(f"{out}/stream-signing.key",  signing.private_bytes_raw().hex(),  signing.public_key().public_bytes_raw().hex(),  "signing")

print("---")
print("WARNING: Back up all .key files. They cannot be recovered.")
PYEOF
```

Run as: `python3 <script> <output-dir>` (default: current directory).

Parse the output — surface the four `*_public_key=` values to the operator. Tell them:
> "Your stream keypairs have been generated. **Back up all `.key` files now** — if lost, data encrypted with these keys cannot be decrypted. You will need the `owner_public_key`, `operator_public_key`, and `machine_public_key` values to run publish."

If the operator already has keys, ask for:
- Owner X25519 public key (hex) — free text
- Operator X25519 public key (hex) — free text
- Machine X25519 public key (hex) — free text
- Signing key file path — free text (path to Ed25519 private key hex file)

**Step 2 — Collect publish inputs**

| Input | Required | Notes |
|-------|----------|-------|
| `--input` | Yes | File path or URL to the source data |
| `--output-dir` | Yes | Directory for chunk files + manifest (created if missing) |
| `--machine-did` | Yes | From P1 / `peaqos whoami` (e.g. `did:peaq:0x...`) |
| `--machine-key-id` | Yes | DID key reference — typically `<machine-did>#keys-1` |
| `--chunk-size` | No | Bytes per chunk (default 262144 = 256 KB) |
| `--s3` | No | S3 bucket path (e.g. `s3://my-bucket/prefix/`) for remote upload |
| `--s3-region` | No | S3-compatible region |
| `--s3-endpoint` | No | Custom S3 endpoint (MinIO, R2, etc.) |

Note: `--machine-key-id` is embedded in chunk metadata for attribution. Use `<machine-did>#keys-1` unless the operator has a different DID key reference.

**Step 3 — Execute**

```bash
peaqos stream publish \
  --input <file-or-url> \
  --output-dir <output-dir> \
  --owner-public-key <owner-pub-hex> \
  --operator-public-key <operator-pub-hex> \
  --machine-public-key <machine-pub-hex> \
  --signing-key-file <path-to-stream-signing.key> \
  --machine-did <machine-did> \
  --machine-key-id <machine-key-id> \
  [--chunk-size <bytes>] \
  [--s3 <s3-path> [--s3-region <region>] [--s3-endpoint <endpoint>]] \
  --json
```

Parse from `--json` output:
- `.sourceHash` → `source_hash`
- `.totalChunks` → chunk count
- `.machineDid` → confirms DID is embedded

If exit 1 with `"must be N bytes"` → a public key hex was wrong length (X25519 must be exactly 64 hex chars / 32 bytes).
If exit 1 with `"not valid hex"` → a key string contains non-hex characters.
If the `--input` is a URL and exits with a download error → verify the URL is reachable and returns a binary file.

### Sub-action A outputs

| Name | Description | Used in |
|------|-------------|---------|
| `source_hash` | SHA-256 hash of original data | C (buyer verification) |
| `total_chunks` | Number of chunks produced | Reference |
| `chunk_dir` | Directory with `chunk-*.json` and `chunk-*.bin` | B, C |
| `owner_key_file` | Path to `stream-owner.key` | B (grant step) |
| `owner_public_key_hex` | Owner's X25519 public key | Reference |

---

**B — Grant buyer access**

Re-wraps per-chunk encryption keys for a specific buyer using the owner's private key. The buyer can then decrypt the data without the owner ever sharing their private key.

Prerequisite: Sub-action A complete.

**Collect inputs:**

| Input | Required | Notes |
|-------|----------|-------|
| `--chunk-dir` | Yes | Directory from A (contains `chunk-*.json`) |
| `--buyer-public-key` | Yes | Buyer's X25519 public key hex (64 chars) — ask free text |
| `--buyer-id` | Yes | Buyer's DID or identifier (e.g. `did:peaq:0x...`) — ask free text |
| `--owner-private-key-file` | Yes | Path to `stream-owner.key` from Sub-action A |
| `--output-dir` | Yes | Directory for buyer access files (created if missing) |
| `--max-file-size` | No | Max bytes per access file (default 512000 = 500 KB) |

**Execute:**

```bash
peaqos stream grant \
  --chunk-dir <chunk-dir> \
  --buyer-public-key <buyer-pub-hex> \
  --buyer-id <buyer-id> \
  --owner-private-key-file <stream-owner.key> \
  --output-dir <access-dir> \
  [--max-file-size <bytes>] \
  --json
```

If exit 2 with `"Key commitment verification failed"` → the owner private key in `--owner-private-key-file` does not match the public key used to publish. Verify the correct `stream-owner.key` is being used.

After grant completes, tell the operator what the buyer needs to receive:
1. Buyer access files: all `*.json` from `<access-dir>`
2. Chunk envelope files: all `chunk-*.json` from `<chunk-dir>`
3. Encrypted data blobs: all `chunk-*.bin` from `<chunk-dir>`

### Sub-action B outputs

| Name | JSON path | Description |
|------|-----------|-------------|
| `access_dir` | — | Directory containing buyer access files |
| `file_count` | `.fileCount` | Number of access files written |
| `chunk_count` | `.chunkCount` | Chunks covered |

---

**C — Consume data stream**

Decrypts and reassembles a purchased stream. Run by the buyer using their private key and the files shared by the publisher after a grant.

**Collect inputs:**

| Input | Required | Notes |
|-------|----------|-------|
| `--chunk-dir` | Yes | Directory with `chunk-*.json` envelopes from publish |
| `--access-dir` | Yes | Directory with buyer access `*.json` files from grant |
| `--data-dir` | Yes | Directory with encrypted `chunk-*.bin` blobs — often same as `--chunk-dir` |
| `--buyer-private-key-file` | Yes | Path to buyer's X25519 private key file — ask free text |
| `--buyer-id` | Yes | Must exactly match the buyer ID used in grant |
| `--output` | Yes | Output file path for reassembled data |
| `--skip-verify` | No | Skip chain integrity check (debugging only) |

**Execute:**

```bash
peaqos stream consume \
  --chunk-dir <chunk-dir> \
  --access-dir <access-dir> \
  --data-dir <data-dir> \
  --buyer-private-key-file <buyer-priv-key-file> \
  --buyer-id <buyer-id> \
  --output <output-path> \
  --json
```

After success, surface `.sourceHash` and ask the operator to verify it against the `source_hash` published by the data owner — this confirms the data is intact and unmodified.

Error handling:

| Error message | Cause | Fix |
|---------------|-------|-----|
| `"Key commitment verification failed"` | Buyer private key doesn't match the public key used in grant | Verify the correct buyer key file |
| `"access not granted for this buyer private key"` | Access files don't include an entry for this buyer | Re-run grant with the correct buyer public key |
| `"Chain verification failed at chunk N: ..."` | Data integrity failure | Chunk data may be corrupted — re-download from source |
| `"No buyer access for chunk N"` | Access files are incomplete | Re-run grant — some chunks were missed |
| `"Missing encrypted data for chunk N"` | `.bin` file missing from `--data-dir` | Verify all `chunk-*.bin` files are present |
| `"Buyer ID mismatch"` | `--buyer-id` doesn't match the ID in access files | Use the exact string that was passed to grant |

### Sub-action C outputs

| Name | JSON path | Description |
|------|-----------|-------------|
| `output_file` | `.output` | Path to reassembled data |
| `total_bytes` | `.totalBytes` | Byte count — verify matches original |
| `source_hash` | `.sourceHash` | SHA-256 — verify against publisher's hash |
| `verified` | `.verified` | `true` if chain integrity check passed |

---

**D — Send stream payment**

Transfer tokens to the seller as payment for a stream order. The operator's secp256k1 key is used (falls back to `PEAQOS_PRIVATE_KEY` if no key file given).

**Collect inputs:**

| Input | Required | Notes |
|-------|----------|-------|
| `--seller-address` | Yes | Seller's EVM address — ask free text |
| `--amount` | Yes | Token subunits — clarify decimals (USDC: 6dp → 1 USDC = `1000000`) |
| `--chain` | Yes | `AskUserQuestion`: `peaq` / `base` / `solana` |
| `--order-id` | Yes | Order ID — ask free text |
| `--token-address` | No | ERC-20 contract if not native token |
| `--confirmation-url` | No | Provided by seller |
| `--private-key-file` | No | Path to key file; falls back to `PEAQOS_PRIVATE_KEY` |

**Execute:**

```bash
peaqos stream pay \
  --seller-address <addr> \
  --amount <n> \
  --chain <chain> \
  --order-id <id> \
  [--token-address <addr>] \
  [--confirmation-url <url>] \
  [--private-key-file <path>] \
  --json
```

**Security:** If the operator offers to paste a key value, redirect: "Set `PEAQOS_PRIVATE_KEY` in `.env` or write the key to a file and pass the path with `--private-key-file`."

### Sub-action D outputs

| Name | JSON path | Description |
|------|-----------|-------------|
| `tx_hash` | `.txHash` | On-chain payment transaction hash — needed for E if proof retry required |

---

**E — Retry payment proof**

Use when payment was confirmed on-chain but the seller's confirmation endpoint never received it.

**Collect inputs:**

| Input | Required | Notes |
|-------|----------|-------|
| `--tx-hash` | Yes | From Sub-action D output — ask free text |
| `--order-id` | Yes | Same order ID as D — ask free text |
| `--chain` | Yes | `AskUserQuestion`: `peaq` / `base` / `solana` |
| `--payer-address` | Yes | Buyer's address — read from `peaqos whoami` |
| `--payee-address` | Yes | Seller's address — same as `--seller-address` from D |
| `--amount` | Yes | Must exactly match the original payment amount |
| `--token` | No | Token symbol (e.g. `USDC`) |
| `--token-address` | No | ERC-20 contract address |
| `--confirmation-url` | No | Seller confirmation endpoint |

**Execute:**

```bash
peaqos stream payproof \
  --tx-hash <hash> \
  --order-id <id> \
  --chain <chain> \
  --payer-address <addr> \
  --payee-address <addr> \
  --amount <n> \
  [--token <symbol>] \
  [--token-address <addr>] \
  [--confirmation-url <url>] \
  --json
```

All values must match the original transaction exactly — mismatches cause proof rejection.

---

**F — Distribute stream data (seller side)**

Poll for buyer payment confirmation then upload encrypted chunks to S3. The stream owner private key (X25519, from Sub-action A) is required — not `PEAQOS_PRIVATE_KEY`.

**Collect inputs:**

| Input | Required | Notes |
|-------|----------|-------|
| `--chunk-dir` | Yes | Directory with `chunk-*.json` and `chunk-*.bin` from Sub-action A — ask free text |
| `--owner-private-key-file` | Yes | Path to `stream-owner.key` from Sub-action A — ask free text |
| `--confirmation-url` | Yes | Seller payment confirmation endpoint — ask free text |
| `--order-id` | Yes | Order ID — ask free text |
| `--s3` | Yes | S3 destination URI e.g. `s3://bucket/prefix` — ask free text |
| `--s3-region` | No | AWS region |
| `--s3-endpoint` | No | Custom S3-compatible endpoint (MinIO, R2, etc.) |
| `--poll-interval` | No | Seconds between polls (default: 30) |
| `--timeout` | No | Max poll wait in seconds (default: 3600) |
| `--presign-expiry` | No | Pre-signed URL expiry in seconds (default: 3600) |
| `--max-file-size` | No | Skip chunks larger than this byte count |

**Execute:**

```bash
peaqos stream distribute \
  --chunk-dir <path> \
  --owner-private-key-file <stream-owner.key> \
  --confirmation-url <url> \
  --order-id <id> \
  --delivery s3 \
  --s3 <s3-uri> \
  [--s3-region <region>] \
  [--s3-endpoint <endpoint>] \
  [--poll-interval <s>] \
  [--timeout <s>] \
  [--presign-expiry <s>] \
  [--json]
```

The command polls until payment is confirmed, then uploads chunks. If it times out, it is safe to retry — the upload is idempotent. If AWS credentials are not set, remind the operator to set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in their environment.

### Sub-action F outputs

| Name | JSON path | Description |
|------|-----------|-------------|
| `uploaded_count` | `.uploadedCount` | Number of chunks delivered |
| `presigned_urls` | `.presignedUrls` | URLs to share with the buyer for download |

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
