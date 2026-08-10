# RTP API Reference

Full reference for the RTP and batch-payment endpoints on the Spraay gateway, the reference
implementation of [RTP 1.0](https://github.com/plagtech/rtp-spec).

Base URL: `https://gateway.spraay.app`

Every price, field, and status code below was verified against a live response from that gateway or
against the gateway's route source. Anything the gateway does not do is called out explicitly rather
than left to inference.

---

## Endpoint summary

| Endpoint | Method | Price | Purpose |
|----------|--------|-------|---------|
| `/api/v1/robots/register` | POST | **free** | Register a robot with capabilities, pricing, payout address, connection |
| `/api/v1/robots/complete` | POST | **free** | Report a task `COMPLETED` or `FAILED`; sets escrow state |
| `/api/v1/robots/update` | **PATCH** | **free** | Change pricing, capabilities, status, payout address, metadata |
| `/api/v1/robots/deregister` | POST | **free** | Permanently delete a robot |
| `/api/v1/robots/task` | POST | $0.05 | Dispatch a paid task to a robot |
| `/api/v1/robots/list` | GET | $0.005 | Discover robots by capability, chain, price, status |
| `/api/v1/robots/status` | GET | $0.002 | Poll a task's lifecycle state |
| `/api/v1/robots/profile` | GET | $0.002 | Full robot profile incl. `metadata` and completion stats |
| `/api/v1/batch/execute` | POST | $0.02 | Build the atomic batch-payout transaction (up to 200 recipients) |
| `/api/v1/batch/estimate` | POST | $0.001 | Live fee/total quote for a batch |
| `/free/validate-batch` | POST | **free** | BPA 1.0 schema validation of a payout roster |
| `/free/estimate-batch` | GET | **free** | Rough batch cost preview |
| `/health` | GET | **free** | Gateway liveness |

`/api/v1/robots/batch` **does not exist** — a `POST` to it returns `404 Cannot POST`. The RTP-EXT-1
batch-dispatch extension is specified but is not deployed on this gateway; do not call it.

---

## Paying a 402

Paid endpoints answer an unpaid request with `HTTP 402` and an x402 challenge. Live example from
`GET /api/v1/robots/list`:

```json
{
  "x402Version": 2,
  "error": "Payment required",
  "resource": {
    "url": "https://gateway.spraay.app/api/v1/robots/list",
    "description": "Discover RTP robots. Filter by capability, chain, price, status.",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "5000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0xAd62f03C7514bb8c51f1eA70C2b75C37404695c8",
      "maxTimeoutSeconds": 300,
      "extra": { "name": "USD Coin", "version": "2" }
    },
    {
      "scheme": "exact",
      "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      "amount": "5000",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "payTo": "8WhWE8YgY5QBWyLowEHuaZiWdwDM3SrgDk36xYBNvYNS",
      "maxTimeoutSeconds": 300,
      "extra": { "feePayer": "Hc3sdEAsCGQcpgfivywog9uwtk8gUBUZgsxdME1EJy88" }
    }
  ]
}
```

Notes:
- `amount` is in **raw base units**, not dollars. USDC is 6 decimals, so `5000` = $0.005,
  `50000` = $0.05, `20000` = $0.02, `2000` = $0.002, `1000` = $0.001.
- Two rails are always offered: Base (`eip155:8453`) and Solana. Pick one; you pay once.
- The same challenge is also base64-encoded in the `payment-required` response header.
- `maxTimeoutSeconds: 300` — the signed payment is valid for 5 minutes.
- The Solana `extra.feePayer` changes between gateway deploys. Read it from the live challenge rather
  than hard-coding the value above. `payTo` and `asset` have been stable.

**A rejected request is never charged.** `@x402/express` settles only on a successful handler
response: when the handler answers any `4xx`, settlement is cancelled, so a dispatch rejected for an
unsupported task name, an unknown robot or an unavailable robot costs nothing. Verified live against
the deployed gateway with a recording facilitator.

As of gateway **v3.8.2**, `POST /api/v1/robots/task` goes further and validates the payload in a
pre-payment middleware: an invalid **paid** dispatch is rejected (`400` / `404` / `409`, with the same
verbatim error bodies) with **zero facilitator contact** — no payment is attempted at all.

Unpaid requests still receive the `402` challenge regardless of whether the body is valid. That is
deliberate: x402 discovery probes send empty or placeholder bodies to read `accepts[]`, and breaking
that would break discovery.

### Client

The gateway speaks **x402 v2**, so use the v2 client packages:

```bash
npm install @x402/fetch @x402/evm viem
```

```javascript
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.RTP_PAYER_PRIVATE_KEY);

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(account) }],
});

const res = await fetchWithPayment(
  "https://gateway.spraay.app/api/v1/robots/list?capability=pick",
  { method: "GET" }
);
console.log(await res.json());
```

- `eip155:8453` is Base **mainnet**. (Base Sepolia is `84532` — the upstream `@x402/fetch` README
  mislabels 8453 as Sepolia in one of its examples.)
- The older `x402-fetch` package implements **v1** and is deprecated; it does not match this
  gateway's `x402Version: 2`.
- The RTP spec repo's examples import `@spraayprotocol/rtp-sdk` (published, `0.1.0`; the shorter
  `@spraay` scope was already taken). This skill does not use it — every call documented here is
  plain HTTP, with `@x402/fetch` handling payment.

