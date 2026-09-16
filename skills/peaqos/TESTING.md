# peaqOS Skill: Internal Test Guide

Pre-release QA checklist for the `/peaqos` Claude Code skill. Run through all scenarios before shipping.

---

## Setup

**1. Install the CLI from source**

```bash
git clone https://github.com/peaqnetwork/peaq-os-cli-py
cd peaq-os-cli-py
pip install -e .
peaqos --version   # confirm CLI 0.0.9 or newer is on PATH
```

Install globally (not in a project venv) so Claude Code can find it when executing shell commands.

**2. Install the skill**

Claude Code discovers skills by scanning `~/.claude/skills/`. Each subfolder with a `SKILL.md` at its root is registered as a slash command: the command name comes from the `name` field in the frontmatter (`name: peaqos` → `/peaqos`).

Get the `peaqos-skill/` folder onto your machine (clone this repo or receive it directly), then point Claude Code at the adapter inside it:

```bash
# Symlink: edits to skill files take effect immediately (recommended for testing)
ln -s "/path/to/peaqos-skill/adapters/claude-code" ~/.claude/skills/peaqos

# Copy: use this if you just want a stable snapshot
cp -r /path/to/peaqos-skill/adapters/claude-code ~/.claude/skills/peaqos
```

Verify it's picked up by starting a Claude Code session and typing `/peaqos`: the skill should launch immediately. No restart or additional configuration required.

**3. Get testnet tokens**

You'll need agung testnet tokens for scenarios 2 and 3. Request them at:
https://docs.peaq.xyz/peaqchain/build/getting-started/get-test-tokens

Limit: 3 AGNG per address per day. Request before starting: takes 1–2 minutes to arrive.

**4. Open Claude Code in a clean working directory**

```bash
mkdir ~/peaqos-test && cd ~/peaqos-test
claude
```

Using a fresh directory avoids leftover `.env` and `peaqos.log` files interfering with tests.

---

## Scenarios

### S1: Preamble: CLI not installed

**Purpose:** Verify the skill catches a missing CLI gracefully before Phase 1.

**Setup:** Temporarily rename the binary: `mv $(which peaqos) $(which peaqos).bak`

**Steps:**
1. `/peaqos`

**Pass criteria:**
- Skill detects CLI is missing
- Offers to run install commands
- Does not proceed to Phase 1 until resolved
- With CLI older than 0.0.9, tells the user to run `pip install -U peaq-os-cli` before any workflow

**Cleanup:** `mv $(which peaqos).bak $(which peaqos)`

---

### S2: Demo path (Phase 1 → A → Phase 2)

**Purpose:** Full happy-path testnet walkthrough, end to end.

**Steps:**
1. `/peaqos`
2. Select **A: Try the testnet demo**
3. Follow the skill through all 6 steps (install → init → fund → activate → event → MCR)

**Pass criteria:**
- Step 2 (init): corrects empty EventRegistry, verifies six addresses, and `peaqos whoami` shows Chain ID 9990 plus `TOKENOMICS_DEPLOYMENT_ID=agung-2026-08-28` in the Tokenomics 2.0 block
- Step 3 (fund): Skill correctly directs to faucet, not gas station
- Step 4 preview shows the quoted bond (0.4 PEAQ for entry on 2026-09-16); on `INSUFFICIENT_PEAQ` the skill waits for faucet funds instead of retrying blindly, and on `ORACLE_UNPRICED` it stops before spending or claiming completion
- Step 4 (activate): writes the DID JSON, uses all required identity flags, tier entry and `--skip-funding`, previews, then activates in one transaction. Captures decimal machine ID and confirms with `peaqos machine status <id> --json`
- Step 5 (event): `activity` event with `--value 0` submits without error; tx hash captured
- Step 6 (MCR): uses `peaqos qualify mcr did:peaq:<decimal-id>`. Reports service or deployment limitations honestly and uses `machine status` for chain state, not `show machine`
- Proof block printed at end with all 5 fields (DID, Machine ID, NFT token, Events, MCR)
- After demo, AskUserQuestion offers "What next?" with real onboarding / fleet / done options

**Service limitation:** Event submission and MCR availability depend on deployment support. Do not mark the demo complete if either failed. MCR lag is separate from activation state.

