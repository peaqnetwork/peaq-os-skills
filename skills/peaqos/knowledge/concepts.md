# peaqOS Technical Concepts

Definitions for terms used across playbooks and CLI output.

---

## Machine identifiers — critical distinction

Two separate ID spaces exist. Do not mix them.

| Identifier | Format | Source | Used by |
|------------|--------|--------|---------|
| On-chain machine ID | Positive integer (e.g. `42`) | `peaqos activate` stdout | `peaqos qualify event --machine-id` |
| Machine DID | `did:peaq:0x<40-hex>` | `peaqos activate` stdout | `peaqos qualify mcr`, `peaqos show machine`, `peaqos scale machine onboard --identity-ref` |
| Market machine ID | String (server-assigned, e.g. `mach_abc123`) | `peaqos scale machine onboard` stdout | All `peaqos scale` commands (`--machine-id` flag) |

---

## MCR — Machine Credit Rating

An on-chain credit score (0–100) computed from verified event history. Calculated by the MCR API from events submitted via `peaqos qualify event`. Ratings: `Provisioned` (no events yet), then `NR` (not rated) → `B` → `BB` → `BBB` → `A` → `AA` → `AAA`.

**Indexer lag:** Up to 90s after an event lands on-chain before the MCR API reflects it. Use `peaqos show machine <did> --json` for chain-direct state.

**FX Degraded:** If `fx_degraded: true` in MCR output, one or more events used a stale FX rate. Score is conservative but valid — no action required.

---

## Trust levels

Applies to `peaqos qualify event --trust`.

| Value | Meaning |
|-------|---------|
| `self` (default) | Operator self-reports the event value |
| `onchain` | Value is verifiable via a source chain transaction; requires `--source-tx` |
| `hardware` | Value attested by hardware (TEE/HSM) |

---

## AgentPairing — token vs session fields

The `AgentPairing` dataclass (returned by `peaqos scale agent pair --json`) contains two distinct token-related fields. Do not confuse them:

| Field | Purpose | What to save |
|-------|---------|-------------|
| `pairing_token` | One-time auth token for agent pairing commands (`--pairing-token-file`) | **Save this** — it is what all Scale commands use |
| `session_token_id` | Internal session identifier — not used in CLI commands | Ignore |
| `session_id` / `session_issued_at` / `session_expires_at` | Session metadata | Reference only |

The CLI does not expose a command to refresh `pairing_token` via the SDK's session-refresh endpoint. If the token is expired or lost, create a new pairing.

---

## Scale auth modes

Scale commands use two distinct authentication mechanisms.

| Auth type | Header | Commands |
|-----------|--------|---------|
| Platform auth | `x-api-key` (`PEAQOS_ORCH_API_KEY` if set) | machine CRUD, machine list/status, order list/status |
| Agent pairing auth | `x-agent-pairing-token` | search, order place/execute, order received, order dispute |

Commands using agent pairing auth always require `--pairing-token-file`. Commands using platform auth do not.

`PEAQOS_ORCH_API_KEY` is optional — only set it if commands return `AUTH_REQUIRED`.

---

## OWS — Open Wallet Standard

Encrypted key vault stored at `~/.ows/`. Requires `pip install 'peaq-os-sdk[ows]'`. Set `PEAQOS_OWS_WALLET=<name>` in `.env` to activate. Set `OWS_PASSPHRASE` in shell to avoid repeated prompts.

OWS wallets auto-sign for: `peaqos activate`, `peaqos qualify event`, `peaqos scale machine onboard` (identity challenge, Mode 3), and EVM payment transfers in `peaqos scale order`. Auto-sign requires both `PEAQOS_OWS_WALLET` set and the vault passphrase resolved (from `OWS_PASSPHRASE` env var or an interactive prompt). Without the passphrase, the wallet is not considered active for signing.

---

## Payment rails (Scale orders)

The definitive payment determination happens **after order creation**, not at search time. The CLI checks the created order's `payment.default_rail == "not-required"` AND `payment.required == False` to decide between the 2-step and 5-step flows. The search quote's `.quotes[0].payment.required` is a pre-confirmation signal for the operator — useful for surfacing a payment warning before placing the order, but the created order's own payment block governs the actual code path.

**Full `MarketPaymentRailType` values:** `not-required` · `wallet` · `escrow` · `onchain-escrow` · `wdk-usdt-transfer` · `x402` · `xvv42` · `vault-stripe` · `offchain-record` · `external`

