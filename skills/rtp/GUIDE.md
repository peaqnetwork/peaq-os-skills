# RTP Operator Guide

Portable manual for the Robot Task Protocol on the Spraay gateway. Every request below is
copy-pasteable. Free calls use plain `curl`; paid calls need an x402 client — see
[Paying for a call](#paying-for-a-call).

Base URL: `https://gateway.spraay.app`

---

## Contents

- [Install](#install)
- [Paying for a call](#paying-for-a-call)
- [Register a robot](#register-a-robot)
- [Serve tasks](#serve-tasks)
- [Hire a robot](#hire-a-robot)
- [Pay a fleet](#pay-a-fleet)
- [Fleet management](#fleet-management)
- [Reference tables](#reference-tables)

---

## Install

The free half of RTP needs nothing but `curl`:

```bash
curl -s https://gateway.spraay.app/health
```

```json
{"status":"healthy","uptime":"1d 0h 10m","version":"1.0.0",
 "services":{"aiGateway":"configured","batchPayments":"ready","swapData":"ready"},
 "network":"eip155:8453","protocol":"x402"}
```

For the paid endpoints you need Node 18+ and an x402 **v2** client:

```bash
npm install @x402/fetch @x402/evm viem
```

You also need USDC on Base in the paying account. The RTP spec repo's examples import
`@spraayprotocol/rtp-sdk` (published, `0.1.0`) — nothing in this skill needs it, because every paid
call here goes through `@x402/fetch` directly.

---

## Paying for a call

An unpaid request to a priced endpoint returns `402` with a challenge. You can see one without
paying anything:

```bash
curl -s "https://gateway.spraay.app/api/v1/robots/list?capability=pick" | head -c 400
```

To actually pay, wrap `fetch`:

```javascript
// pay.mjs
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.RTP_PAYER_PRIVATE_KEY);

export const pay = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(account) }],
});
```

```javascript
import { pay } from "./pay.mjs";

const res = await pay("https://gateway.spraay.app/api/v1/robots/list?capability=pick&status=online");
const { robots, total } = await res.json();
console.log(`${total} robot(s)`);
```

Amounts in the challenge are raw base units at 6 decimals: `5000` = $0.005, `50000` = $0.05.

A rejected request is **not** charged: any `4xx` from the handler cancels settlement, and since
gateway v3.8.2 `robots/task` validates the payload before it ever contacts a facilitator. Check your
inputs anyway to save the round-trip — just don't expect a rejection to cost you.

---

## Register a robot

Free. No wallet, no payment.

```bash
curl -s -X POST https://gateway.spraay.app/api/v1/robots/register \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "WarehouseBot-01",
    "description": "6-axis pick-and-place robot, Zone A",
    "capabilities": ["pick", "place", "scan"],
    "price_per_task": "0.05",
    "currency": "USDC",
    "chain": "base",
    "payment_address": "0xYourPayoutAddress",
    "connection": {
      "type": "webhook",
      "webhookUrl": "https://your-server.example/rtp/task"
    },
    "tags": ["peaq", "warehouse"],
    "metadata": {
      "peaq_did": "did:peaq:0xYourMachineAddress",
      "machine_type": "robot"
    }
  }'
```

```json
{
  "status": "registered",
  "robot_id": "robo_8d77926e974a5d94",
  "rtp_uri": "rtp://gateway.spraay.app/robo_8d77926e974a5d94",
  "x402_endpoint": "https://gateway.spraay.app/api/v1/robots/task",
  "robot": { "...": "..." }
}
```

**Save `robot_id`.** There is no lookup-by-name endpoint.

```bash
echo '{"robot_id":"robo_8d77926e974a5d94"}' > .rtp-robot.json
```

### Using a peaqID

A peaqID is `did:peaq:0x<address>`. The address inside it is a valid `payment_address`, so a
peaq-onboarded machine can be paid to the same key that holds its identity:

```
peaqID:          did:peaq:0x1234...abcd
payment_address: 0x1234...abcd
```

They don't have to match — fleet operators usually collect to one wallet — but recording
`metadata.peaq_did` keeps each robot traceable to its peaq identity. The gateway stores the DID
without verifying it.

---

## Serve tasks

### What the gateway sends

When a buyer dispatches, the gateway POSTs to your `webhookUrl` with a **10-second** timeout:

```json
{
  "task_id": "task_1a2b3c4d5e6f7a8b",
  "task": "pick",
  "parameters": { "item": "SKU-1234", "from_location": "A-04-2" },
  "timeout_seconds": 60,
  "complete_url": "https://gateway.spraay.app/api/v1/robots/complete"
}
```

Return `2xx` immediately — that moves the task to `IN_PROGRESS`. Do the physical work
asynchronously. A handler that finishes the job before replying will miss the 10-second window and
the task will end up `TIMEOUT`.

Minimal receiver:

```javascript
import express from "express";
const app = express();
app.use(express.json());

app.post("/rtp/task", (req, res) => {
  const { task_id, task, parameters, complete_url } = req.body;
  res.sendStatus(202);                         // acknowledge first
  runJob(task, parameters)                     // then work
    .then(output => report(complete_url, task_id, "COMPLETED", { output }))
    .catch(err  => report(complete_url, task_id, "FAILED", { error: String(err) }));
});

const report = (url, task_id, status, result) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id, status, result }),
  });

app.listen(3000);
```

### Report completion

Free.

```bash
curl -s -X POST https://gateway.spraay.app/api/v1/robots/complete \
  -H 'Content-Type: application/json' \
  -d '{
    "task_id": "task_1a2b3c4d5e6f7a8b",
    "status": "COMPLETED",
    "result": { "output": "Picked SKU-1234 from A-04-2", "data": { "weight_grams": 450 } }
  }'
```

```json
{ "task_id": "task_1a2b3c4d5e6f7a8b", "status": "COMPLETED",
  "escrow": "released", "result": { "...": "..." } }
```

`status` must be exactly `COMPLETED` or `FAILED`. Calling twice returns `409 Task already finalized`.

⚠️ `escrow: "released"` means the work counts as delivered. It does **not** mean you have been paid —
the gateway does not transfer `price_per_task`. Settle separately with a batch payout.

---

## Hire a robot

All paid. See [Paying for a call](#paying-for-a-call).

### Discover — $0.005

```
GET /api/v1/robots/list?capability=pick&chain=base&max_price=0.10&status=online
```

All filters optional. `max_price` compares as a string against `price_per_task`, so write it the way
robots publish it (`0.10`).

```json
{ "robots": [ { "robot_id": "robo_…", "name": "WarehouseBot-01",
                "capabilities": ["pick","place","scan"], "price_per_task": "0.05",
                "currency": "USDC", "chain": "base", "payment_address": "0x…",
                "status": "online", "connection_type": "webhook", "tags": ["peaq"],
                "rtp_uri": "rtp://gateway.spraay.app/robo_…" } ],
  "total": 1,
  "filters": { "capability": "pick", "chain": "base", "max_price": "0.10", "status": "online" } }
```

### Dispatch — $0.05

```bash
# via the wrapped fetch — see Paying for a call
POST /api/v1/robots/task
{
  "robot_id": "robo_8d77926e974a5d94",
  "task": "pick",
  "parameters": { "item": "SKU-1234", "from_location": "A-04-2" },
  "callback_url": "https://your-agent.example/rtp/done",
  "timeout_seconds": 120
}
```

```json
{ "status": "DISPATCHED", "task_id": "task_…", "escrow_id": "escrow_…",
  "robot_id": "robo_…", "task": "pick", "timeout_seconds": 120,
  "poll_url": "https://gateway.spraay.app/api/v1/robots/status?task_id=task_…" }
```

Set `callback_url` — the completion event is pushed to it for free, which beats paying $0.002 a poll:

```json
{ "event": "task.completed", "task_id": "…", "robot_id": "…", "status": "COMPLETED",
  "result": { "...": "..." }, "escrow": "released", "timestamp": "…" }
```

`timeout_seconds` defaults to 60 and cannot be disabled — a falsy value including `0` resolves back
to 60. For long jobs, pass a large number.

### Poll — $0.002 per call

```
GET /api/v1/robots/status?task_id=task_…
```

Stop as soon as `is_terminal` is `true`. Terminal: `COMPLETED`, `FAILED`, `TIMEOUT`, `CANCELLED`.

Polling every 2s for a 60s task costs $0.06 — more than the dispatch itself. Agree a budget first.

### Profile — $0.002

```
GET /api/v1/robots/profile?robot_id=robo_…
```

The only call that returns `metadata` (where `peaq_did` lives) and completion stats:

```json
{ "robot_id": "robo_…", "metadata": { "peaq_did": "did:peaq:0x…" },
  "stats": { "total_tasks": 12, "completed_tasks": 11 }, "...": "..." }
```

---

## Pay a fleet

One atomic transaction pays up to **200 recipients** on Base. Protocol fee **0.3%** on top. The
gateway is non-custodial — it builds the transaction, you sign it.

Run these in order.

### 1. Validate the roster — free

⚠️ This endpoint uses **`to`**. The paid endpoints below use **`address`**.

```bash
curl -s -X POST https://gateway.spraay.app/free/validate-batch \
  -H 'Content-Type: application/json' \
  -d '{
    "chain": "base",
    "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "recipients": [
      { "to": "0xAAAA...AAAA", "amount": "0.05" },
      { "to": "0xBBBB...BBBB", "amount": "0.08" }
    ]
  }'
```

```json
{ "valid": true, "errors": [], "warnings": [],
  "summary": { "chain": "base", "recipientCount": 2, "uniqueAddresses": 2,
               "totalAmount": 0.13, "bpaVersion": "1.0" } }
```

Always `200` — branch on `valid`, not the status code. Duplicate addresses come back as a
**warning**; the contract will pay both rows.

### 2. Quote — $0.001 — mandatory

```bash
POST /api/v1/batch/estimate
{
  "token": "USDC",
  "recipients": [
    { "address": "0xAAAA...AAAA", "amount": "0.05" },
    { "address": "0xBBBB...BBBB", "amount": "0.08" }
  ]
}
```

```json
{ "success": true, "token": { "symbol": "USDC", "decimals": 6 },
  "recipientCount": 2, "totalAmount": "0.13", "fee": "0.00039",
  "feePercent": "0.3%", "totalWithFee": "0.13039" }
```

### 3. Build the transaction — $0.02

Same body against `POST /api/v1/batch/execute`. Nothing is broadcast:

```json
{ "success": true,
  "contract": "0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC",
  "batch": { "recipientCount": 2, "totalAmount": "0.13", "fee": "0.00039",
             "feePercent": "0.3%", "totalWithFee": "0.13039" },
  "transaction": { "to": "0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC",
                   "data": "0x…", "value": "0", "chainId": 8453 },
  "approvalRequired": { "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                        "spender": "0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC",
                        "amount": "130390", "amountFormatted": "0.13039" } }
```

Check before going further:
- `transaction.to` == `0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC`
- `transaction.chainId` == `8453`
- `batch.recipientCount` matches your roster
- `batch.totalWithFee` matches step 2

### 4. Approve, then send

ERC-20 payouts need two transactions in order.

```javascript
import { createWalletClient, http, erc20Abi } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.RTP_PAYER_PRIVATE_KEY);
const wallet = createWalletClient({ account, chain: base, transport: http() });

// 1 — approve exactly what the batch needs, fee included
await wallet.writeContract({
  address: r.approvalRequired.token,
  abi: erc20Abi,
  functionName: "approve",
  args: [r.approvalRequired.spender, BigInt(r.approvalRequired.amount)],
});

// 2 — send the batch
const hash = await wallet.sendTransaction({
  to: r.transaction.to,
  data: r.transaction.data,
  value: BigInt(r.transaction.value),
});
console.log(`https://basescan.org/tx/${hash}`);
```

Approve `approvalRequired.amount` exactly — it already includes the 0.3% fee. Approving only
`totalAmount` makes the batch revert. Don't grant an unlimited allowance.

Native ETH payouts skip the approval and send `value: transaction.value`.

Over 200 recipients: split into chunks of ≤200. Each chunk is atomic on its own; the set is not.

---

## Fleet management

### Change a robot — free — note `PATCH`

```bash
curl -s -X PATCH https://gateway.spraay.app/api/v1/robots/update \
  -H 'Content-Type: application/json' \
  -d '{ "robot_id": "robo_…", "price_per_task": "0.08" }'
```

```json
{ "status": "updated", "robot_id": "robo_…",
  "updated_fields": ["price_per_task"],
  "robot": { "robot_id": "robo_…", "name": "…", "capabilities": ["…"],
             "price_per_task": "0.08", "status": "online", "updated_at": "…" } }
```

`capabilities` and `tags` are **replaced, not merged** — send the complete new list:

```bash
-d '{ "robot_id": "robo_…", "capabilities": ["pick","place","scan","inspect"] }'
```

### Offline / online — free

```bash
-d '{ "robot_id": "robo_…", "status": "offline" }'
```

A robot the gateway marked `busy` returns to `online` by itself when its task ends. Don't force it —
that can strand a live task.

### Remove — free — irreversible

```bash
curl -s -X POST https://gateway.spraay.app/api/v1/robots/deregister \
  -H 'Content-Type: application/json' \
  -d '{ "robot_id": "robo_…" }'
```

```json
{ "status": "deregistered", "robot_id": "robo_…", "name": "WarehouseBot-01" }
```

`409` with `active_tasks` means work is still in flight. Re-registering issues a **new** `robot_id`.

---

## Reference tables

### Endpoints and prices

| Endpoint | Method | Price |
|----------|--------|-------|
| `/api/v1/robots/register` | POST | free |
| `/api/v1/robots/complete` | POST | free |
| `/api/v1/robots/update` | PATCH | free |
| `/api/v1/robots/deregister` | POST | free |
| `/api/v1/robots/task` | POST | $0.05 |
| `/api/v1/robots/list` | GET | $0.005 |
| `/api/v1/robots/status` | GET | $0.002 |
| `/api/v1/robots/profile` | GET | $0.002 |
| `/api/v1/batch/execute` | POST | $0.02 |
| `/api/v1/batch/estimate` | POST | $0.001 |
| `/free/validate-batch` | POST | free |
| `/free/estimate-batch` | GET | free |

### Payment rails

| Rail | Network | Asset |
|------|---------|-------|
| Base | `eip155:8453` | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Solana | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

### Batch contract

| Chain | Chain ID | Contract |
|-------|----------|----------|
| Base | 8453 | `0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC` |

### Task states

| State | Terminal |
|-------|----------|
| `PENDING` / `DISPATCHED` / `IN_PROGRESS` | no |
| `COMPLETED` / `FAILED` / `TIMEOUT` / `CANCELLED` | yes |

---

## Specs

- [RTP 1.0](https://github.com/plagtech/rtp-spec/blob/main/spec/RTP-1.0.md)
- [BPA 1.0](https://docs.spraay.app/bpa/1.0/)
- [x402](https://x402.org)
