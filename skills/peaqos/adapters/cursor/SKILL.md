---
name: peaqos
description: |
  Onboard machines and fleet operators to peaqOS — peaq's financial OS for autonomous machines —
  using the peaq-os-cli Python CLI. Use this skill when someone asks to: register a machine on
  peaq, get a peaqID or Machine NFT, set up a Machine Credit Rating (MCR), submit machine events,
  check an MCR score, manage a DePIN fleet, onboard to peaqOS, or connect a machine to the
  Machine Market. Also handles Scale workflows: registering machines in the market, pairing AI
  agents, searching for services, placing and managing market orders — including x402
  pay-per-request services. Also handles Stream workflows: packaging machine data into signed,
  encrypted chunks, granting or auto-delivering buyer access after payment, and paying for and
  decrypting purchased data. Handles both agung testnet and mainnet. Adapts tone to developers
  and non-technical operators alike. Invoke on any mention of peaqOS, peaqID, MCR, machine
  registration, DePIN onboarding, the peaqos CLI, Machine Market, Scale, agent pairing, market
  orders, service discovery, Stream, selling machine data, data streams, or x402 payments.
allowed-tools: Bash Read Glob Grep AskUserQuestion WebFetch
license: Apache-2.0
compatibility: Requires Python 3.10+ and peaq-os-cli
---

# peaqOS — Cursor Adapter

Load and follow `AGENT-PROMPT.md` from the skill root. All phase logic, routing, security rules,
and tone calibration are defined there.

Knowledge files are in `knowledge/` and `GUIDE.md` — read them at runtime as directed by
`AGENT-PROMPT.md`. Do not duplicate their content here.