`wallet` and `escrow` follow the same 5-step code path in `peaqos scale order`. Step 4 differs: `wallet` records a payment proof; `escrow` locks funds in an escrow contract. Solana transfers always require manual hash paste — OWS auto-pay is EVM-only.

**x402 rail — 6-step automatic flow:**

When `order.payment.default_rail == "x402"`, the flow is fully automatic with 6 steps. No manual transfer, no confirm/dispute prompt. The CLI:
1. Creates the order and receives a payment challenge containing EIP-3009 `TransferWithAuthorization` parameters.
2. Calls `sign_x402_payment()` locally — pure offline computation using the operator's secp256k1 private key. No network call, no gas consumed at signing time.
3. Records the signed proof.
4. Executes the order with the payment signature attached.
5. Auto-confirms delivery (step 6 in CLI progress output).

USDC is debited atomically when the order executes. The step counter shows `[1/6]` through `[6/6]`. Do not present a confirm/dispute prompt for x402 orders — it is never needed and the CLI does not wait for one.

**Partial failure step names for x402** (appear in the stderr error text — the CLI emits no JSON on errors; the message reads `Order '<id>' was created but <step> failed.`):
- `x402 payment challenge` — challenge was missing or malformed; contact service provider
- `x402 signing` — local signing failed; check `PEAQOS_PRIVATE_KEY` is set and valid

**Dependency:** `peaq_os_sdk[x402]>=0.4.0` — bundled with `peaq-os-cli>=0.0.6`. No separate install needed.

---

## OperationContract

Each service in the Machine Market exposes one or more `OperationContract` objects — structured descriptions of what operations the service supports.

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `operation` | `str` | Operation name (e.g. `"inference"`, `"get-latest-price"`) |
| `input_fields` | `tuple[OperationContractField, ...]` | Each field: `key`, `type`, optional `description` |
| `output_fields` | `tuple[OperationContractField, ...]` | Same structure |
| `example_input` | `Mapping[str, Any]` | Ready-to-use JSON template — use as the `--input` file template |
| `summary` | `str \| None` | One-line description from the service provider |
| `notes` | `tuple[str, ...]` | Additional guidance |

**How the skill fetches it** (before calling `peaqos scale order`):

```python
import json, os
from peaq_os_sdk import PeaqosClient
from peaq_os_sdk.orchestration import GetMarketServiceOptions

# SDK reads PEAQOS_API_KEY; the CLI .env uses PEAQOS_ORCH_API_KEY — bridge them.
if os.environ.get("PEAQOS_ORCH_API_KEY") and not os.environ.get("PEAQOS_API_KEY"):
    os.environ["PEAQOS_API_KEY"] = os.environ["PEAQOS_ORCH_API_KEY"]
# This script makes platform-auth HTTP calls only — it never signs on-chain.
# If the .env is OWS-only (PEAQOS_OWS_WALLET, no raw key), satisfy from_env()
# with a placeholder signing key that is never used.
if os.environ.get("PEAQOS_OWS_WALLET") and not os.environ.get("PEAQOS_PRIVATE_KEY"):
    os.environ["PEAQOS_PRIVATE_KEY"] = "0x" + "11" * 32

client = PeaqosClient.from_env()
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

Run as: `set -a; source .env 2>/dev/null; set +a; SERVICE_ID=<id> MACHINE_ID=<id> OPERATION=<op> python3 <script>` — sourcing `.env` first is required; the SDK's `from_env()` reads the process environment and does not load `.env` itself.

The `example_input` dict is the canonical template for `--input` files. The CLI's interactive `_show_example_input_tip` is **skipped when `--json` or `--yes` is set**, so the skill must always fetch via the SDK script before placing an order.

---

## Order and payment status values

**`MarketOrderStatus`:** `created` · `payment_pending` · `ready` · `executing` · `delivered` · `confirmed` · `disputed` · `cancelled` · `failed` · `handoff`

**`MarketPaymentStatus`:** `not_required` · `intent_created` · `held` · `release_pending` · `released` · `frozen` · `refunded`

Note: `pending` and `active` are **not** valid status values. Near-action payment states are `intent_created` (transfer not yet confirmed) and `held` (funds in transit/escrow).

---

## Execution modes

`"native"` — service executes and returns a result in the response (HTTP 200).
`"external-handoff"` — service returns a URL the agent should follow (HTTP 202). Note the hyphen — not underscore.
