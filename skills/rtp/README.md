# RTP Skill

A framework-agnostic agent skill that puts peaq machines to paid work on the
[Robot Task Protocol](https://github.com/plagtech/rtp-spec). It drives the
[Spraay gateway](https://gateway.spraay.app) — the reference implementation of RTP 1.0 — so a
machine can advertise what it does, accept paid tasks from AI agents, and get settled in USDC.

peaq gives machines identity. RTP gives them paid work. A machine's peaqID address is directly usable
as its RTP payout address, so a machine onboarded with `/peaqos` can start earning without a second
identity or a second wallet.

Ships with adapters for Claude Code, Cursor, and Windsurf out of the box — porting to other agent
frameworks requires only a thin adapter file.

---

## What it does

Invoke `/rtp` in Claude Code and the skill will:

- **Put a machine to work** — register a robot with its capabilities, price, payout address and
  webhook, then serve dispatched tasks and report completion. Every step on this side is **free**
- **Hire a robot** — discover machines by capability, chain and price, dispatch a paid task over
  x402, poll the lifecycle, and read a robot's profile and completion stats
- **Pay a fleet** — validate a payout roster for free, quote it live, then build one atomic Base
  transaction that pays up to 200 robot operators (BPA 1.0), with a 0.3% protocol fee
- **Manage a fleet** — change pricing or capabilities, take a machine offline, remove it
- **Troubleshoot** — diagnose the failures that actually happen: capability mismatches, webhook
  timeouts, escrow misunderstandings, the three different batch recipient shapes

Adapts its language to your background: concise and direct for developers, plain English with
narrated steps for machine operators.

---

## Money safety

Two things here move real money, and the skill treats them differently:

- **x402 calls debit your wallet the moment they're sent.** The skill echoes the endpoint, the exact
  amount, the rail and the recipient, and waits for an explicit "yes" before the first paid call and
  before every task dispatch. A dispatch the gateway *rejects* is not charged — a `4xx` cancels
  settlement, and since gateway v3.8.2 an invalid paid dispatch is rejected before any facilitator
  contact — so the confirmation prompt exists to stop unwanted **successful** spends, not to insure
  you against typos.
- **The batch payout call itself is safe.** `batch/execute` returns unsigned calldata and broadcasts
  nothing; the irreversible moment is when you sign. The skill runs a free validation, then a
  mandatory live quote, then reads the full roster back to you before you sign anything.

The only batch contract this skill will ever use is
[`0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC`](https://basescan.org/address/0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC)
on Base. If a response returns any other `to` address or a `chainId` other than `8453`, the skill
stops and tells you not to sign.

---

## Requirements

- **`curl`** — enough on its own for the whole provider side
- **Node ≥ 18** and an x402 **v2** client (`@x402/fetch`, `@x402/evm`, `viem`) — only for paid calls
- **USDC on Base** in the paying account, plus ETH for gas if you send a batch payout
- A public HTTPS endpoint for your machine, if you want tasks pushed to it
- No peaqID required — but if the machine has one, it plugs straight in

---

## Install the client

```bash
npm install @x402/fetch @x402/evm viem
```

The gateway speaks x402 **v2**. The older `x402-fetch` package implements v1 and is deprecated.
The RTP spec repo's examples import `@spraayprotocol/rtp-sdk` (published, `0.1.0`); nothing in this
skill needs it — the paid calls go through `@x402/fetch` directly.

---

## Install the skill

**Claude Code**

Claude Code discovers skills by scanning `~/.claude/skills/`. Point it at the adapter:

```bash
# Option A — symlink (picks up changes automatically)
ln -s /path/to/rtp-skill/adapters/claude-code ~/.claude/skills/rtp

# Option B — copy
cp -r /path/to/rtp-skill/adapters/claude-code ~/.claude/skills/rtp
```

Then invoke it from any Claude Code session:

```
/rtp
```

**Other agent frameworks**

Load `AGENT-PROMPT.md` as the agent's system prompt or instructions. Make the `knowledge/` files and
`GUIDE.md` accessible to the agent (as tool-readable files or injected context). Implement the
interactive questioning steps using your framework's input primitives. No other changes are needed —
all logic lives in `AGENT-PROMPT.md` and the knowledge files.

---

## Quick endpoint reference

Base URL `https://gateway.spraay.app`. These are the calls the skill drives — you can also run them
directly.

| Goal | Call | Price |
|------|------|-------|
| Register a robot | `POST /api/v1/robots/register` | free |
| Report a task done | `POST /api/v1/robots/complete` | free |
| Change price / capabilities / status | `PATCH /api/v1/robots/update` | free |
| Remove a robot | `POST /api/v1/robots/deregister` | free |
| Dispatch a paid task | `POST /api/v1/robots/task` | $0.05 |
| Discover robots | `GET /api/v1/robots/list` | $0.005 |
| Poll a task | `GET /api/v1/robots/status` | $0.002 |
| Read a robot profile | `GET /api/v1/robots/profile` | $0.002 |
| Validate a payout roster | `POST /free/validate-batch` | free |
| Rough batch cost preview | `GET /free/estimate-batch` | free |
| Live batch quote | `POST /api/v1/batch/estimate` | $0.001 |
| Build the batch transaction | `POST /api/v1/batch/execute` | $0.02 |
| Gateway liveness | `GET /health` | free |

`POST /api/v1/robots/batch` (RTP-EXT-1 batch dispatch) is specified upstream but **not deployed** on
this gateway — it returns 404. Dispatch tasks individually.

---

## Skill structure

```
rtp-skill/
├── AGENT-PROMPT.md               # Framework-agnostic orchestration (8-phase logic, routing, money safety)
├── SKILL.md                      # Root skill entry (mirrors the Claude Code adapter)
├── TESTING.md                    # Manual test plan
├── manifest.json                 # Metadata, capability requirements, adapter list
├── GUIDE.md                      # Portable operator manual — every request and response
├── knowledge/
│   ├── decision-tree.md          # Role questionnaire, recommendation matrix, cost-first framing
│   ├── concepts.md               # RTP, x402, escrow, peaqID as payment address, BPA batch payouts
│   ├── api-reference.md          # Every endpoint, field, price, status code, recipient shapes
│   └── troubleshooting.md        # Symptom → cause → fix
├── adapters/
│   ├── claude-code/
│   │   └── SKILL.md              # Claude Code adapter (thin wrapper over AGENT-PROMPT.md)
│   ├── cursor/
│   │   └── SKILL.md              # Cursor adapter
│   └── windsurf/
│       └── SKILL.md              # Windsurf adapter
└── examples/
    └── .env.example              # Annotated env template
```

`AGENT-PROMPT.md` is the source of truth for all agent behaviour. Adapters are thin wrappers that
wire it into a specific framework. The knowledge files are read at runtime and never duplicated.

---

## Networks

| | Base | Solana |
|-|------|--------|
| x402 network ID | `eip155:8453` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6dp) | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Batch payouts | Supported — contract above | Not supported by this skill |
| Explorer | [basescan.org](https://basescan.org) | [solscan.io](https://solscan.io) |

Both rails are offered on every 402 challenge; you pay one. Batch payouts are Base-only.

---

## Security

- **Never paste your private key in chat.** The skill refuses 64-hex secrets and mnemonics and
  redirects you to `RTP_PAYER_PRIVATE_KEY` in your `.env` file.
- Wallet **addresses** are public and handled normally — only secrets are refused.
- The skill never generates keys, invents payout addresses, or signs transactions for you. Batch
  payouts are non-custodial: you sign and broadcast from your own wallet.

---

## Troubleshooting

See `knowledge/troubleshooting.md` for a full symptom → cause → fix reference. Common issues:

- **`400 Robot does not support task`** → the capability name isn't in the robot's list; the dispatch
  was rejected without settling, so you were not charged
- **Task went to `TIMEOUT` and the robot never saw it** → the webhook must return 2xx within 10
  seconds; do the work asynchronously
- **`escrow: "released"` but no money arrived** → escrow is a delivery record, not a transfer. Settle
  earnings with a batch payout
- **Batch amounts off by a factor of a million** → the flat recipient form takes raw base units; the
  object form takes decimals

---

## Learn more

- [RTP 1.0 specification](https://github.com/plagtech/rtp-spec/blob/main/spec/RTP-1.0.md)
- [BPA 1.0 — Batch Payments for Agents](https://docs.spraay.app/bpa/1.0/)
- [x402 protocol](https://x402.org)
- [peaq documentation](https://docs.peaq.xyz)
