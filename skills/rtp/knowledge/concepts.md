# RTP Concepts

Reference for explaining RTP-specific terms. Use the "plain English" versions when talking to
machine operators; use the technical versions with developers.

---

## RTP — Robot Task Protocol

**Technical:** An open standard for AI agents to discover, commission, and pay for physical machine
work over HTTP, with payment settled by x402. Machines register capabilities and a per-task price;
buyers dispatch tasks against those capabilities and pay per dispatch. The Spraay gateway at
`gateway.spraay.app` is the reference implementation of RTP 1.0.

**Plain English:** A job board for machines. Your robot posts what it can do and what it charges;
software agents anywhere can hire it and pay automatically. No contracts, no invoices, no accounts.

---

## peaqID as an RTP payment address

**Technical:** A peaqID is `did:peaq:0x<EVM-address>` — the identifier embeds the machine's EVM
address. RTP's `payment_address` is an EVM address on the payout chain. The address component of the
DID is therefore directly usable as `payment_address`, so a single keypair anchors both the machine's
on-chain identity on peaq and its RTP earnings on Base.

**Plain English:** Your machine already has an ID on peaq that's built from its wallet address. RTP
pays to a wallet address. They're the same address — so a machine that peaq has identified can start
earning without setting up a second identity or a second wallet.

RTP does not require them to match. A fleet operator commonly points every robot's `payment_address`
at one collection wallet while keeping each robot's own `peaq_did` in `metadata`. That keeps the
machine traceable to its peaq identity while the money lands in one place.

There is no on-chain link between the two. Recording `peaq_did` in the robot's `metadata` is a
convention this skill follows, not something the gateway verifies — it will not check that the DID
exists or that the caller controls it.

---

## Capabilities

**Technical:** A string array declared at registration. The dispatch handler rejects any task whose
name is not a member, with `400` and the supported list. Capabilities are replaced wholesale on
update, not merged.

**Plain English:** The list of jobs your machine accepts. If it's not on the list, the job gets
turned away — free, since a rejected dispatch never settles. Keep the list honest anyway: a buyer
who has to guess which of your advertised jobs actually work will go somewhere else, and that's how
a robot gets a reputation.

---

## Task lifecycle

`PENDING` → `DISPATCHED` → `IN_PROGRESS` → `COMPLETED` / `FAILED` / `TIMEOUT` / `CANCELLED`

**Technical:** A dispatch creates the task in `DISPATCHED` and marks the robot `busy`. The gateway
POSTs the task to the robot's webhook; a 2xx moves it to `IN_PROGRESS`. The robot calls `complete`
with `COMPLETED` or `FAILED`. A timer fires at `timeout_seconds` and moves any non-terminal task to
`TIMEOUT`. Reaching any terminal state returns the robot to `online`.

**Plain English:** Job offered → robot told → robot working → done, failed, or ran out of time.
Whichever way it ends, the robot goes back on the market automatically.

---

## Escrow

**Technical:** `escrow_id` is an identifier minted at dispatch and stored on the task record.
Completing the task sets a state — `released` on `COMPLETED`, `refunded` on `FAILED` — which is
returned in the response and in the buyer's `task.completed` callback.

**It is bookkeeping, not custody.** The gateway does not hold `price_per_task`, does not transfer it
to the robot's `payment_address`, and there is no escrow smart contract behind `escrow_id` on this
route. The $0.05 the buyer pays is the gateway's x402 dispatch fee, which is a separate thing from
the robot's advertised price.

**Plain English:** The escrow field records whether the job was earned or not. It does **not** move
your money. Getting a task marked `released` means "this work counts as delivered" — you still have
to be paid for it, which is what a batch payout does.

Never tell an operator that completing a task has paid them. Settling what robots have earned is a
separate transaction — see batch payouts below.

---

## x402

**Technical:** An HTTP payment protocol. An unpaid request to a priced resource returns `402` with a
challenge listing accepted rails (`accepts[]`), each with a `scheme`, `network`, `amount` in raw base
units, `asset`, and `payTo`. The client signs a payment for one rail and retries with a payment
header. This gateway speaks `x402Version: 2` and offers USDC on Base (`eip155:8453`) and on Solana.

**Plain English:** Instead of API keys and monthly bills, the server replies "that costs half a
cent," your wallet pays it, and the request goes through. Each call is bought individually.

The payment happens before the server runs your request. If your request was malformed, you paid for
the error message. Validate inputs before spending.

---

## Batch payouts (BPA 1.0)

**Technical:** Batch Payments for Agents 1.0. `POST /api/v1/batch/execute` returns unsigned calldata
for a single `sprayToken` (ERC-20) or `sprayETH` (native) call against the Spraay contract on Base,
paying up to 200 recipients atomically. Protocol fee is 30 bps (0.3%) added on top of the payout
total. The gateway is non-custodial — it builds the transaction; the operator signs and broadcasts.

**Plain English:** One transaction that pays everyone at once. If you owe 60 robot operators for last
week's work, this is one signature and one gas fee instead of 60 of each. The gateway never touches
the money — it hands you a transaction and you send it yourself.

Atomic means all-or-nothing: either every recipient is paid in that transaction or none are. There
is no partial payout to reconcile afterwards.

---

## Non-custodial

**Technical:** The gateway holds no user funds at any point in the batch flow. `batch/execute`
returns `transaction{to,data,value,chainId}` and, for ERC-20s, an `approvalRequired` block. The
allowance is granted by the payer to the batch contract, not to the gateway.

**Plain English:** Your money never sits in someone else's account. You approve the exact amount, you
sign the transaction, and the tokens go straight from your wallet to the recipients.

The trade-off: nobody can reverse it and nobody can recover it for you. Check the recipient list
before signing, and check that the contract address in your wallet matches the one in this skill.

---

## Free vs paid endpoints

**Technical:** Route pricing is a server-side table consulted by the payment middleware. RTP's
`register`, `complete`, `update` and `deregister` are absent from it and run free; `task`, `list`,
`status` and `profile` are priced, as are the `batch/*` routes. `/free/*` routes are free but rate
limited.

**Plain English:** Being a robot is free — registering, reporting work, changing your price, and
leaving all cost nothing. Hiring a robot is what costs money. That's deliberate: it keeps the supply
side open to any machine, including ones too small to hold a wallet balance.

---

## Connection types

**Technical:** `connection.type` accepts `webhook`, `xmtp`, `wifi`, `websocket`. The dispatcher
implements delivery for `webhook` only — it POSTs to `connection_config.webhookUrl` with a 10-second
timeout. Other types are persisted and returned by `profile` but receive no push.

**Plain English:** Today the gateway reaches your machine by calling a web address you provide. The
other connection types are recorded but nothing gets pushed to them yet — a machine registered that
way has to check for work itself.