### Spend caps

v2 has no `maxValue` argument (that was v1). To cap spend, pass a `paymentRequirementsSelector` that
throws above a ceiling:

```javascript
const MAX_BASE_UNITS = 100000n; // $0.10 at 6dp

const capped = (version, accepts) => {
  const opt = accepts.find(a => a.network === "eip155:8453");
  if (!opt) throw new Error("no Base rail offered");
  if (BigInt(opt.amount) > MAX_BASE_UNITS) {
    throw new Error(`price ${opt.amount} exceeds cap ${MAX_BASE_UNITS}`);
  }
  return opt;
};
```

Pass it as `paymentRequirementsSelector` alongside `schemes`. This is a pattern you write, not a
built-in flag.

---

## `POST /api/v1/robots/register` — free

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `name` | **Yes** | — | Human-readable |
| `capabilities` | **Yes** | — | Array of strings. A dispatched task name must be in this array |
| `payment_address` | **Yes** | — | Where earnings are sent. A peaqID's address works here |
| `connection` | **Yes** | — | `{ "type": …, "webhookUrl": … }` |
| `description` | No | `null` | |
| `price_per_task` | No | `"0.05"` | Decimal string |
| `currency` | No | `"USDC"` | |
| `chain` | No | `"base"` | |
| `tags` | No | `[]` | Array of strings |
| `metadata` | No | `{}` | Free-form object — put `peaq_did` here |

`connection.type` accepts `webhook`, `xmtp`, `wifi`, `websocket`. The gateway's dispatcher only
delivers to `webhook` today — the other types are stored and returned, but no task is pushed to them.

**Response `201`:**
```json
{
  "status": "registered",
  "robot_id": "robo_8d77926e974a5d94",
  "rtp_uri": "rtp://gateway.spraay.app/robo_8d77926e974a5d94",
  "x402_endpoint": "https://gateway.spraay.app/api/v1/robots/task",
  "robot": { "robot_id": "…", "name": "…", "capabilities": [], "price_per_task": "…",
             "currency": "…", "chain": "…", "payment_address": "…",
             "connection": { "type": "webhook", "webhookUrl": "…" },
             "tags": [], "status": "online", "registered_at": "…" }
}
```

The `robot` object echoes `tags` but **not** `metadata`. Metadata is stored; read it back with
`GET /robots/profile`.

