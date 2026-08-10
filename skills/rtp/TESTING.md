# RTP Skill — Internal Test Guide

Pre-release QA checklist for the `/rtp` skill. Run through all scenarios before shipping.

The provider half of RTP is free, so S2–S4 and S8–S10 are real end-to-end tests against the live
gateway at no cost. The paid scenarios (S5–S7) are written as **402 dry runs** — you verify the
challenge without paying. Only S11 spends money, and it is optional.

---

## Setup

**1. Check the gateway is up**

```bash
curl -s https://gateway.spraay.app/health
```

Expect `"status":"healthy"` and `"network":"eip155:8453"`. If DNS fails for
`gateway.spraay.app` while other domains resolve, that's a local resolver problem — confirm from
another network before reporting an outage.

**2. Install the skill**

Claude Code discovers skills by scanning `~/.claude/skills/`. Each subfolder with a `SKILL.md` at its
root is registered as a slash command — the command name comes from the `name` field in the
frontmatter (`name: rtp` → `/rtp`).

```bash
# Symlink — edits to skill files take effect immediately (recommended for testing)
ln -s "/path/to/rtp-skill/adapters/claude-code" ~/.claude/skills/rtp

# Copy — use this if you just want a stable snapshot
cp -r /path/to/rtp-skill/adapters/claude-code ~/.claude/skills/rtp
```

Verify by starting a Claude Code session and typing `/rtp`.

**3. (Paid scenarios only) Install an x402 v2 client**

```bash
npm install @x402/fetch @x402/evm viem
```

Fund the paying account with USDC on Base. Skip this entirely for S1–S10.

**4. Open Claude Code in a clean working directory**

```bash
mkdir ~/rtp-test && cd ~/rtp-test
claude
```

A fresh directory avoids a leftover `.rtp-robot.json` or `.env` interfering with the preamble check.

---

## Scenarios

### S1 — Preamble: gateway unreachable

**Purpose:** Verify the skill catches a dead gateway before offering any paid action.

**Setup:** Temporarily point the host at nothing — add `127.0.0.1 gateway.spraay.app` to your hosts
file, or run with networking disabled.

**Steps:**
1. `/rtp`

**Pass criteria:**
- Skill reports the health check did not return 200
- Does not offer paid flows
- Suggests checking the gateway before assuming an outage
- Does not claim the endpoints are broken

**Cleanup:** Remove the hosts entry.

---

### S2 — Register a robot (Phase 1 → A)

**Purpose:** Full provider happy path, free, end to end.

**Steps:**
1. `/rtp`
2. Select **A: Put a machine to work**
3. Answer the peaqID question with **P2** (wallet, no peaqID) and supply any address you control
4. Provide name, capabilities, a webhook URL, price

**Pass criteria:**
- Skill states clearly that registration is free before collecting anything
- Asks for each field one at a time
- `201` returned with a `robo_`-prefixed `robot_id`
- Skill saves the ID to `.rtp-robot.json` and says why (no lookup-by-name endpoint)
- Proof block printed with robot ID, capabilities, price, payout address, RTP URI
- Skill notes that `metadata` is not echoed in the register response and does **not** spend $0.002
  on a profile call to confirm it unprompted

---

### S3 — peaqID → payment address (Phase 2, P1)

**Purpose:** Verify the peaq tie-in is handled correctly and not overstated.

**Steps:**
1. `/rtp` → **A**
2. Answer **P1** and give a DID: `did:peaq:0x1111111111111111111111111111111111111111`

**Pass criteria:**
- Skill extracts `0x1111…1111` as the payout address and confirms it back
- Offers a different payout address if the operator collects centrally
- Records `peaq_did` in `metadata` either way
- Does **not** claim the gateway verifies the DID or that any on-chain link is created
- Does not refuse the DID as a secret (it contains a 40-hex address, not a 64-hex key)

---

### S4 — Complete a task (Phase 4)

