# peaqOS Skill

A framework-agnostic agent skill that onboards machine operators to [peaqOS](https://peaq.xyz) using Economics 2.0. It guides you through the full setup using the `peaqos` CLI: giving your machine a permanent on-chain identity (peaqID), an ownership NFT, and a Machine Credit Rating (MCR) built from verified event history.

Works on both **agung testnet** (free, no real money) and **mainnet**. Ships with adapters for Claude Code, Cursor, and Windsurf out of the box: porting to other agent frameworks requires only a thin adapter file.

---

## What it does

Invoke `/peaqos` in Claude Code and the skill will:

- **Demo mode**: walk you through a full testnet onboarding in ~15 minutes, step by step, with explanations at every stage
- **Real onboarding**: ask five questions about your machine and deployment, recommend the right architecture (self-owned or machine-owned, operator-controlled), then activate in one transaction and verify with machine status
- **Solana onboarding**: mainnet flow with peaq reservation, subscription, then native creation once the reservation mirror and the subscription terminal status are ready. Requires `peaq-os-cli` 0.0.10 or newer with `peaq-os-sdk` 0.8.0 (`[solana,ows]` extras).
- **Fleet management**: manage lifecycle, subscriptions, ownership and DID; check MCR and submit events
- **Scale / Machine Market**: register a machine in the Market, pair an AI agent, search for services, place and manage orders (confirm or dispute delivery), including x402 pay-per-request services
- **Stream / data sales**: package machine data into signed, encrypted chunks, grant or auto-deliver buyer access after payment, and pay for / decrypt purchased data (CLI 0.0.9+)
- **Troubleshooting**: diagnose common failures (funding, activation errors, MCR lag, key mismatches, Scale auth, Stream key/decryption errors) and walk you through the fix

Adapts its language to your background: concise and direct for developers, plain English with narrated steps for hobbyists and first-timers.

---

## Requirements

- **Python ≥ 3.10**
- **`peaq-os-cli` 0.0.9 or newer** installed (0.0.10 or newer for the Solana path; see below)
- A wallet private key (the skill can generate one for you if needed): not needed for the offline Stream crypto commands (`stream publish`/`grant`/`consume` in local mode)
- For mainnet: PEAQ for gas and the oracle-priced tier bond; preview the cost first
- For testnet: nothing, the skill walks you through the agung faucet

---

## Install the CLI

```bash
python3 -m venv .peaqos-env
source .peaqos-env/bin/activate
pip install peaq-os-cli
peaqos --version
```

---

## Install the skill

**Claude Code**

Claude Code discovers skills by scanning `~/.claude/skills/`. Point it at the adapter:

```bash
# Option A: symlink (picks up changes automatically)
ln -s /path/to/peaqos-skill/adapters/claude-code ~/.claude/skills/peaqos

# Option B: copy
cp -r /path/to/peaq-os-skills/skills/peaqos ~/.claude/skills/peaqos   # the whole skill dir; the adapter dir holds only SKILL.md
```

Then invoke it from any Claude Code session:

```
/peaqos
```

**Other agent frameworks**

Load `AGENT-PROMPT.md` as the agent's system prompt or instructions. Make the `knowledge/` files and `GUIDE.md` accessible to the agent (as tool-readable files or injected context). Implement the interactive questioning steps using your framework's input primitives. No other changes are needed: all logic lives in `AGENT-PROMPT.md` and the knowledge files.

---

## Quick command reference

These are the underlying commands. In activation rows, `...` means the required flags: `--machine-type`, `--credential-subject-hex`, `--manufacturer`, `--tier` and `--did-document`. See `GUIDE.md#activation` for a complete example. For activation, `machine` and `monetize`, set `TOKENOMICS_DEPLOYMENT_ID` and verify the six legacy addresses after init (the wizard leaves `EVENT_REGISTRY_ADDRESS` empty unless supplied). For the `scale` rows, leave `TOKENOMICS_DEPLOYMENT_ID` unset and use a Tokenomics 1.0 machine: the SDK refuses Market identity binding in Tokenomics mode.

| Goal | Command |
|------|---------|
| Set up environment | `peaqos init` |
| Check wallet & config | `peaqos whoami` |
| Create an OWS wallet | `peaqos wallet create <name>` |
| Set OWS wallet as active | `peaqos wallet use <name>` |
| List OWS wallets | `peaqos wallet list` |
| Onboard a machine (testnet) | `peaqos activate ... --skip-funding` |
| Onboard a machine (mainnet) | `peaqos activate ...` |
| Machine-owned, operator-controlled | `peaqos activate ... --for 0x<addr> --machine-key ./machine.key` |
| Submit an activity event | `peaqos qualify event --machine-id <n> --type activity --value 0 --ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)"` |
| Submit a revenue event | `peaqos qualify event --machine-id <n> --type revenue --value <cents> --ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)"` |
| Check MCR score | `peaqos qualify mcr did:peaq:<decimal-id>` |
| Inspect machine profile | `peaqos show machine did:peaq:<decimal-id>` |
| Machine state | `peaqos machine status <decimal-id> --json` |
| Monetization | `peaqos monetize status <decimal-id> --json` |
| List fleet | `peaqos show operator machines did:peaq:0x<operator>` |
| Register a machine in the Market | `peaqos scale machine onboard --identity-ref did:peaq:0x<addr> --display-name "<name>" --owner-id <owner> --machine-type <type> --runtime-profile <profile> --identity-key-file ./controller.key` |
| Pair an AI agent to a machine | `peaqos scale agent pair --machine-id mach_<id> --agent-address 0x<addr> --agent-provider <name> --agent-role machine-market-buyer` |
| Search the Market | `peaqos scale search --machine-id mach_<id> --service-type <type> --pairing-token-file ./pairing.token` |
| Place an order | `peaqos scale order <service-id> --machine-id mach_<id> --agent-pairing-id <pairing-id> --pairing-token-file ./pairing.token --search-id <search-id> --quote-id <quote-id>` |
| Confirm order delivery | `peaqos scale order received <order-id> --pairing-token-file ./pairing.token` |
| Dispute an order | `peaqos scale order dispute <order-id> --reason "<reason>" --pairing-token-file ./pairing.token` |
| List orders for a machine | `peaqos scale order list --machine-id mach_<id>` |
| Package data for sale | `peaqos stream publish --input <file> --output-dir ./out --owner-public-key 0x<64hex> --operator-public-key 0x<64hex> --machine-public-key 0x<64hex> --signing-key-file ./ed25519.key --machine-did <machine-did> --machine-key-id "<machine-did>#keys-1"` (`did:peaq:<decimal id>` for a 2.0 machine) |
| Grant a buyer access | `peaqos stream grant --chunk-dir ./out --buyer-public-key 0x<64hex> --buyer-id <buyer-did> --owner-private-key-file ./owner.key --output-dir ./buyer-access` |
| Auto-deliver after payment | `peaqos stream distribute --chunk-dir ./out --owner-private-key-file ./owner.key --confirmation-url <url> --order-id <id> --delivery s3 --s3 s3://bucket/prefix/` |
| Pay for data | `peaqos stream pay --seller-address <addr> --amount <amt> --chain <peaq\|base\|solana> --order-id <id>` (add `--rpc-url <url>`: required for `base` and `solana`) |
| Submit payment proof | `peaqos stream payproof --tx-hash <hash> --order-id <id> --confirmation-url <url> --chain <chain> --payer-address <buyer> --payee-address <seller> --amount <amt>` |
| Decrypt purchased data | `peaqos stream consume --chunk-dir ./out --access-dir ./buyer-access --data-dir ./out --buyer-private-key-file ./buyer.key --buyer-id <buyer-did> --output ./recovered.bin` |

---

## Skill structure

```
peaqos-skill/
├── AGENT-PROMPT.md               # Framework-agnostic orchestration (11-phase logic, routing, security)
├── SKILL.md                      # Root skill entry (mirrors the Claude Code adapter)
├── TESTING.md                    # Manual test plan
├── manifest.json                 # Metadata, capability requirements, adapter list
├── GUIDE.md                      # Portable operator manual: full CLI recipes incl. Scale & Stream
├── knowledge/
│   ├── decision-tree.md          # Architecture questionnaire & recommendation matrix
│   ├── concepts.md               # peaqID, MCR, trust levels, bond, DID services, Scale & Stream concepts
│   ├── cli-reference.md          # Every command, flag, env var, exit code (incl. `peaqos scale` & `peaqos stream`)
│   └── troubleshooting.md        # Symptom → cause → fix (incl. Scale auth & pairing, Stream keys & payment)
├── adapters/
│   ├── claude-code/
│   │   └── SKILL.md              # Claude Code adapter (thin wrapper over AGENT-PROMPT.md)
│   ├── cursor/
│   │   └── SKILL.md              # Cursor adapter
│   └── windsurf/
│       └── SKILL.md              # Windsurf adapter
└── examples/
    └── .env.example              # Annotated env template for both networks
```

`AGENT-PROMPT.md` is the source of truth for all agent behaviour. Adapters are thin wrappers that wire it into a specific framework. The knowledge files are read at runtime and never duplicated.

---

## Networks

| | agung testnet | mainnet |
|-|---------------|---------|
| Chain ID | 9990 | 3338 |
| Faucet | [get-test-tokens](https://docs.peaq.xyz/peaqchain/build/getting-started/get-test-tokens) | n/a |
| Gas station | Not available: use faucet + `--skip-funding` | `https://depinstation.peaq.xyz` |
| Explorer | [agung-testnet.subscan.io](https://agung-testnet.subscan.io) | [peaq.subscan.io](https://peaq.subscan.io) |
| Contract addresses | See `examples/.env.example` | Verify all six legacy addresses in `GUIDE.md`; supply EventRegistry explicitly |

---

## Security

- **Never paste your private key in chat.** The skill will refuse to accept it and redirect you to set `PEAQOS_PRIVATE_KEY` in your `.env` file.
- The skill never stores, echoes, or logs key values.
- `--machine-key` reads from a file (not a CLI flag) to keep keys out of shell history and `ps` output.

---

## Troubleshooting

See `knowledge/troubleshooting.md` for a full symptom → cause → fix reference. Common issues:

- **`peaqos` not found** → activate your venv: `source .peaqos-env/bin/activate`
- **Balance insufficient on testnet** → use the agung faucet, then re-run with `--skip-funding`
- **MCR shows `Provisioned` after activation**: allow indexing time and inspect event receipts. Use `machine status` to confirm activation independently.
- **`PENDING`, exit 2**: retain `peaqos.log` and rerun the same command to reconcile. Never submit a replacement.

---

## Learn more

- [peaq documentation](https://docs.peaq.xyz)
- [peaqOS](https://peaq.xyz)
- [Machine Explorer](https://machines.peaq.xyz)
- [peaq transaction and block explorer](https://peaq.subscan.io)
