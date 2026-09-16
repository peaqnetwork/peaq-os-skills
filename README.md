# peaqOS Agent Skills

A growing library of agent skills for [peaqOS](https://peaq.xyz): on-chain identity and financial rails for autonomous machines. Install any skill to your agent with a single command and let it drive the full onboarding and management flow using the peaqOS CLI.

---

## Install

```bash
npx skills add peaqnetwork/peaq-os-skills
```

Auto-detects your installed agent (Claude Code, Cursor, Windsurf) and installs to the correct skills directory.

---

## Available skills

| Skill | What it does |
|-------|-------------|
| `peaqos` | Economics 2.0 activation, lifecycle, MCR, monetization, and staged Solana mainnet onboarding |

More skills coming as peaqOS expands.

---

## Requirements

- Node.js ≥ 18
- Python ≥ 3.10
- [`peaq-os-cli`](https://github.com/peaqnetwork/peaq-os-cli-py) 0.0.9 or newer installed
- Solana onboarding requires the release with `activate --chain solana` and `pip install -U peaq-os-cli "peaq-os-sdk[solana,ows]"`. The skill checks the feature before proceeding.
- For OWS encrypted key storage: `pip install "peaq-os-sdk[ows]"`

---

## Skill structure

Each skill in this repo is framework-agnostic by design. `AGENT-PROMPT.md` contains all the orchestration logic in plain language: adapters for each agent are thin wrappers that wire it into that agent's skill system.

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

## Development

To test locally after cloning, no npm install is needed: just run the install script directly with `node`:

```bash
git clone https://github.com/peaqnetwork/peaq-os-skills
cd peaq-os-skills

# See available skills
node bin/skills.js list

# Install a skill to your local agent
node bin/skills.js add peaqos --agent claude-code
```

Then open a Claude Code session in a clean working directory and invoke `/peaqos`.

To add a new skill, create a folder under `skills/` following the structure in `skills/peaqos/`. At minimum you need `AGENT-PROMPT.md`, `manifest.json`, and an adapter for each supported agent under `adapters/`.

---

## Learn more

For further information on peaqOS see the [docs](https://docs.peaq.xyz/home).
