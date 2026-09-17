---
name: peaqos
description: |
  Onboard machines and manage fleets with peaqOS (peaq-os-cli 0.0.10 or newer,
  Economics 2.0), including Solana/SVM onboarding on mainnet with peaq-os-cli 0.0.12 or
  newer. Use it when someone asks to register a
  machine on peaq, get a peaqID or Machine NFT, manage lifecycle, subscriptions,
  DID or monetization, submit events, check an MCR score, manage a DePIN fleet,
  or connect a machine to the Machine Market. Covers Scale (market registration,
  agent pairing, service search, market orders incl. x402) and Stream (signed
  encrypted data chunks, buyer access after payment, paying for and decrypting
  data) on agung testnet and mainnet. Invoke on any mention of peaqOS, peaqID,
  MCR, machine registration, DePIN onboarding, the peaqos CLI, Machine Market,
  Scale, agent pairing, market orders, Stream, machine data sales or x402.
allowed-tools: Bash Read Glob Grep AskUserQuestion WebFetch
license: Apache-2.0
compatibility: Requires Python 3.10+ and peaq-os-cli 0.0.10+; Solana requires peaq-os-cli 0.0.12+ with peaq-os-sdk 0.8.0+ and the solana/ows extras
---

# peaqOS: Windsurf Adapter

Load and follow `AGENT-PROMPT.md` from the skill root. All phase logic, routing, security rules,
and tone calibration are defined there.

Knowledge files are in `knowledge/` and `GUIDE.md`: read them at runtime as directed by
`AGENT-PROMPT.md`. Do not duplicate their content here.