`robot_id` is `robo_` + 16 hex chars. There is no lookup-by-name endpoint — save it.

**`400`** returns `required`, `optional`, `connection_format` and a full `example`.

---

## `POST /api/v1/robots/task` — $0.05

| Field | Required | Default |
|-------|----------|---------|
| `robot_id` | **Yes** | — |
| `task` | **Yes** | — |
| `parameters` | No | `{}` |
| `callback_url` | No | `null` |
| `timeout_seconds` | No | `60` |

Validation checks, in order — none of them costs anything. Since v3.8.2 they run in a pre-payment
middleware, so a paid request that fails one is rejected before any facilitator contact:
- missing `robot_id` or `task` → `400 { error: "Missing required fields", required, optional, example_tasks }`
- robot not found → `404 { error: "Robot not found", robot_id }`
- `robot.status !== "online"` → `409 { error: "Robot is not available", current_status, hint }`
- `task` not in `capabilities` → `400 { error: "Robot does not support task \"…\"", available_capabilities }`

**Response `201`:**
```json
{ "status": "DISPATCHED", "task_id": "task_<hex>", "escrow_id": "escrow_<hex>",
  "robot_id": "…", "task": "…", "timeout_seconds": 60,
  "poll_url": "https://gateway.spraay.app/api/v1/robots/status?task_id=task_<hex>" }
```

Side effects: the robot flips to `busy`; the gateway POSTs the task to the robot's webhook; a timer
marks the task `TIMEOUT` after `timeout_seconds` if it hasn't finished.

The timeout cannot be switched off. The gateway resolves it as `timeout_seconds || 60`, so a
falsy value — including `0` — becomes **60 seconds**, not "no timeout". To give a long-running job
room, pass a large number rather than `0`.

**Webhook payload delivered to the robot** (10-second timeout; a 2xx moves the task to
`IN_PROGRESS`):
```json
{ "task_id": "…", "task": "…", "parameters": {}, "timeout_seconds": 60,
  "complete_url": "https://gateway.spraay.app/api/v1/robots/complete" }
```

---

## `POST /api/v1/robots/complete` — free

| Field | Required | Notes |
|-------|----------|-------|
| `task_id` | **Yes** | |
| `status` | **Yes** | Exactly `COMPLETED` or `FAILED` |
| `result` | No | Free-form; `null` if omitted |

- `COMPLETED` → `escrow: "released"`; `FAILED` → `escrow: "refunded"`
- Task already in `COMPLETED` / `FAILED` / `TIMEOUT` / `CANCELLED` → `409 "Task already finalized"`
- Unknown task → `404`; bad status string → `400` listing `allowed_statuses`
- The robot returns to `online`
- If the task had a `callback_url`, the gateway POSTs:
  ```json
  { "event": "task.completed", "task_id": "…", "robot_id": "…", "status": "…",
    "result": …, "escrow": "released", "timestamp": "…" }
  ```

**Response `200`:** `{ "task_id", "status", "escrow", "result" }`

**What this does not do:** it does not transfer `price_per_task` to the robot's `payment_address`,
and there is no on-chain escrow contract behind it. See `concepts.md#escrow`.

---

## `GET /api/v1/robots/list` — $0.005

Query params, all optional: `capability`, `chain`, `max_price`, `status`.

`max_price` is compared as a **string** against `price_per_task`, so use the same decimal form the
robots publish (`0.10`). `capability` matches robots whose `capabilities` array contains that value.

**Response:** `{ "robots": [ … ], "total": n, "filters": { … } }`. Each robot carries `robot_id`,
`name`, `capabilities`, `price_per_task`, `currency`, `chain`, `payment_address`, `status`,
`connection_type`, `tags`, `rtp_uri`. Note: no `metadata`, no `description` — use `profile` for those.

---

## `GET /api/v1/robots/status` — $0.002

Query param `task_id` (**required**; missing → `400` with an `example`).