---

### S3: Architecture questionnaire (Phase 1 → B)

**Purpose:** Verify Q1–Q5 routing and recommendation matrix produce correct outputs.

Run through at least two distinct machine profiles and check the recommendation matches `knowledge/decision-tree.md`.

**Profile A: Cloud VM, root access, always-online:**
- Q1: Cloud VM / Q2: Cloud / Q3: Always-online / Q4: Root / Q5: Existing wallet
- Expected: **Architecture A: Self-owned**

**Profile B: IoT sensor, customer premises, intermittent, black box:**
- Q1: IoT sensor / Q2: Customer premises / Q3: Intermittent / Q4: Black box / Q5: Generate new keypair
- Expected: **Architecture B: Machine-owned, operator-controlled**

**Pass criteria:**
- Each question is asked once via AskUserQuestion (not repeated)
- Recommendation output matches the matrix in `knowledge/decision-tree.md`
- Includes a brief "Why" explanation
- B uses machine signing and payment, operator DID control, no prior operator activation
- Explains that only the owner can transfer or change the controller
- AskUserQuestion confirms fit before proceeding to Phase 5

---

### S4: Fleet management (Phase 1 → C)

**Purpose:** Verify fleet query commands execute and output is shown correctly.

**Prerequisite:** At least one activated machine (run S2 first and form the operator DID as `did:peaq:0x<address>` from the address in `peaqos whoami`).

**Steps:**
1. `/peaqos`
2. Select **C: Manage or query an existing fleet**
3. Test each sub-option:
   - **A: Check a machine's MCR**: enter the DID from S2
   - **B: List all machines for an operator**: enter operator DID
   - **D: Submit a heartbeat event**: enter machine ID from S2

**Pass criteria:**
- Each command executes and returns output (not an error)
- `--json` piping offered for scriptable output
- Machine ID / decimal DID from S2 resolves correctly; operator DID stays address-based
- Lifecycle/subscription/DID recipes check role and consent, replace whole DID arrays, and reconcile pending writes
- Renewal has no tier flag; approve-all explains authority over present and future machines

---

### S5: Troubleshooting path (Phase 1 → D)

**Purpose:** Verify the skill correctly diagnoses known failure modes.

**Steps:**
1. `/peaqos`
2. Select **D: Troubleshoot a problem**
3. Test these symptoms one at a time:
   - "PENDING at exit 2 after activation"
   - "MCR score is 0 after submitting events"
   - "PEER_MISMATCH on peaq-mainnet"
   - "RPC_FAILED: MachineSubscription.fullMode() could not be read"

**Pass criteria:**
- Diagnosis matches `knowledge/troubleshooting.md` for each symptom
- Fix steps are actionable and specific (not generic "check your config")
- Does not suggest pasting a private key at any point

---

### S6: Security: private key refusal

**Purpose:** Confirm the skill refuses private key input and never echoes it.

**Steps:**
1. `/peaqos` (any phase)
2. Paste a fake 64-hex string prefixed with `0x`, e.g.:
   `0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef`

**Pass criteria:**
- Skill immediately stops and shows the refusal message
- Does not echo, store, or acknowledge the value
- Redirects to `PEAQOS_PRIVATE_KEY` in `.env` and `peaqos init`

---

### S7: Existing environment detected

**Purpose:** Verify the preamble correctly identifies a prior setup and offers to skip ahead.

**Setup:** Run S2 first (so `.env` and `peaqos.log` exist in the working directory).

**Steps:**
1. Stay in the same working directory
2. `/peaqos`

**Pass criteria:**
- Preamble detects existing `.env` and runs `peaqos whoami`
- If whoami succeeds with the expected TOKENOMICS_DEPLOYMENT_ID, skill notes the configured address and offers to skip to Phase 6 (onboarding)
- Does not force user to re-run init

---

### S8: Scale: Machine Market end-to-end

**Purpose:** Verify the full Scale guided flow: market onboard → agent pair → search → order.

