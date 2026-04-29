# peaqOS Agent Skills

A growing library of agent skills for [peaqOS](https://peaq.xyz) — on-chain identity and financial rails for autonomous machines. Install any skill to your agent with a single command and let it drive the full onboarding and management flow using the peaqOS CLI.

---

## Install

```bash
npx @peaqos/skills add <skill>
```

Auto-detects your installed agent (Claude Code, Cursor, Windsurf). To specify:

```bash
npx @peaqos/skills add <skill> --agent claude-code
npx @peaqos/skills add <skill> --agent cursor
npx @peaqos/skills add <skill> --agent windsurf
```

---

## Available skills

| Skill | What it does |
|-------|-------------|
| `peaqos` | Full machine onboarding — peaqID, Machine NFT, MCR setup, event submission, fleet management |

More skills coming as peaqOS expands.

---

## Requirements

- Node.js ≥ 18
- Python ≥ 3.10
- [`peaq-os-cli`](https://github.com/peaqnetwork/peaq-os-cli-py) installed
- For OWS encrypted key storage: `pip install "peaq-os-sdk[ows]"`

---

## Skill structure

Each skill in this repo is framework-agnostic by design. `AGENT-PROMPT.md` contains all the orchestration logic in plain language — adapters for each agent are thin wrappers that wire it into that agent's skill system.

```
skills/
└── peaqos/
    ├── AGENT-PROMPT.md       # Framework-agnostic orchestration
    ├── GUIDE.md              # Full operator manual
    ├── knowledge/            # Reference files read at runtime
    ├── adapters/             # One adapter per supported agent
    └── manifest.json         # Skill metadata
```

---

## Learn more

For further information on peaqOS see the [docs](https://docs.peaq.xyz/home).
