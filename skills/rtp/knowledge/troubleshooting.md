# RTP Troubleshooting

Symptom → cause → fix. Error strings are quoted exactly as the gateway returns them.

---

## Registration

### `400 Missing required fields`

**Cause:** One of `name`, `capabilities`, `payment_address`, `connection` is absent, or
`capabilities` was sent as a string instead of an array.

**Fix:** The response body carries `required`, `optional`, `connection_format` and a full `example`.
Read it back to the user and fill the gap. `capabilities` must be a JSON array —
`"capabilities": "pick"` fails, `"capabilities": ["pick"]` succeeds.

---

### Registration succeeded but `metadata` is missing from the response

**Cause:** Not a failure. The `register` response echoes `tags` but not `metadata`, by design.

**Fix:** The metadata was stored. Confirm with `GET /api/v1/robots/profile?robot_id=…` — but note
that costs $0.002, so only spend it if the user actually needs the confirmation.

---

### Lost the `robot_id`

**Cause:** `robot_id` is returned once, at registration. There is no lookup-by-name endpoint and no
"list my robots" endpoint scoped to a payment address.

**Fix:** `GET /api/v1/robots/list` ($0.005) returns every robot with its `payment_address` — filter
that response by the user's address locally. If the robot was registered by this skill it will also
be in `.rtp-robot.json` in the working directory. Going forward, save the ID at registration.

---

## Dispatch

### `400 Robot does not support task "<name>"`

**Cause:** The task name is not in the robot's `capabilities` array. Matching is exact and
case-sensitive.

**Fix:** The response includes `available_capabilities` — use one of those.

**You were not charged.** A `4xx` from this route cancels settlement, so a rejected dispatch is free;
on gateway v3.8.2 the payload is validated before any facilitator contact, so no payment is even
attempted. If you see a $0.05 debit alongside a `400` here, that is a bug worth reporting — check the
transaction against `payTo` before assuming it came from this call. Read the capability list from
`list` or `profile` first anyway, to save the round-trip.

---

### `409 Robot is not available`

**Cause:** The robot's status is not `online` — usually `busy` with another task, occasionally
`offline` because the operator set it that way.

**Fix:** The response carries `current_status`. If `busy`, wait — the robot returns to `online` when
its task reaches a terminal state, including on timeout. If `offline`, the operator has to bring it
back with `PATCH /robots/update`. Filter discovery with `status=online` to avoid this.

---

### `404 Robot not found`

**Cause:** Wrong `robot_id`, or the robot was deregistered.

**Fix:** Re-discover with `list`. Note that a deregistered robot that re-registers gets a **new**
`robot_id` — an old ID never comes back.

---

### The task went to `TIMEOUT` and the robot never saw it

**Cause:** The gateway POSTs to the robot's `webhookUrl` with a 10-second timeout. Common reasons it
fails: the endpoint isn't publicly reachable, it doesn't accept POST, it returns non-2xx, TLS is
misconfigured, or the handler does the physical work before responding and blows the 10 seconds.

**Fix:** The webhook must acknowledge fast and work asynchronously — return 2xx immediately, then do
the job, then call `complete`. Check the robot's registered URL with `profile`, and test it directly:

```bash
curl -s -X POST <webhookUrl> -H 'Content-Type: application/json' \
  -d '{"task_id":"test","task":"ping","parameters":{},"timeout_seconds":60,"complete_url":"https://gateway.spraay.app/api/v1/robots/complete"}' \
  -w '\n[HTTP %{http_code}]\n'
```

A task stuck in `DISPATCHED` rather than `IN_PROGRESS` means the webhook never returned 2xx.

---

### The task stays `DISPATCHED` and the connection type isn't `webhook`

**Cause:** The gateway only pushes to `webhook` connections. `xmtp`, `wifi` and `websocket` are
stored but nothing is delivered to them.

**Fix:** Either move the robot to a webhook connection with a free `PATCH /robots/update`, or have
the machine poll for its own tasks. Set expectations before registering with a non-webhook type.

---

## Completion

### `409 Task already finalized`

**Cause:** `complete` was called on a task already in `COMPLETED`, `FAILED`, `TIMEOUT` or
`CANCELLED`. Usually a retry after a response was lost, or a task that timed out mid-execution.

**Fix:** Do not retry — the state is fixed. Read `current_status` from the response. If it is
`TIMEOUT`, the work finished too late; raise `timeout_seconds` on future dispatches for that task
type.

---

### `400 Invalid status — must be COMPLETED or FAILED`

**Cause:** Anything other than those two exact uppercase strings — `"done"`, `"complete"`,
`"SUCCESS"`, `"completed"` all fail.

**Fix:** Send exactly `COMPLETED` or `FAILED`. The response echoes what was `provided`.

---

### The task shows `COMPLETED` and `escrow: "released"` but no money arrived

**Cause:** Working as designed, and the single most common misunderstanding in this skill. The
escrow state is a record that the work was delivered. The gateway does not transfer
`price_per_task` to the robot's `payment_address`, and `escrow_id` is not an on-chain escrow
contract.

**Fix:** Settle earnings separately — that is what the batch payout in Phase 6 is for. Tell the
operator plainly: `released` means "earned", not "paid".

---

## Payment

### `402 Payment Required` on a call the user expected to be free

**Cause:** They hit one of the four paid RTP routes (`task`, `list`, `status`, `profile`) or a
`batch/*` route. Free routes are `register`, `complete`, `update`, `deregister`, `/free/*`
and `/health`.