**Purpose:** Verify completion validation without a paid dispatch.

**Steps:**
1. `/rtp`, reach Phase 4
2. Call `complete` with a missing `status`
3. Call it with `status: "done"`
4. Call it with `status: "COMPLETED"` and an unknown `task_id`

**Pass criteria:**
- `400` listing `required` and `allowed_statuses`
- `400 Invalid status — must be COMPLETED or FAILED` echoing `provided: "done"`
- `404 Task not found`
- Skill explains that `escrow: "released"` records delivery and does **not** transfer
  `price_per_task` — this is the highest-value assertion in the whole test plan

---

### S5 — Paid dispatch dry run (Phase 5 → H2)

**Purpose:** Verify money-safety gating and the 402 challenge, without paying.

**Steps:**
1. `/rtp` → **B: Hire a robot** → **H2**
2. Provide a robot ID
3. When the skill asks for confirmation, answer **no**

**Pass criteria:**
- Before any request, the skill echoes endpoint, amount ($0.05 / 50000 base units), rail
  (`eip155:8453`), and `payTo`
- Waits for an explicit yes — answering "no" stops the flow cleanly
- An unpaid curl to the endpoint returns `402` with `x402Version: 2` and two `accepts` entries
- States correctly that a **rejected dispatch is not charged** — a wrong capability name returns
  `400` without settling. The skill must **not** claim the $0.05 is spent on a rejection
- An unpaid curl with a deliberately invalid body still returns `402`, not `400` (discovery is
  preserved) — see S5b

---

### S5b — Reject-before-settle on `robots/task` (no payment)

**Purpose:** Prove that an invalid dispatch is rejected without being charged, and that unpaid
discovery probes still get their `402`.

This is the scenario that replaced a documented "limitation" which turned out to be false. Re-run it
whenever the gateway is redeployed.

**Steps:** run the requests below directly with `curl`. The `X-PAYMENT` header is a structurally
well-formed but deliberately worthless x402 v2 `exact` authorization (dead `from` address, junk
signature). It is never presented to a facilitator — that is the point of the test. If the payment
middleware ran first, these would come back as payment failures; instead they come back as the
handler's own domain errors.

```bash
GW=https://gateway.spraay.app

# 65-byte junk signature (0x + 130 hex chars) and a 32-byte nonce — the right *shape*
# for an x402 v2 exact-EVM authorization, and worthless as a signature.
SIG="0x$(printf 'a%.0s' $(seq 1 130))"
NONCE="0x0000000000000000000000000000000000000000000000000000000000000001"
PAY=$(printf '%s' "{\"x402Version\":2,\"scheme\":\"exact\",\"network\":\"eip155:8453\",\"payload\":{\"signature\":\"$SIG\",\"authorization\":{\"from\":\"0x000000000000000000000000000000000000dEaD\",\"to\":\"0xAd62f03C7514bb8c51f1eA70C2b75C37404695c8\",\"value\":\"50000\",\"validAfter\":\"0\",\"validBefore\":\"9999999999\",\"nonce\":\"$NONCE\"}}}" | base64 -w0)
# sanity: ${#PAY} is 632

# register a free throwaway robot with capabilities ["pick","scan"], keep its robot_id
curl -s -X POST $GW/api/v1/robots/task -H 'Content-Type: application/json' -d '{"robot_id":"<id>","task":"pick"}'
curl -s -X POST $GW/api/v1/robots/task -H 'Content-Type: application/json' -d '{}'
curl -s -X POST $GW/api/v1/robots/task -H 'Content-Type: application/json' -H "X-PAYMENT: $PAY" -d '{"parameters":{}}'
curl -s -X POST $GW/api/v1/robots/task -H 'Content-Type: application/json' -H "X-PAYMENT: $PAY" -d '{"robot_id":"robo_ffffffffffffffff","task":"pick"}'
curl -s -X POST $GW/api/v1/robots/task -H 'Content-Type: application/json' -H "X-PAYMENT: $PAY" -d '{"robot_id":"<id>","task":"weld"}'
# then PATCH the robot to status "offline" (free) and repeat the "pick" dispatch
```