**Prerequisites:**
- Complete S2 first (machine must have an on-chain identity and funded wallet)
- Installed `peaq-os-cli` must include the `scale` command group: confirm with `peaqos scale --help`. If the command is unknown, run `pip install --upgrade peaq-os-cli`.
- `PEAQOS_ORCHESTRATION_URL` set in `.env` (required). The default Machine Markets API is `https://orchestration.peaq.xyz`: replace it only if your platform admin gave you a different URL.
- `PEAQOS_ORCH_API_KEY` set if the deployment requires it (optional: only needed if a Scale command returns `AUTH_REQUIRED`).
- An agent address and provider identifier to use for pairing
- A known service type available in the Market environment being tested against

**Steps:**
1. `/peaqos`
2. Select **E: Connect a machine to the Machine Market (Scale)**
3. Confirm the prerequisite check passes (orchestration URL detected; API key check is skipped as it is optional)
4. Select **S1: Register a machine in the Market**
5. Provide identity ref (DID from S2), display name, owner ID, machine type, runtime profile
6. Sign the identity challenge (use `--identity-key-file` or OWS if available)
7. Capture the machine ID from output
8. Select **S2: Pair an AI agent**
9. Provide machine ID, agent address, agent provider, agent role
10. Complete the challenge-sign flow
11. **When pairing token appears: verify the skill pauses and explicitly instructs you to save it**
12. Save the token to a file (e.g. `./pairing.token`)
13. Select **S3: Search for services and place an order**
14. Verify prerequisite check confirms machine ID, pairing ID, and token file
15. Search with a known service type: verify results table appears with search ID and quote IDs
16. Place an order: review payment summary before confirming
17. Verify order executes and a completion summary is printed

**Pass criteria:**
- Prerequisite check correctly catches missing `PEAQOS_ORCHESTRATION_URL` (test by temporarily unsetting it)
- Skill stops and warns about pairing token: does not proceed until user confirms it's saved
- Search returns quotes and captures search ID and quote ID for use in order command
- Order command is constructed correctly with all captured IDs
- Completion summary includes order ID, service, status, and payment status
- `peaqos scale order status <id>` confirms terminal state

**Note:** If the Market environment does not have live services available for the tested service type, S3 can be validated to the search step only: verify that "no quotes found" is handled gracefully with actionable suggestions.

---

### S9: Solana mainnet onboarding and recovery

Use a matching CLI/SDK release with staged Solana APIs. This scenario can spend real PEAQ and SOL; execute live writes only with explicit phase consent and funded public wallets.

1. Ask to home a machine on Solana or SVM. Confirm Phase 11 routing.
2. Test the missing `--chain` help gate. The skill must give the upgrade command and stop this path.
3. With the feature available, verify mainnet deployment and separate peaq/Solana RPCs. Create operator and native-owner OWS wallets.
4. Collect original DID/identity, base58 owner/manufacturer, basic/pro tier and explicit budgets, compute settings and history start. Preview without wallet unlock.
5. Reserve with the operator, then activate the subscription in a separate invocation using the same arguments. Approval alone must not count as success.
6. Wait for both external mirrors, preview native onboarding, then submit with the owner wallet.
7. Simulate a native exit 0 with pending linkage. The skill must not declare completion. Reconcile without `--yes`, keeping the journal and inputs. Only aggregate stage `complete` passes.
8. Read `machine status <id> --json` without wallet or journal. Verify `observed` and `native_current_state` are treated as observations, not proof of original-attempt completion.

Pass: no testnet walkthrough, no changed caps or payment rail on resume, no journal deletion or replacement transaction after timeout/conflict. Missing dependency/config is exit 3, read failure exit 2. Pending/conflicting status can exit 0.

---

## Known limitations (not bugs)

| Limitation | Detail |
|------------|--------|
| Gas station unavailable on testnet | Expected: skill routes to faucet correctly |
| MCR indexer lag | Service indexing is separate from chain state. Use machine status for chain confirmation |
| Faucet rate limit | 3 AGNG/day per address. If a tester hits this, generate a fresh keypair via `peaqos init` |
| KMS/hardware wallet | v1 hot keys only. Skill acknowledges this in Phase 5 (W3 branch) and offers a throwaway key |

---

## Reporting issues

Note the scenario number, the exact input that triggered the problem, and what the skill did vs what you expected. Check `peaqos.log` in the working directory for the CLI-level audit trail: it often contains the root cause.
