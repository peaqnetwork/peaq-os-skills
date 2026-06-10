# peaqOS Skill — Test Guide

QA checklist for the `/peaqos` skill. Tests are organised by playbook. Run P1 first — most other playbooks depend on its outputs.

---

## Setup

**Install the CLI:**

The Cairo/svglib dependency was removed in the latest CLI version — no system prerequisites needed.

```bash
pip install peaq-os-cli
pip install 'peaq-os-sdk[ows]'   # optional — for OWS wallet tests
peaqos --version
```

Note: P1 will also offer to install the CLI automatically if it detects it is missing. You can test this path via S-PRE (see below) without pre-installing.

**Install the skill (symlink for fast iteration):**

```bash
mkdir -p ~/.claude/skills
ln -s "/path/to/peaq-os-skills/skills/peaqos" ~/.claude/skills/peaqos
```

**Clean test directory:**

```bash
mkdir ~/peaqos-test && cd ~/peaqos-test
claude
```

**Testnet tokens** (needed for P1, P2):
Request at: https://docs.peaq.xyz/peaqchain/build/getting-started/get-test-tokens
Limit: 3 AGNG/address/day. Request before starting.

---

## Security

### S-SEC — Private key refusal

**Purpose:** Confirm the skill never echoes or stores a private key regardless of context.

**Steps:**
1. `/peaqos` (any entry point)
2. Paste: `0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef`

**Pass criteria:**
- Skill stops immediately with the refusal message
- Does not echo, acknowledge, or store the value
- Redirects to `peaqos init` / `.env`

---

## Preflight

### S-PRE — Missing CLI

**Purpose:** Confirm the skill catches a missing CLI before any playbook runs.

**Setup:** `mv $(which peaqos) $(which peaqos).bak`

**Steps:**
1. `/peaqos` → select any playbook

**Pass criteria:**
- Skill detects CLI is not installed
- Reports clearly with install command
- Does not attempt to run any CLI commands

**Cleanup:** `mv $(which peaqos).bak $(which peaqos)`

### S-PRE2 — Missing .env

**Purpose:** Confirm base config check fails fast with a clear message.

**Setup:** Fresh directory with no `.env`.

**Steps:**
1. `/peaqos` → select P2, P3, P4, P5, or P6

**Pass criteria:**
- `peaqos whoami` exits 3
- Skill reports the config error and directs operator to `peaqos init`
- Does not attempt further execution

### S-PRE3 — Missing PEAQOS_ORCHESTRATION_URL

**Purpose:** Confirm Scale config check blocks P2–P4, P7 correctly.

**Setup:** `.env` present and valid (P1 complete) but no `PEAQOS_ORCHESTRATION_URL`.

**Steps:**
1. `/peaqos` → select P2, P3, P4, or P7

**Pass criteria:**
- Skill detects missing URL and stops
- Reports exactly what is missing
- Does not attempt any scale commands

---

## P1 — Onboard a machine to peaqOS

*Requires testnet tokens.*

### P1-A — Self-managed, testnet

**Steps:**
1. `/peaqos` → P1
2. Mode: self-managed, network: testnet
3. Follow through: verify config → confirm activation → baseline event → MCR check

**Pass criteria:**
- `peaqos whoami` shows Chain ID 9990 before activation
- `peaqos activate --skip-funding` completes all 6 steps
- Outputs captured: `machine_id` (integer), `token_id`, `machine_did`
- Baseline activity event submits without error; tx hash captured
- `peaqos qualify mcr <did>` returns a result (poll up to 90s; `Provisioned` acceptable)
- Skill surfaces all 3 named outputs clearly at completion

### P1-B — Proxy-managed, testnet

**Prerequisite:** Operator wallet already registered (P1-A run first in self mode).

**Steps:**
1. `/peaqos` → P1
2. Mode: proxy-managed; provide machine address and key file path
3. Follow through activation

**Pass criteria:**
- Activation completes with `--for` and `--machine-key` flags
- Both `machine_did` and `operator_did` surfaced in outputs

### P1-C — Existing environment detected

**Prerequisite:** P1-A completed (`.env` and `peaqos.log` exist).

**Steps:**
1. Stay in same directory
2. `/peaqos` → P1

**Pass criteria:**
- Preflight detects existing `.env`, runs `peaqos whoami`
- Skill asks whether operator is activating a new machine or resuming
- Does not force a fresh `peaqos init`

---

## P2 — Register machine in Machine Market

*Requires P1 complete and `PEAQOS_ORCHESTRATION_URL` set.*

### P2-A — Key file signing

**Steps:**
1. `/peaqos` → P2
2. Provide DID from P1, display name, owner ID, machine type, runtime profile
3. Signing method: key file

**Pass criteria:**
- Preflight passes (whoami + Scale config)
- `peaqos scale machine onboard` runs with `--identity-key-file` and `--yes --json`
- `market_machine_id` (`mach_*` string) captured and surfaced
- Skill distinguishes Market machine ID from on-chain integer machine ID

### P2-B — Manual paste signing

**Steps:** Same as P2-A but without `--identity-key-file` (no OWS wallet active).