**Response:** `task_id`, `robot_id`, `task`, `status`, `escrow_id`, `result`, `issued_at`,
`dispatched_at`, `completed_at`, `is_terminal`.

| Status | Terminal | Meaning |
|--------|----------|---------|
| `PENDING` | no | Created, not yet dispatched |
| `DISPATCHED` | no | Sent to the robot; webhook not yet acknowledged |
| `IN_PROGRESS` | no | Robot's webhook returned 2xx |
| `COMPLETED` | yes | Robot reported success; escrow released |
| `FAILED` | yes | Robot reported failure; escrow refunded |
| `TIMEOUT` | yes | `timeout_seconds` elapsed with no completion |
| `CANCELLED` | yes | Recognised terminal state |

---

## `GET /api/v1/robots/profile` — $0.002

Query param `robot_id` (**required**).

Returns the full record — including `description`, `connection`, **`metadata`** (where `peaq_did`
lives), `rtp_uri`, `registered_at` — plus:
```json
"stats": { "total_tasks": 0, "completed_tasks": 0 }
```

---

## `PATCH /api/v1/robots/update` — free

Note the method: **PATCH**, not POST. `robot_id` is required; send only the fields you are changing.

Updatable: `name`, `description`, `capabilities`, `price_per_task`, `currency`, `chain`,
`payment_address`, `connection`, `tags`, `status`, `metadata`.

`capabilities` and `tags` are **replaced wholesale**, not merged. `connection` is split internally
into `connection_type` and the rest of the object.

**Response `200`:** `status`, `robot_id`, `updated_fields[]`, and a partial `robot` object
(`robot_id`, `name`, `capabilities`, `price_per_task`, `status`, `updated_at`).

No valid fields → `400` listing `updatable_fields`. Unknown robot → `404`.

---

## `POST /api/v1/robots/deregister` — free

Body: `{ "robot_id": "…" }`. **Deletes the robot. Not reversible.**

- Tasks in `PENDING` / `DISPATCHED` / `IN_PROGRESS` → `409 { error: "Cannot deregister robot with
  active tasks", active_tasks: n, hint }`
- Unknown robot → `404`
- Success → `200 { "status": "deregistered", "robot_id", "name" }`

Re-registering issues a **new** `robot_id`.

---

## Three recipient shapes

The batch surface accepts three different shapes with different field names and different unit
semantics. Mixing them up is the most common batch failure — a decimal sent where raw base units are
expected is off by 10⁶.

| Where | Shape | Amount units |
|-------|-------|--------------|
| `POST /free/validate-batch` (BPA 1.0) | `{ chain, token, recipients: [{ "to", "amount" }] }` | Human decimal (`"0.05"`) |
| `POST /api/v1/batch/{estimate,execute}` — object form | `{ token, recipients: [{ "address", "amount" }] }` | Human decimal (`"0.05"`) |
| `POST /api/v1/batch/{estimate,execute}` — flat form | `{ token, recipients: ["0x…"], amounts: ["50000"] }` | **Raw base units** (`"50000"` = 0.05 at 6dp) |

The paid endpoints detect the shape from `typeof recipients[0]`. Prefer the object form — its
decimals are read by `parseUnits` with the token's real decimals, so there is no scaling to get
wrong. Use the flat form only when the client has already scaled the amounts.

---

## `POST /api/v1/batch/estimate` — $0.001

Body: `token` (default `"USDC"`) plus either a `recipients` array (detailed quote) or
`recipientCount` (rough gas-only estimate).

Detailed response: `token{symbol,address,decimals,isETH}`, `recipientCount`, `totalAmount`, `fee`,
`feePercent`, `totalWithFee`. It runs the same normalization and fee maths as `execute`, so a quote
cannot disagree with what `execute` charges.

---

## `POST /api/v1/batch/execute` — $0.02

Body: `token` (default `"USDC"`), `recipients` (+ `amounts` for the flat form), optional `sender`.