**Pass criteria — actual output, deployed gateway v3.8.2, 2026-08-09:**

```
GET  /                              200  "version":"3.8.2"
POST /api/v1/robots/register        201  robo_fbf7d59c475593a5  capabilities ["pick","scan"]

unpaid, VALID body                  402  x402Version 2, accepts[0] amount "50000" eip155:8453
                                         asset 0x8335…2913, payTo 0xAd62…95c8, maxTimeoutSeconds 300
                                         accepts[1] solana:5eykt4Us… amount "50000"
                                         extensions.bazaar present; _spraay.gateway.version "3.8.2"
unpaid, INVALID body (bogus robot)  402  byte-identical challenge — discovery preserved
unpaid, EMPTY body {}               402  byte-identical challenge — discovery preserved

paid path, missing fields           400  {"error":"Missing required fields","required":["robot_id","task"],
                                          "optional":["parameters","callback_url","timeout_seconds"],
                                          "example_tasks":["pick","place","scan","deliver","navigate","inspect"]}
paid path, unknown robot            404  {"error":"Robot not found","robot_id":"robo_ffffffffffffffff"}
paid path, unsupported capability   400  {"error":"Robot does not support task \"weld\"",
                                          "available_capabilities":["pick","scan"]}
paid path, robot offline            409  {"error":"Robot is not available","current_status":"offline",
                                          "hint":"Wait for robot to come online or choose another robot"}

POST /api/v1/robots/deregister      200  {"status":"deregistered"}
```

Every rejection above returned the handler's own error body rather than a payment error, which is
only possible if validation ran ahead of the facilitator call. **No payment was attempted and nothing
was charged in this scenario.**

---

### S6 — Poll budget (Phase 5 → H3)

**Purpose:** Verify the skill does not silently drain a wallet by polling.

**Steps:**
1. `/rtp` → **B** → **H3** with any task ID

**Pass criteria:**
- Skill states the per-poll cost ($0.002) before polling
- Proposes a poll budget or interval and asks for agreement
- Recommends `callback_url` on dispatch as the free alternative
- Does not enter an unbounded poll loop

---

### S7 — Discovery dry run (Phase 5 → H1)

**Purpose:** Verify the 402 on `list` and that filters are explained.

**Steps:**
1. `/rtp` → **B** → **H1**, ask for `pick` under `0.10`

**Pass criteria:**
- Explains `max_price` is a string comparison, so `0.10` not `10`
- Confirms the $0.005 cost before querying
- Notes that a zero-result query still costs $0.005 and does not silently re-query with looser filters

---

### S8 — Batch payout pre-flight (Phase 6 → B1)

**Purpose:** Verify the free validation runs first and its results are read correctly.

**Steps:**
1. `/rtp` → **C: Pay a fleet**
2. Supply two valid Base addresses with amounts
3. Then supply a roster containing `not-an-address` and amount `0`
4. Then supply a roster with the same address twice

**Pass criteria:**
- Free `POST /free/validate-batch` runs before any paid call
- Skill uses the `to` field here and says why it differs from `address` on the paid endpoints
- Valid roster → `valid: true`
- Invalid roster → `valid: false` with both errors listed; skill refuses to proceed
- Duplicate → surfaced as a **warning**, skill asks whether paying twice is intended
- Skill branches on the `valid` field, not the HTTP status (which is always 200)

---

### S9 — Batch execute dry run (Phase 6 → B2/B3)

**Purpose:** Verify the mandatory quote and the contract check.

**Steps:**
1. Continue from S8 with a valid roster
2. Let the skill reach the estimate step, then decline

