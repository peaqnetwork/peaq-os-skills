# peaqOS Skill

A framework-agnostic agent skill that onboards machine operators to [peaqOS](https://peaq.xyz) — peaq's financial OS for autonomous machines. It guides you through the full setup using the `peaqos` CLI: giving your machine a permanent on-chain identity (peaqID), an ownership NFT, and a Machine Credit Rating (MCR) built from verified event history.

Works on both **agung testnet** (free, no real money) and **mainnet**. Ships with adapters for Claude Code, Cursor, and Windsurf out of the box — porting to other agent frameworks requires only a thin adapter file.

---

## What it does

Invoke `/peaqos` in Claude Code and the skill will:

- **Demo mode** — walk you through a full testnet onboarding in ~15 minutes, step by step, with explanations at every stage
- **Real onboarding** — ask five questions about your machine and deployment, recommend the right architecture (self-managed or proxy-managed), then execute the CLI commands to register, mint, and verify
- **Fleet management** — check MCR scores, list all machines for an operator, find machines with low or no rating, submit heartbeat events
- **Scale / Machine Market** — register a machine in the Market, pair an AI agent, search for services, place and manage orders (confirm or dispute delivery)
- **Troubleshooting** — diagnose common failures (funding, activation errors, MCR lag, key mismatches, Scale auth) and walk you through the fix

Adapts its language to your background: concise and direct for developers, plain English with narrated steps for hobbyists and first-timers.

---

## Requirements

- **Python ≥ 3.10**
- **`peaq-os-cli`** installed (see below)
- A wallet private key (the skill can generate one for you if needed)
- For mainnet: PEAQ tokens to cover gas (the gas station handles this automatically)
- For testnet: nothing — the skill walks you through the agung faucet

---

## Install the CLI

System dependencies first — `peaq-os-cli` pulls in `pycairo` (via `svglib`), which needs Cairo + pkg-config installed at the OS level. Without them, `pip install` fails with a Meson build error.

```bash
# macOS
brew install cairo pkg-config

# Ubuntu / Debian
sudo apt-get install -y libcairo2-dev pkg-config
```

Then install the CLI:

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
# Option A — symlink (picks up changes automatically)
ln -s /path/to/peaqos-skill/adapters/claude-code ~/.claude/skills/peaqos

# Option B — copy
cp -r /path/to/peaqos-skill/adapters/claude-code ~/.claude/skills/peaqos
```

Then invoke it from any Claude Code session:

```
/peaqos
```

**Other agent frameworks**

Load `AGENT-PROMPT.md` as the agent's system prompt or instructions. Make the `knowledge/` files and `GUIDE.md` accessible to the agent (as tool-readable files or injected context). Implement the interactive questioning steps using your framework's input primitives. No other changes are needed — all logic lives in `AGENT-PROMPT.md` and the knowledge files.

---

## Quick command reference

These are the underlying `peaqos` commands the skill drives. You can also run them directly.

| Goal | Command |
|------|---------|
| Set up environment | `peaqos init` |
| Check wallet & config | `peaqos whoami` |
| Create an OWS wallet | `peaqos wallet create <name>` |
| Set OWS wallet as active | `peaqos wallet use <name>` |
| List OWS wallets | `peaqos wallet list` |
| Onboard a machine (testnet) | `peaqos activate --skip-funding` |
| Onboard a machine (mainnet) | `peaqos activate` |
| Onboard on behalf of a machine | `peaqos activate --for 0x<addr> --machine-key ./machine.key` |
| Submit an activity event | `peaqos qualify event --machine-id <n> --type activity --value 0 --ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)"` |
| Submit a revenue event | `peaqos qualify event --machine-id <n> --type revenue --value <cents> --ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)"` |
| Check MCR score | `peaqos qualify mcr did:peaq:0x<address>` |
| Inspect machine profile | `peaqos show machine did:peaq:0x<address>` |
| List fleet | `peaqos show operator machines did:peaq:0x<operator>` |
| Register a machine in the Market | `peaqos scale machine onboard --identity-ref did:peaq:0x<addr> --display-name "<name>" --owner-id <owner> --machine-type <type> --runtime-profile <profile> --identity-key-file ./controller.key` |
| Pair an AI agent to a machine | `peaqos scale agent pair --machine-id mach_<id> --agent-address 0x<addr> --agent-provider <name> --agent-role machine-market-buyer` |
| Search the Market | `peaqos scale search --machine-id mach_<id> --service-type <type> --pairing-token-file ./pairing.token` |
| Place an order | `peaqos scale order <service-id> --machine-id mach_<id> --agent-pairing-id <pairing-id> --pairing-token-file ./pairing.token --search-id <search-id> --quote-id <quote-id>` |
| Confirm order delivery | `peaqos scale order received <order-id> --pairing-token-file ./pairing.token` |
| Dispute an order | `peaqos scale order dispute <order-id> --reason "<reason>" --pairing-token-file ./pairing.token` |
| List orders for a machine | `peaqos scale order list --machine-id mach_<id>` |

---

## Skill structure

```
peaqos-skill/
├── AGENT-PROMPT.md               # Framework-agnostic orchestration (9-phase logic, routing, security)
├── manifest.json                 # Metadata, capability requirements, adapter list
├── GUIDE.md                      # Portable operator manual — full CLI recipes incl. Scale
├── knowledge/
│   ├── decision-tree.md          # Architecture questionnaire & recommendation matrix
│   ├── concepts.md               # peaqID, MCR, trust levels, bond, visibility, Scale concepts
│   ├── cli-reference.md          # Every command, flag, env var, exit code (incl. `peaqos scale`)
│   └── troubleshooting.md        # Symptom → cause → fix (incl. Scale auth & pairing)
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
| Gas station | Not available — use faucet + `--skip-funding` | `https://depinstation.peaq.xyz` |
| Explorer | [testnet.peaqscan.xyz](https://testnet.peaqscan.xyz/) | [peaqscan.xyz](https://peaqscan.xyz/) |
| Contract addresses | See `examples/.env.example` | Fetched automatically by `peaqos init` |

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
- **MCR shows `Provisioned` after activation** → indexer lag; wait 30–90s and poll `peaqos qualify mcr <did>` again
- **Step 4 fails: `Proxy operator is not registered`** → run `peaqos activate` in self mode first, then retry proxy mode

---

## Learn more

- [peaq documentation](https://docs.peaq.xyz)
- [peaqOS](https://peaq.xyz)
- [peaqscan block explorer](https://peaqscan.xyz/)