**Fix:** Check the table in `api-reference.md#endpoint-summary`. If the intent was a free operation,
there is usually a free equivalent — e.g. use the `callback_url` on dispatch instead of paying to
poll `status`.

---

### The x402 client doesn't pay — the 402 comes straight back

**Causes, in order of likelihood:**
1. Using `x402-fetch` (v1, deprecated) against a gateway that returns `x402Version: 2`
2. No scheme registered for `eip155:8453`
3. The signing account holds no USDC on Base
4. The signed payment expired — `maxTimeoutSeconds` is 300

**Fix:** Install the v2 packages (`@x402/fetch`, `@x402/evm`, `viem`) and register the Base scheme.
See `api-reference.md#client`. Check the account's USDC balance on Base
(`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`), not its ETH balance — ETH is only needed for gas on
the batch payout, not for x402.

---

### `npm install @spraay/rtp-sdk` fails with 404

**Cause:** Wrong scope. The SDK is published as **`@spraayprotocol/rtp-sdk`** — the shorter
`@spraay` scope was already taken on npm. The RTP spec repo's examples use the correct name.

**Fix:** Nothing in this skill needs the SDK — everything here is plain `curl` plus, for paid calls,
`@x402/fetch`. If you want the SDK for your own code, install `@spraayprotocol/rtp-sdk`.

---

### Paid a call and never got the response

**Cause:** A dropped connection after the payment settled.

**Fix:** **Do not repeat the call** — that pays twice. Recover the state instead:
- Lost a `task` response → the task exists but the `task_id` is unknown. There is no list-tasks-by-robot
  endpoint; if a `callback_url` was set, the completion event will still arrive with the `task_id`.
  Otherwise the task will run and time out on its own.
- Lost a `list` / `profile` / `status` response → re-querying costs again, but nothing was changed.
- Lost a `batch/execute` response → nothing was signed or broadcast; re-running is safe apart from
  the $0.02.

---

## Batch payouts

### Recipients rejected, or amounts wildly wrong

**Cause:** The wrong recipient shape. There are three across the batch surface, with different field
names and different units.

**Fix:** Read `api-reference.md#three-recipient-shapes`. In short:
- `/free/validate-batch` uses `to`
- `/api/v1/batch/*` uses `address`
- the flat form (`recipients: ["0x…"], amounts: ["50000"]`) is **raw base units**, so `"50000"` is
  0.05 USDC, not 50,000 USDC

An amount off by a factor of 10⁶ is always this. Prefer the object form with decimal strings.

---

### `400 Maximum 200 recipients`

**Cause:** More than 200 rows in one batch.

**Fix:** Split into chunks of ≤200 and send them as separate transactions. Each chunk is atomic on
its own; the set of chunks is not. Tell the user that, and pay chunks in a deterministic order so a
failure part-way through is easy to reconcile.

---

### `validate-batch` returned `valid: false` but HTTP 200

**Cause:** Expected. The endpoint reports validation results in the body and always answers 200.

**Fix:** Branch on the `valid` field, never on the status code.

---

### `validate-batch` flagged a duplicate address

**Cause:** The same recipient appears twice. This is a **warning**, not an error, so `valid` can
still be `true`.

**Fix:** Ask the user whether it's intentional — paying one operator for two robots legitimately
produces duplicates. The contract will pay both rows.

---

### `400 Unknown token "<x>"`

**Cause:** A token symbol the gateway doesn't have a shortcut for.

**Fix:** Use a known symbol (`USDC`, `USDT`, `EURC`, `DAI`, `WETH`, `ETH`) or pass the ERC-20
contract address directly. Note that for an unknown address the gateway assumes **18 decimals** — if
the token is not 18dp, use the flat form with raw base units you scaled yourself.

---

### The wallet shows a different contract than expected

**Cause:** Either the request went somewhere other than this gateway, or the response was altered.

**Fix:** **Stop. Do not sign.** The only batch contract this skill uses is
`0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC` on Base (`chainId: 8453`). Anything else is wrong.
Note that the gateway's own configuration lists a different contract for Unichain — this skill does
not support Unichain payouts, so seeing that address means the request was not the one this skill
builds.

---

### Approval succeeded but the batch reverts

**Causes:** The allowance is smaller than `totalWithFee` (approving `totalAmount` and forgetting the
0.3% fee is the usual reason), the payer's token balance is short, or the payer has no ETH for gas.

**Fix:** Approve `approvalRequired.amount` exactly — that value already includes the fee. Confirm the
payer holds at least `batch.totalWithFee` of the token, plus ETH for gas on Base.

---

## Gateway

### `/health` is not 200, or DNS won't resolve `gateway.spraay.app`

**Cause:** Gateway outage, or local DNS.

**Fix:** Check `https://gateway.spraay.app/health` in a browser or from another network before
assuming an outage — a resolver that returns NXDOMAIN for the host while other domains resolve fine
is a local DNS problem, not a gateway one. A healthy response looks like:

```json
{"status":"healthy","uptime":"…","version":"1.0.0",
 "services":{"batchPayments":"ready"},"network":"eip155:8453","protocol":"x402"}
```

---

### `404 Cannot POST /api/v1/robots/batch`

**Cause:** Batch task dispatch (RTP-EXT-1) is specified in the RTP spec repo but is not deployed on
this gateway.

**Fix:** Dispatch tasks one at a time with `POST /api/v1/robots/task`. For paying many operators at
once — a different thing — use `POST /api/v1/batch/execute`.
