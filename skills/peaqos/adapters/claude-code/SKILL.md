---
name: peaqos
description: |
  Execute peaqOS machine operations using the peaq-os-cli. Provides agent-executable playbooks for:
  onboarding a machine on-chain (peaqID, Machine NFT, MCR baseline), registering a machine in the
  Machine Market, pairing an AI agent to a machine, searching for services and placing market orders,
  submitting machine events, querying MCR and fleet status, and managing existing orders. Handles
  both agung testnet and mainnet. Invoke on any mention of peaqOS, peaqID, MCR, machine registration,
  peaqos activate, qualify event, qualify mcr, Machine Market, Scale, agent pairing, market orders,
  service discovery, or the peaqos CLI.
allowed-tools: Bash Read Glob Grep AskUserQuestion WebFetch
license: Apache-2.0
compatibility: Requires Python 3.11+ and peaq-os-cli (peaq-os-sdk 0.4.0 uses datetime.UTC, which fails to import on 3.10)
---

# peaqOS — Claude Code Adapter

Load and follow `AGENT-PROMPT.md` from the skill root. All playbook logic, routing, preflight checks,
and security rules are defined there.

Knowledge files are in `knowledge/` and `GUIDE.md` — read them at runtime as directed by
`AGENT-PROMPT.md`. Do not duplicate their content here.
