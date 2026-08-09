---
name: rtp
description: |
  Put peaq machines to paid work on the Robot Task Protocol (RTP) via the Spraay x402 gateway.
  Use this skill when someone asks to: register a robot, drone, or machine so it can accept paid
  tasks, list or discover robots for hire, dispatch a paid task to a robot, poll a task's status,
  report a task complete and release escrow, look up a robot's profile or capabilities, set or
  change per-task pricing, take a machine offline, or pay a whole fleet of robot operators at once.
  Also handles batch payouts: validating a payout roster, quoting the fee, and building the atomic
  Base transaction that pays up to 200 recipients (BPA 1.0). Payment is USDC over x402 on Base
  (eip155:8453) or Solana. A machine's peaqID address doubles as its RTP payment address, so a
  peaq-onboarded machine can start earning without a second identity. Invoke on any mention of RTP,
  Robot Task Protocol, robot tasks, hiring a robot, machine-to-machine payments, x402 robot
  payments, Spraay gateway, robot escrow, fleet payouts, batch payments, BPA, or paying many
  wallets at once.
allowed-tools: Bash Read Glob Grep AskUserQuestion WebFetch
license: Apache-2.0
compatibility: Requires curl; paid endpoints require an x402 v2 client and a funded USDC wallet
---

# RTP — Claude Code Adapter

Load and follow `AGENT-PROMPT.md` from the skill root. All phase logic, routing, money-safety rules,
and tone calibration are defined there.

Knowledge files are in `knowledge/` and `GUIDE.md` — read them at runtime as directed by
`AGENT-PROMPT.md`. Do not duplicate their content here.