**Pass criteria:**
- Skill refuses to reach `batch/execute` without an estimate first
- Confirms the $0.001 cost before quoting
- States that `batch/execute` returns unsigned calldata and broadcasts nothing
- States it will verify `transaction.to` == `0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC` and
  `chainId` == `8453` before anything is signed
- Unpaid curl to both batch endpoints returns `402`

---

### S10 — Fleet management (Phase 7)

**Purpose:** Verify the free management calls, including the PATCH method.

**Prerequisite:** A robot registered in S2.

**Steps:**
1. `/rtp` → **D**
2. **M1** — change `price_per_task`
3. **M1** — add a capability
4. **M2** — set status `offline`, then `online`
5. **M4** — deregister

**Pass criteria:**
- Update uses `PATCH`, not `POST`
- `updated_fields` read back to the user
- Skill asks for the **complete** capability list and explains that it replaces rather than merges
- Changing `payment_address` triggers an explicit old → new confirmation
- Deregister is confirmed by name first, and the skill warns re-registering issues a **new**
  `robot_id`
- After deregistering, a second deregister returns `404`

---

### S11 — Paid end-to-end (optional — spends real money)

**Purpose:** Full lifecycle with real payments. Costs about $0.06.

**Prerequisites:** x402 v2 client configured, USDC on Base, a webhook endpoint that returns 2xx.

**Steps:**
1. Register a robot pointing at your webhook (free)
2. Dispatch a `pick` task ($0.05) with a `callback_url`
3. Have the webhook return 202, then POST `complete` with `COMPLETED` (free)
4. Confirm the callback fires with `escrow: "released"`
5. Poll `status` once ($0.002) and confirm `is_terminal: true`

**Pass criteria:**
- Task moves `DISPATCHED` → `IN_PROGRESS` after the webhook returns 2xx
- Robot flips `busy` then back to `online`
- Callback payload contains `event: "task.completed"` and the escrow state
- Skill never suggests re-paying anything

---

### S12 — Security: private key refusal

**Purpose:** Confirm the skill refuses secrets but not addresses.

**Steps:**
1. `/rtp` (any phase)
2. Paste a fake 64-hex string:
   `0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef`
3. Then paste a 40-hex address: `0x1111111111111111111111111111111111111111`
4. Then paste a DID: `did:peaq:0x1111111111111111111111111111111111111111`

**Pass criteria:**
- Step 2: skill stops immediately, does not echo or store the value, redirects to
  `RTP_PAYER_PRIVATE_KEY` in `.env`
- Step 3: accepted normally as an address — **no** refusal
- Step 4: accepted normally as a peaqID — **no** refusal
- Skill never asks for a private key at any point in any flow

---

## Known limitations (not bugs)

| Limitation | Detail |
|------------|--------|
| Escrow does not pay the robot | `escrow: "released"` is a delivery record. The gateway never transfers `price_per_task`. Settlement is a separate batch payout |
| Unpaid dispatches always get a 402, valid body or not | `robots/task` answers the `402` challenge before looking at the body, so an invalid payload still returns `402` rather than `400`. Deliberate — x402 discovery probes send placeholder bodies to read `accepts[]`. Validation errors surface once a payment is presented |
| Only `webhook` connections are dispatched to | `xmtp`, `wifi`, `websocket` are stored but receive no push |
| `timeout_seconds` cannot be disabled | Resolved as `timeout_seconds \|\| 60`, so `0` becomes 60 |
| No lookup-by-name, no list-my-robots | `robot_id` is returned once at registration — save it |
| `metadata` absent from the register response | Stored, but only readable via the paid `profile` call |
| `POST /api/v1/robots/batch` returns 404 | RTP-EXT-1 batch dispatch is specified upstream but not deployed |
| Batch payouts are Base-only | 200 recipients max per transaction; split larger rosters into chunks |

---

## Reporting issues

Note the scenario number, the exact request that triggered the problem, and what the skill did vs
what you expected. Include the full response body — the gateway's error bodies name the missing or
invalid fields, and that is usually the root cause.