**Pass criteria:**
- Skill warns that `PEAQOS_PRIVATE_KEY` does not auto-sign
- CLI prompts for EIP-191 signature paste
- `market_machine_id` captured from human-mode output

---

## P3 — Pair an AI agent

*Requires P2 complete.*

### P3-A — Interactive signing, token gate

**Steps:**
1. `/peaqos` → P3
2. Provide market machine ID, agent address, provider, role
3. No `--agent-signature-file`

**Pass criteria:**
- Preflight passes
- CLI runs and prompts for agent signature
- After command completes, skill stops and explicitly instructs operator to save the pairing token
- Does not proceed until operator confirms token is saved
- `pairing_id` surfaced in outputs

### P3-B — Pre-signed signature file

**Steps:** Same as P3-A with `--agent-signature-file` provided.

**Pass criteria:**
- `--json` mode used (requires signature file)
- Pairing token gate still fires — operator must confirm token saved
- `pairing_id` and confirmation that token is in file captured

---

## P4 — Search for services and place an order

*Requires P3 complete and pairing token file available.*

### P4-A — No-payment service

**Steps:**
1. `/peaqos` → P4
2. Provide machine ID, pairing ID, token file path, service type
3. Follow search → order → confirm

**Pass criteria:**
- Preflight passes including token file check
- Search returns results; `search_id` and lead `quote_id`/`service_id` captured
- Order placed with `--json`; `order_id` captured
- Confirmation step runs `order received`

### P4-B — No quotes returned

**Steps:** Use a service type unlikely to have providers (e.g. `compute.nonexistent`).

**Pass criteria:**
- Skill reports no results clearly
- Suggests: remove `--native-only`, add `--allow-handoff`, increase budget, broaden type
- Does not proceed to order placement

### P4-C — Prerequisite check: missing token file

**Setup:** Provide a path to a non-existent token file.

**Pass criteria:**
- Token file check catches missing file before any commands run
- Reports the correct path and asks operator to correct it

---

## P5 — Submit machine events

*Requires P1 complete.*

### P5-A — Activity event

**Steps:**
1. `/peaqos` → P5
2. Provide machine ID (integer), type: activity, value: 0, ts: now

**Pass criteria:**
- `peaqos qualify event` runs with `--json`
- `tx_hash` and `data_hash` surfaced

### P5-B — Revenue event with currency

**Steps:** Same with type: revenue, non-zero value, currency code (e.g. `HKD`).

**Pass criteria:**
- Command includes `--currency HKD`
- Tx submitted without error

### P5-C — onchain trust requires source-tx

**Steps:** Select `--trust onchain` without providing `--source-tx`.

**Pass criteria:**
- Skill catches the missing `--source-tx` before running the command (validation error)
- Reports exit 1 with clear message

---

## P6 — Query machine or fleet status

*Requires P1 complete.*

### P6-A — MCR query

**Steps:**
1. `/peaqos` → P6 → sub-action A
2. Provide machine DID

**Pass criteria:**
- `peaqos qualify mcr <did> --json` runs
- Output surfaced to operator

### P6-B — Full machine profile

**Steps:** Sub-action B with machine DID.

**Pass criteria:** `peaqos show machine <did> --json` runs and output surfaced.

### P6-C — Operator fleet

**Steps:** Sub-action C with operator DID from `peaqos whoami`.

**Pass criteria:** `peaqos show operator machines <did> --json` runs.

### P6-D — Market status

*Requires Scale config.*

**Steps:** Sub-action D with market machine ID.

**Pass criteria:** `peaqos scale machine status <id> --json` runs; output surfaced.

---

## P7 — Manage existing orders

*Requires P2 complete and at least one order placed (P4).*

### P7-A — List orders

**Steps:**
1. `/peaqos` → P7 → sub-action A
2. Provide market machine ID

**Pass criteria:**
- `peaqos scale order list --machine-id <id> --json` runs
- No pairing token required

### P7-B — Order status

**Steps:** Sub-action B with a known order ID.

**Pass criteria:** `peaqos scale order status <id> --json` runs without a pairing token.

### P7-C — Confirm delivery

**Steps:** Sub-action C with order ID and token file.

**Pass criteria:** `peaqos scale order received` runs with `--pairing-token-file`.

### P7-D — Dispute order

**Steps:** Sub-action D with order ID, reason, and token file.

**Pass criteria:** `peaqos scale order dispute` runs with `--reason` and `--pairing-token-file`.

---

## Known limitations (not bugs)

| Limitation | Detail |
|------------|--------|
| Gas station unavailable on testnet | Expected — skill routes to faucet + `--skip-funding` |
| MCR indexer lag | Up to 90s after first event. `peaqos show machine` for immediate chain-direct lookup |
| Faucet rate limit | 3 AGNG/day per address |
| Scale end-to-end (P2–P7) | Requires `PEAQOS_ORCHESTRATION_URL` — staging environment needed |

---

## Reporting issues

Note the playbook ID, the exact input that triggered the problem, and what the skill did vs what you expected. Check `peaqos.log` in the working directory for CLI-level audit trail.