**Maximum 200 recipients** — 201 returns `400 "Maximum 200 recipients"`.

Token may be a symbol (`USDC`, `USDT`, `EURC`, `DAI`, `WETH`, `ETH`) or any ERC-20 contract address.
`ETH` (or omitting the token) means native ETH via `sprayETH`; anything else uses `sprayToken`.

**This endpoint does not broadcast anything.** It returns unsigned calldata:

```json
{
  "success": true,
  "contract": "0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC",
  "token": { "symbol": "USDC", "address": "0x8335…2913", "decimals": 6, "isETH": false },
  "batch": { "recipientCount": 2, "totalAmount": "0.13", "fee": "0.00039",
             "feePercent": "0.3%", "totalWithFee": "0.13039" },
  "transaction": { "to": "0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC",
                   "data": "0x…", "value": "0", "chainId": 8453 },
  "approvalRequired": { "token": "0x8335…2913",
                        "spender": "0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC",
                        "amount": "130390", "amountFormatted": "0.13039" }
}
```

The caller signs and broadcasts. Nothing is custodied by the gateway.

- Protocol fee: **0.3%** (30 bps), added on top — `totalWithFee = totalAmount + fee`
- `approvalRequired` is present for every ERC-20 and absent for native ETH
- `value` is `"0"` for ERC-20; for ETH it is `totalWithFee` in wei

### Batch contract

| Chain | Chain ID | Contract |
|-------|----------|----------|
| Base | 8453 | [`0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC`](https://basescan.org/address/0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC) |

This is the only batch contract this skill uses. If a response ever returns a different `to` address
or a `chainId` other than `8453`, stop and do not sign.

Base token addresses used above: USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`,
USDT `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2`, EURC `0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42`,
DAI `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb`, WETH `0x4200000000000000000000000000000000000006`.

---

## `POST /free/validate-batch` — free

BPA 1.0 schema validation. Uses the **`to`** field (see the shapes table).

```json
{ "valid": true, "errors": [], "warnings": [],
  "summary": { "chain": "base", "token": "0x8335…", "recipientCount": 2,
               "uniqueAddresses": 2, "totalAmount": 0.13, "bpaVersion": "1.0" } }
```

- Invalid address for the chain, missing/non-positive amount, >200 recipients → `errors[]`
- Duplicate recipient address → **`warnings[]`**, not an error. The contract will pay it twice.
- The HTTP status is `200` even when `valid` is `false` — check the `valid` field, not the status code.

Supported chains include `base`, `ethereum`, `arbitrum`, `polygon`, `bnb`, `avalanche`, `unichain`,
`solana`, `xrp`, `stellar` and others. Only `base` is wired to the batch contract above.

---

## `GET /free/estimate-batch` — free

Query: `recipients` (required, positive int), `chain` (default `base`), `amount` (optional total).

Returns `protocolFeeBps: 30`, `protocolFeeUSD`, `estimatedGasUSD`, `estimatedTotalCostUSD`, and
labels its own `precision` as `"rough — use /api/v1/batch/estimate for live quote"`. Use it for
framing only; quote from `batch/estimate` before anyone signs.

---

## Identifier formats

| Identifier | Format | Source |
|------------|--------|--------|
| Robot ID | `robo_` + 16 hex | `register` response |
| Task ID | `task_` + 16 hex | `task` response |
| Escrow ID | `escrow_` + 16 hex | `task` response |
| RTP URI | `rtp://gateway.spraay.app/<robot_id>` | `register`, `list`, `profile` |
| peaqID | `did:peaq:0x<40-hex>` | the `/peaqos` skill |

---

## Specs

- [RTP 1.0](https://github.com/plagtech/rtp-spec/blob/main/spec/RTP-1.0.md)
- [BPA 1.0](https://docs.spraay.app/bpa/1.0/)
- [x402](https://x402.org)
