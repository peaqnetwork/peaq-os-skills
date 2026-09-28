# peaqOS Operator Guide

Framework-agnostic manual for the `peaqos` CLI. Any agent or human can read and follow this top-to-bottom. Covers both agung testnet and mainnet.

---

## Install

Requires Python ≥ 3.10 and CLI 0.0.9 or newer. If older, run `pip install -U peaq-os-cli` before continuing.

**From PyPI:**

```bash
python3 -m venv .peaqos-env
source .peaqos-env/bin/activate
pip install peaq-os-cli
peaqos --version
```

**From source (local development):**

```bash
git clone https://github.com/peaqnetwork/peaq-os-cli-py
cd peaq-os-cli-py
python3 -m venv .peaqos-env
source .peaqos-env/bin/activate
pip install -e .
peaqos --version
```

---

## Demo happy path {#demo-happy-path}

A testnet walkthrough for activation, a first event and an MCR query. The agung oracle had a committed PEAQ price on 2026-09-16 (the entry bond previewed at 0.4 PEAQ plus 0.05 PEAQ gas headroom). If a preview ever returns `ORACLE_UNPRICED`, stop and wait for the oracle; do not claim the demo completed.

### Step 1: Install CLI

```bash
python3 -m venv .peaqos-env && source .peaqos-env/bin/activate
pip install peaq-os-cli
```

### Step 2: Configure environment {#step-2-init}

```bash
peaqos init
```

When prompted:
- **Network:** `testnet`
- **Private key source:** `generate` (creates a fresh keypair; save the key securely). Alternatively, choose `wallet` to create an OWS encrypted vault wallet: see `#admin-wallet-options` for details.
- **RPC URL:** `https://peaq-agung.api.onfinality.io/public`
- **Deployment ID:** `agung-2026-08-28` (`TOKENOMICS_DEPLOYMENT_ID`, required by activate, machine and monetize).
- **MCR API URL:** `https://mcr.peaq.xyz`
- **Gas Station URL:** leave blank (not available on agung)
- **Event Registry address:** the only contract address the wizard asks for; enter the agung value from `examples/.env.example`. `IDENTITY_REGISTRY_ADDRESS`, `IDENTITY_STAKING_ADDRESS` and `MACHINE_NFT_ADDRESS` have no agung default either: fill them in `.env` after the wizard.
- **Orchestration API URL:** the default Machine Markets API is `https://orchestration.peaq.xyz`. Use that unless your platform admin gave you a different URL. If you're not planning to use Scale (Phase 9), hit enter to leave it blank.
- **Orchestration API key:** leave blank unless your deployment requires one. If you later see an `AUTH_REQUIRED` error from a Scale command, that's the signal to set this and re-run.

Known init bug in CLI 0.0.9 (fixed in CLI 0.0.10, where the prompt defaults to the network's Event Registry): `EVENT_REGISTRY_ADDRESS` has no default. An empty value makes SDK client commands exit 3 with `Missing required env var: EVENT_REGISTRY_ADDRESS`. Fill it from the network table below and verify all six legacy addresses; on agung, IdentityRegistry, IdentityStaking and MachineNFT are written empty too. They are still required by the SDK constructor.

Run `peaqos whoami`. Verify Chain ID 9990 and the `Tokenomics 2.0:` block with deployment `agung-2026-08-28`.

### Step 3: Fund the wallet {#step-3-fund}

The gas station is not available on agung testnet. Fund via the web faucet:

1. Copy your wallet address from `peaqos whoami`
2. Go to: https://docs.peaq.xyz/peaqchain/build/getting-started/get-test-tokens
3. Request test tokens
4. Wait for the funds to appear in the block explorer

Block explorer: https://agung-testnet.subscan.io

On **mainnet**, Gas Station funding uses `https://depinstation.peaq.xyz`. Preview the tier bond and ensure the paying wallet can cover the net PEAQ plus gas.

### Step 4: Activate the machine {#step-4-activate}

Choose the permanent machine type, identity-anchor bytes and manufacturer with the user. The values below are examples. Write `did.json` using the [DID document schema](#did-document).

```bash
peaqos activate \
  --machine-type Sensor \
  --credential-subject-hex 0xdeadbeef \
  --manufacturer 0x3333333333333333333333333333333333333333 \
  --tier entry --did-document ./did.json --skip-funding --dry-run
# After reviewing the preview, run the same command without --dry-run.
peaqos activate \
  --machine-type Sensor \
  --credential-subject-hex 0xdeadbeef \
  --manufacturer 0x3333333333333333333333333333333333333333 \
  --tier entry --did-document ./did.json --skip-funding --json
```

One transaction mints the NFT, stores the DID document, bonds the tier and records the home chain. Capture `machine_id` as a decimal string. The NFT token ID is the machine ID; the DID is `did:peaq:<decimal machine id>`.

```bash
peaqos machine status <decimal-id> --json
```

Confirm activation before submitting an event. Preserve `peaqos.log`. On `PENDING` (exit 2), rerun the same command to reconcile the recorded hash, never submit a replacement.

### Step 5: Submit first event {#step-5-event}

```bash
peaqos qualify event \
  --machine-id <decimal-id> \
  --type activity \
  --value 0 \
  --ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

Use `activity` type with `--value 0` for a first heartbeat: lowest cognitive load, always valid.

Output:
```
Event submitted.
  Machine ID:   57896044618658097711785492504343953926634992332820282019728792003956564819975
  Type:         activity
  Value:        0
  Trust:        self-reported
  Tx:           0x...
  Data Hash:    0x...
```

### Step 6: Verify with MCR {#step-6-verify}

```bash
peaqos qualify mcr did:peaq:<decimal-id>
```

With `TOKENOMICS_DEPLOYMENT_ID=peaq-mainnet`, reads go to `mcr-20.peaq.xyz`; `agung-2026-08-28` has no paired MCR, so `qualify mcr` and `show machine` exit 3 with `DEPLOYMENT_UNAVAILABLE` there and `machine status` is the only check. Event submission and MCR availability depend on the selected deployment. Report service errors honestly; do not claim an event or rating succeeded without evidence. `show machine` also uses the MCR API. Use `peaqos machine status <decimal-id> --json` to confirm chain state independently.

---

## Admin wallet options {#admin-wallet-options}

### W1: Existing wallet

You already have an EOA with PEAQ (or ready to fund on testnet).

1. Add `PEAQOS_PRIVATE_KEY=0x<your-key>` to `.env`
2. Run `peaqos whoami` to confirm address and network

### W2: Generate fresh keypair

```bash
peaqos init
# Choose: Private key source → generate
```

The CLI generates a secp256k1 keypair, prints the address, and writes the key to `.env`.
**The private key is shown once on stderr: save it immediately to a secure location.**

Fund the new address:
- **Testnet:** web faucet (Step 3 above)
- **Mainnet:** transfer PEAQ to the address shown in `peaqos whoami`

### W2.5: OWS encrypted vault wallet

The CLI now supports Open Wallet Standard (OWS) for secure, encrypted key storage. Instead of a plaintext private key in `.env`, keys are stored encrypted in `~/.ows/` behind a vault passphrase.

**Requires OWS support:**
```bash
pip install "peaq-os-sdk[ows]"
```

**Create via `peaqos init`:**
```bash
peaqos init
# Choose: Private key source → wallet
# Enter a wallet name and vault passphrase when prompted
```

The init wizard derives your address for all peaq networks and writes `PEAQOS_OWS_WALLET=<name>` to `.env`. The recovery phrase is **not** printed during creation: back it up immediately afterward with `peaqos wallet export <name>` and store it somewhere safe (password manager, hardware-backed secret).

**Or create directly:**
```bash
peaqos wallet create my-operator             # 12-word mnemonic (default, encrypted in vault)
peaqos wallet create my-operator --words 24  # 24-word mnemonic
peaqos wallet export my-operator             # print recovery phrase (requires confirmation): do this right after create
peaqos wallet use my-operator                # set as active in .env
```

**Avoid repeated passphrase prompts:**
```bash
export OWS_PASSPHRASE="your-vault-passphrase"
```

Commands using the wallet-aware client can sign through OWS. `qualify mcr` and `show` build an SDK client too, so they take `PEAQOS_OWS_WALLET` or `PEAQOS_PRIVATE_KEY` plus the legacy addresses; monetization writes require `PEAQOS_PRIVATE_KEY`. Follow the command-specific requirements.

**Useful wallet commands:**
```bash
peaqos wallet list                  # list all wallets in vault
peaqos wallet show my-operator      # display address and chain details
peaqos wallet export my-operator    # view recovery phrase (confirmation required)
peaqos wallet delete my-operator    # securely remove wallet (confirmation required)
```

### W3: KMS / hardware wallet / multisig

OWS (W2.5) provides encrypted key storage and is the recommended approach for most production setups. For full enterprise-grade key management:
- **AWS KMS:** use a KMS-backed signer with the peaq SDK directly
- **Fireblocks:** API signer integration
- **Safe (multisig):** for operator wallets controlling many machines

For now: use OWS for testnet and early production; migrate to KMS before high-value load.

---

## Machine activation {#activation}

### Self-owned mode

The configured signer signs, owns and pays. Collect the machine type, permanent credential subject, manufacturer, tier and DID contents. Preview the current oracle-priced bond first.

```bash
peaqos activate \
  --machine-type Sensor \
  --credential-subject-hex 0xdeadbeef \
  --manufacturer 0x3333333333333333333333333333333333333333 \
  --tier entry --did-document ./did.json --dry-run
peaqos activate \
  --machine-type Sensor \
  --credential-subject-hex 0xdeadbeef \
  --manufacturer 0x3333333333333333333333333333333333333333 \
  --tier entry --did-document ./did.json
```

On agung, fund from the web faucet and add `--skip-funding`. This skips the balance check, 2FA and Gas Station funding. It does not waive the bond or gas.

### Machine-owned, operator-controlled mode

The machine key signs and pays gas and the bond. The machine owns the NFT. The configured operator becomes DID controller and signs nothing during activation. No prior operator activation is needed. Have the user save the machine key privately in a file with mode 0600, never in chat or a shell command containing the key.

```bash
peaqos activate \
  --machine-type Sensor \
  --credential-subject-hex 0xdeadbeef \
  --manufacturer 0x3333333333333333333333333333333333333333 \
  --tier entry --did-document ./did.json --for 0xMachine --machine-key ./machine.key
```

The owner can transfer the NFT and rotate or clear the controller. The controller can suspend, resume, renew and update DID arrays, but cannot transfer the NFT or change the controller.

### Tier, payment and output

`--tier` is `entry`, `basic` or `pro`. Bonds are quoted at the oracle rate; voucher credit reduces the net payment. The bond is not withdrawable. `--payment peaq` is the default. `--payment usdt` requires `--slippage-bps` (0 to 10000); that flag is rejected for PEAQ. USDT approval goes to `SubscriptionTokenProvisionPool`.

`--dry-run` previews. `--json` writes one result object and does not grant consent. `--yes` is the only non-interactive consent. See `knowledge/cli-reference.md` for the complete flag and error tables.

Machine ID: `uint256(keccak256(abi.encode(machineType, credentialSubject)))`. Both inputs are permanent. IDs are canonical decimal strings, with no `0x` or leading zeros.

### DID document schema {#did-document}

Exactly three root fields, all required. Unknown fields, duplicate keys, and a root `id` or `controller` are rejected: `id` is computed on-chain and `controller` is set by the CLI from the mode.

```json
{
  "verificationMethods": [
    {
      "id": "#key-1",
      "methodType": "Ed25519VerificationKey2020",
      "controller": "0x1111111111111111111111111111111111111111",
      "publicKeyMultibase": "z6MkiExamplePublicKey"
    }
  ],
  "authentication": [0],
  "serviceEndpoints": [
    {
      "id": "#telemetry",
      "serviceType": "TelemetryService",
      "serviceEndpoint": "https://machine.example/telemetry"
    }
  ]
}
```

Each `authentication` entry is an index into `verificationMethods`. The CLI bounds-checks them because the contract stores them unchecked at mint.
Put documentation and API URLs into `serviceEndpoints`. The agent writes this file from the user's answers. Use real public verification keys, not the illustrative placeholders above.

---

## Solana onboarding {#solana}

This path needs `peaq-os-cli` 0.0.12 or newer with `peaq-os-sdk` 0.8.0 or newer and the `[solana]` and `[ows]` extras (released 2026-09-16): `pip install -U 'peaq-os-cli[solana,ows]>=0.0.12'`. CLI 0.0.10 and older have no `--chain solana`; 0.0.11 has it, but its `solana` extra pins `peaq-os-sdk<0.8.0` and pip cannot resolve it.

```bash
peaqos activate --help | grep -q -- '--chain'
```

If absent, tell the user to run `pip install -U 'peaq-os-cli[solana,ows]'` and stop this path. Installing extras on an older SDK does not add the APIs. Do not assume an unreleased version number.

### Configure and prepare two wallets

Mainnet only. Keep one dedicated working directory, its `.env`, original DID document and `peaqos.log` throughout every phase and rerun.

```bash
export PEAQOS_NETWORK=peaq
export TOKENOMICS_DEPLOYMENT_ID=peaq-mainnet
export PEAQOS_SVM_NETWORK=mainnet-beta
export PEAQOS_RPC_URL=https://peaq.api.onfinality.io/public
export PEAQOS_SVM_RPC_URL=https://api.mainnet-beta.solana.com
peaqos wallet create svm-test-operator
peaqos wallet create svm-test-owner
peaqos wallet show svm-test-operator --json
peaqos wallet show svm-test-owner --json
unset PEAQOS_PRIVATE_KEY
```

The peaq operator reserves and pays peaq gas and the bond. The Solana owner creates the machine on Solana and pays SOL fees and rent. Fund both public addresses before writing. Wallet creation does not fund them. Select the wallet per phase with `PEAQOS_OWS_WALLET`. Vault unlock prompts for a passphrase; keep any `OWS_PASSPHRASE` in a private environment, never chat.

The RPCs are separate. Root overrides `--svm-network` and `--svm-rpc-url` precede the command name. `whoami` displays the requested Solana cluster and available SDK metadata, but does not contact Solana or verify the cluster. It does not change the selected peaq deployment.

### Keep one original argument set

Write `native-did.json` using the [DID schema](#did-document), with base58 verification-method controllers, `methodType: "Ed25519"`, and actual multibase public keys. Collect all variables below before running. `OWNER` and `MANUFACTURER` are base58 Solana public keys. `OPERATOR` is the peaq operator's EVM address. Credential bytes are an identity anchor, not a private key.

```bash
COMMON_ARGS=(
  --chain solana --json
  --solana-owner "${OWNER:?Set the native owner public key}"
  --evm-operator "${OPERATOR:?Set the peaq operator public address}"
  --manufacturer "${MANUFACTURER:?Set the native manufacturer public key}"
  --machine-type Sensor
  --credential-subject-hex "${CREDENTIAL_SUBJECT_HEX:?Set the original identity bytes}"
  --tier basic --did-document ./native-did.json
  --payment peaq --max-net-peaq-amount "${PEAQ_CAP:?Set the PEAQ ceiling}"
  --max-native-fee-lamports "${FEE_CAP:?Set the native fee ceiling}"
  --max-native-rent-lamports "${RENT_CAP:?Set the native rent ceiling}"
  --from-block "${HISTORY_START:?Set the original source history start}"
  --compute-unit-limit "${COMPUTE_LIMIT:?Set the compute budget}"
  --compute-unit-price-micro-lamports "${PRIORITY_PRICE:?Set the priority price}"
)
```

Tier is `basic` or `pro`, never `entry`. `--for`, `--machine-key` and `--slippage-bps` are rejected. `--evm-operator` is an optional assertion checked against SDK evidence. Optional `--solana-controller` is base58; omission uses the owner-only default. Choose it before previewing.

The payment ceiling is integer base units. For USDT, replace the payment line with `--payment usdt --max-usdt-amount "${USDT_CAP:?Set the USDT ceiling in base units}"` before the first phase. The SDK must support foreign USDT funding. Approval can exceed the current quote; the original maximum stays fixed.

Fee cap covers network and priority fees, excluding rent. Rent cap covers combined machine/state rent, excluding external delivery rent. `--from-block` is the inclusive peaq block covering the original attempt. Compute limit is 1 to 1,400,000; priority price is micro-lamports per compute unit. Zero is a strict limit, never unlimited. Retain the same identity, DID, controller, operator, tier, payment, ceilings, history and compute settings on every invocation.

### Preview, then submit one phase per invocation

```bash
# Keyless full preview, no signing or submission
peaqos activate "${COMMON_ARGS[@]}" --dry-run

# Review and authorize reservation, then subscription separately
PEAQOS_OWS_WALLET=svm-test-operator peaqos activate "${COMMON_ARGS[@]}" --phase reservation --yes
peaqos activate "${COMMON_ARGS[@]}" --phase subscription --dry-run
PEAQOS_OWS_WALLET=svm-test-operator peaqos activate "${COMMON_ARGS[@]}" --phase subscription --yes

# Wait for the reservation mirror AND the subscription terminal status (Active or Grace)
peaqos activate "${COMMON_ARGS[@]}" --phase native_onboarding --dry-run
# Only when the SDK reports readiness and the user accepts the native phase:
PEAQOS_OWS_WALLET=svm-test-owner peaqos activate "${COMMON_ARGS[@]}" --phase native_onboarding --yes
```

`--yes` accepts only the selected phase. Subscription approval and activation are separate transactions. Approval alone is not subscription success. Mirror delivery is external; a peaq receipt does not prove delivery. Preview can report pending prerequisites and `did: null` before native creation.

Exit 0 on the native phase does not mean onboarding is done. Complete only when `onboarding_state.evidence.stage.phase` is `complete`. After delivery advances, rerun the phase without `--yes` to reconcile, keylessly, with the same inputs and journal:

```bash
peaqos activate "${COMMON_ARGS[@]}" --phase native_onboarding
```

Never delete the journal or replace an uncertain transaction. Timeout, interruption or an expired native reference requires reconciliation first. See troubleshooting for conflicts and partial approval recovery.

### Read a Solana-homed machine by ID

```bash
peaqos machine status <decimal-id> --json
```

With Solana support configured, a missing or foreign-home EVM record enables the ID-only fallback. No wallet, original DID file, history start or journal is needed. Top-level `status: "observed"` and `native_current_state` separate finalized peaq observations from confirmed Solana observations. They are not an atomic cross-chain snapshot.

States include `absent`, `reserved`, `pending_external`, `present`, `conflict`, `in_flight` and `unavailable`. A successful pending or conflicting observation exits 0. Missing configuration exits 3; read failures exit 2 and can retain partial evidence. `present` does not prove the original payload, a receipt or completed linkage. Use full-input activation reconciliation to verify the original attempt.

---

## Event submission {#events}

Submit machine events to build MCR history.

### Revenue event (machine earned money)

```bash
peaqos qualify event \
  --machine-id <decimal-id> \
  --type revenue \
  --value 123 \
  --ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --currency USD
```

`--value` is in ISO 4217 subunits: `123` = USD 1.23, `100` = HKD 1.00, `100` = JPY 100.

### Activity event (machine did work)

```bash
peaqos qualify event \
  --machine-id <decimal-id> \
  --type activity \
  --value 0 \
  --ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

### On-chain verified event (higher MCR weight)

```bash
peaqos qualify event \
  --machine-id <decimal-id> \
  --type revenue \
  --value 500 \
  --ts 1735000000 \
  --trust onchain \
  --source-tx 0xabc...def
```

`--source-tx` is required with `--trust onchain`. It's the 32-byte tx hash on the source chain that proves the event happened.

### Timestamp rules

- Use a timestamp at or **before** the current block time. Future timestamps revert with `FutureTimestamp`.
- Both Unix seconds (`1735000000`) and ISO 8601 with timezone (`2026-04-22T12:00:00Z`) are accepted.

---

## Queries and fleet management {#queries--fleet-management}

With `TOKENOMICS_DEPLOYMENT_ID` set, `qualify mcr` and `show machine` use decimal machine DIDs at `https://mcr-20.peaq.xyz`. With it unset, use `did:peaq:0x<address>` at `https://mcr.peaq.xyz`. `show operator machines` always uses an address DID. On CLI 0.0.9 both command groups still need a signer (`PEAQOS_PRIVATE_KEY` or `PEAQOS_OWS_WALLET`) and the six legacy addresses; CLI 0.0.10 reads MCR over HTTP only and needs neither.

`show machine --json` in CLI 0.0.9 emits the machine ID as a JSON number. Use the `did` field or a big-integer-aware parser to avoid rounding.

### Check a machine's MCR

```bash
peaqos qualify mcr did:peaq:<decimal-id>

# Machine-readable output
peaqos qualify mcr did:peaq:<decimal-id> --json | jq '.mcr_score'
```

### Inspect a machine's full profile

```bash
peaqos show machine did:peaq:<decimal-id>
```

Shows: machine ID, operator DID, DID attributes, MCR snapshot, recent events.

### List an operator's fleet

```bash
peaqos show operator machines did:peaq:0x<operator-address>
```

Shows tabular output: peaqID, Machine ID, MCR score, Rating.

### Machine lifecycle, ownership and DID management

New in 0.0.8. Everything after onboarding: lifecycle, subscription payments, ERC-721 ownership, DID updates, and relocation status. Requires `TOKENOMICS_DEPLOYMENT_ID`.

```text
peaqos machine status MACHINE_ID
peaqos machine suspend MACHINE_ID
peaqos machine resume MACHINE_ID

peaqos machine subscription activate MACHINE_ID --tier TIER --payment RAIL [--slippage-bps N]
peaqos machine subscription renew MACHINE_ID --payment RAIL [--slippage-bps N]

peaqos machine approve MACHINE_ID OPERATOR
peaqos machine approve-all OPERATOR --allow|--revoke
peaqos machine transfer MACHINE_ID TO [--unsafe] [--data-hex HEX]

peaqos machine did set-controller MACHINE_ID CONTROLLER
peaqos machine did clear-controller MACHINE_ID
peaqos machine did set-verification-methods MACHINE_ID --file PATH
peaqos machine did set-authentication MACHINE_ID [--index N]... | --clear
peaqos machine did set-services MACHINE_ID --file PATH

peaqos machine relocation status MACHINE_ID --destination-rpc-url URL --destination-deployment-id ID
```

Every write accepts `--yes` and `--json`; every read accepts `--json`. Machine IDs are full-width `uint256`: pass them as canonical unsigned decimal (no `0x`, no leading zeros) and read them back as decimal strings.

Every write runs the same sequence: validate locally, reconcile the journal (a pending transaction for the same action and machine blocks rather than repeats), ask the SDK for a preview (chain, contract, method, current state, intended effect), show it and ask, then submit once and record the hash before waiting for the receipt. A rerun reconciles an unresolved (pending) hash instead of resubmitting; once that outcome is recorded as confirmed, the next rerun is a new write and asks for consent again. Check state with `machine status`, never rerun a write with `--yes` to look.

Details that matter:

- **Who may sign.** Suspend, resume, renew, and DID updates: owner or controller. `set-controller` and `clear-controller`: owner only. Transfers: standard ERC-721 authority. Points and credits from a renewal land on the **owner** even when the controller pays.
- **`approve-all` is not scoped to one machine.** It grants the operator every MachineRegistry machine the signer owns, including ones activated later.
- **`transfer` is safe by default** (`safeTransferFrom`). `--unsafe` selects `transferFrom`, which can strand the NFT in an incompatible contract. Transfer does not rotate the DID controller.
- **DID setters replace whole arrays.** The file or index list you pass is the complete new state. Authentication indices point into the verification-method array by position. `--index` and `--clear` are mutually exclusive and one is required.
- **Renewal takes no `--tier`.** The contract renews at the stored tier and extends from the current period end, not from now. `--payment usdt` requires `--slippage-bps`.
- **Relocation is read-only.** `relocation status` reports `pending`, `arrived`, `completed`, `cancelled`, or `conflicting`. Initiation and cancellation are absent until the protocol publishes a fee quote; relocation is also disabled on chain today.

```bash
peaqos machine status 57896044618658097711785492504343953926634992332820282019728792003956564819975 --json
peaqos machine suspend <machine-id> --yes
peaqos machine subscription renew <machine-id> --payment usdt --slippage-bps 50 --yes
peaqos machine transfer <machine-id> 0xRecipient --yes
```

Exit codes and `error_code` values are the ones documented under [`peaqos activate`](knowledge/cli-reference.md#peaqos-activate): one taxonomy for both.
### Fleet management recipes

**Count machines in fleet:**
```bash
peaqos show operator machines did:peaq:0x<operator> --json | jq '.machines | length'
```

**Get MCR scores for all machines:**
```bash
peaqos show operator machines did:peaq:0x<operator> --json | jq '.machines[] | {did, mcr_score, mcr}'
```

**Find machines with no rating (NR):**
```bash
peaqos show operator machines did:peaq:0x<operator> --json \
  | jq '.machines[] | select(.mcr == "NR") | .did'
```

**Find machines rated A or above:**
```bash
peaqos show operator machines did:peaq:0x<operator> --json \
  | jq '.machines[] | select(.mcr_score >= 75) | {did, mcr_score, mcr}'
```

---

## Monetization

Requires `TOKENOMICS_DEPLOYMENT_ID=peaq-mainnet`. Agung has no paired monetization MCR and returns exit 3, `DEPLOYMENT_UNAVAILABLE`.

```bash
peaqos monetize status <decimal-id> --json
peaqos monetize opt-in did:peaq:<decimal-id>
peaqos monetize opt-out did:peaq:<decimal-id>
```

Status is a public read. Opt-in and opt-out are signed off-chain decisions by the current owner or controller: CLI 0.0.9 signs with `PEAQOS_PRIVATE_KEY`; CLI 0.0.10 also signs with the active OWS wallet. A Solana-homed machine cannot opt in yet: the SDK refuses with `SOLANA_MONETIZATION_UNVERIFIED` until the deployment marks Solana monetization verified. Use `--yes` only after consent. State starts at `PENDING`. After an ambiguous PUT timeout, rerun the same command so it reads before writing again. The endpoint comes from the deployment, not `PEAQOS_MCR_API_URL`.

For an opted-in machine, `peaqos monetize provision` handles provider setup. Supply `PEAQOS_MANIFEST_REPO_URL` from the peaq team and `PEAQOS_MACHINE_WALLET_ADDRESS` for its payout context. See the CLI reference before running `provision run <provider> --machine <decimal-id>`.

---

## Scale / Machine Market {#scale}

> **Experimental: pre-launch.** The Scale API surface and CLI flags may change without notice until the public release. Treat anything here as subject to revision. Set `PEAQOS_ORCHESTRATION_URL` in your `.env` before any `peaqos scale ...` command (see `examples/.env.example`). `PEAQOS_ORCH_API_KEY` is only required if the deployment you connect to enforces it.

### Two machine IDs: don't mix them up

- **On-chain machine ID**: the full-width `uint256` returned by `peaqos activate`, written as a decimal string of up to 78 digits. Used by `peaqos qualify event --machine-id` and every `peaqos machine` command.
- **Market machine ID**: string like `mach_abc123` returned by `peaqos scale machine onboard`. Used by every `peaqos scale ...` command.

These are different identifiers: the decimal ID from `activate` will not work in the Market and vice versa.

### Two auth modes for `peaqos scale ...`

| Auth | Commands | How to authenticate |
|------|----------|---------------------|
| Platform | `machine list`, `machine status`, `machine onboard`, `order list`, `order status` | Uses `PEAQOS_ORCH_API_KEY` if set; otherwise unauthenticated reads against the API. |
| Agent pairing | `search`, `order <service-id>`, `order received`, `order dispute` | Requires `--pairing-token-file ./path/to/pairing.token` containing the bearer token from `peaqos scale agent pair`. |

### Step 1: Register the machine in the Market

Requires an on-chain identity. **Tokenomics mode gate.** With `TOKENOMICS_DEPLOYMENT_ID` set, the CLI builds the SDK client in Tokenomics mode, and the SDK refuses every orchestration call that binds a machine identity (`scale machine onboard | list | status`, `scale agent pair`, `scale search`) with `TokenomicsIntegrationUnavailableError` ("orchestration identity binding"). The Market verifies identities against the Tokenomics 1.0 MCR, so Scale works today for **1.0 machines** (`did:peaq:0x<address>`) from a `.env` **without** `TOKENOMICS_DEPLOYMENT_ID`. A machine activated under Economics 2.0 cannot be registered in the Market yet; tell the user so instead of retrying.

```bash
peaqos scale machine onboard \
  --identity-ref did:peaq:0x<address> \
  --display-name "Solar Inverter #4821" \
  --owner-id <owner-id> \
  --machine-type edge-node \
  --runtime-profile linux-docker \
  --capabilities inference,data-feed \
  --identity-key-file ./controller.key
```

Signing the identity challenge (checked in this order):
1. `--identity-signature-file ./signed.txt`: pre-computed EIP-191 signature
2. `--identity-key-file ./controller.key`: sign automatically with the DID controller key
3. Active OWS wallet (`PEAQOS_OWS_WALLET` set): signs via the vault
4. Manual prompt: the CLI displays the challenge and asks you to paste the signature

The plain `PEAQOS_PRIVATE_KEY` in `.env` does **not** auto-sign the identity challenge: without `--identity-key-file` or an OWS wallet, the CLI falls through to the manual prompt every time.

Capture the `mach_*` machine ID from the output: you'll need it for every other `scale` command.

### Step 2: Pair an AI agent

Pairing returns a one-shot **pairing token** that authorises the agent to search and order on the machine's behalf.

```bash
peaqos scale agent pair \
  --machine-id mach_<id> \
  --agent-address 0x<agent-address> \
  --agent-provider teneo \
  --agent-role machine-market-buyer \
  --per-tx-limit 10.00 \
  --daily-limit 100.00 \
  --currency USD
```

The pairing token is shown exactly once. Save it immediately:
```bash
# When the token appears in output, copy it and write it to a file
echo "<token>" > ./pairing.token && chmod 600 ./pairing.token
```

If the token is lost or the session expires (`AGENT_AUTH_INVALID`), re-run `peaqos scale agent pair` to create a fresh pairing: the CLI does not currently expose a dedicated session-refresh subcommand.

### Step 3: Search the Market

```bash
peaqos scale search \
  --machine-id mach_<id> \
  --service-type oracle.price-feed \
  --pairing-token-file ./pairing.token \
  --operation get-latest-price \
  --budget-amount 5.00 \
  --budget-currency USD
```

Useful filters:
- `--native-only`: only return services that execute directly via the API (no external handoff)
- `--allow-handoff`: explicitly include services that hand off to an external endpoint
- `--region eu-west`: preferred region
- `--capabilities realtime,verified`: required service capabilities

Output includes a `search_id` and per-quote `quote_id` / `service_id` / `score` / `execution_mode`. Capture the top-ranked quote for the order step.

If nothing comes back: remove `--native-only`, add `--allow-handoff`, raise `--budget-max`, or broaden `--service-type`.

### Step 4: Place an order

```bash
peaqos scale order <service-id> \
  --machine-id mach_<id> \
  --agent-pairing-id <pairing-id> \
  --pairing-token-file ./pairing.token \
  --search-id <search-id> \
  --quote-id <quote-id>
```

Payment shape depends on the service:
- **No payment required**: 2-step create → execute, no flags needed
- **Wallet payment (EVM)**: 5-step create → intent → send → proof → execute, handled automatically when an OWS wallet is active
- **Pre-completed payment**: pass `--payment-tx-hash <hash> --payment-chain <chain> --payment-token <token> --skip-payment`
- **x402**: 6-step create → intent → sign → proof → execute → confirm, used by paid-HTTP Agentic Market services (e.g. Wolfram Alpha over USDC on Base). The CLI signs the provider's payment challenge locally with the active wallet: no separate on-chain transfer, no tx-hash prompt: and confirms delivery automatically.

The CLI prints an order summary and asks for confirmation before any transfer. Capture the `order_id`.

### Step 5: Confirm or dispute

x402 orders skip this step: they are confirmed automatically at placement, `order received` on them fails with `ORDER_CLOSED`, and disputes are unavailable once confirmed. For all other rails:

```bash
# Confirm delivery: releases held payment
peaqos scale order received <order-id> --pairing-token-file ./pairing.token

# Dispute: freezes payment, --reason is required
peaqos scale order dispute <order-id> \
  --reason "Service output did not match expected schema" \
  --pairing-token-file ./pairing.token
```

### Order management recipes

```bash
# Status of one order (platform auth: no pairing token needed)
peaqos scale order status <order-id>

# All orders for a machine, paginated
peaqos scale order list --machine-id mach_<id> --limit 20

# Next page
peaqos scale order list --machine-id mach_<id> --limit 20 --cursor <cursor-from-previous-output>

# Machine-readable for scripts
peaqos scale order list --machine-id mach_<id> --json | jq '.[] | {id, status, service_id}'   # with --limit the output is an envelope: use '.items[]'
```

---

## Stream / data sales {#stream}

Sell the data a machine produces: chunk + encrypt + sign it, grant paying buyers access, get paid. Requires CLI 0.0.9 or newer, which includes all these commands. Full flag tables in `knowledge/cli-reference.md`.

**Private** keys (owner/buyer X25519, machine Ed25519) are passed as **file paths**: one line of 64 hex chars, `chmod 600`, never inline. X25519 **public** keys are shared openly and passed inline as flags. The seller's owner X25519 private key is the only thing that can grant access; the buyer's X25519 private key is the only thing that can decrypt. Neither is recoverable: back both up.

### Seller: package data

```bash
peaqos stream publish \
  --input ./telemetry.bin --output-dir ./out \
  --owner-public-key 0x<64hex> --operator-public-key 0x<64hex> --machine-public-key 0x<64hex> \
  --signing-key-file ./machine-ed25519.key \
  --machine-did <machine-did> --machine-key-id "<machine-did>#keys-1"   # did:peaq:<decimal id> for a 2.0 machine, did:peaq:0x<address> for a 1.0 machine

# Optional: host the ciphertext on S3 (needs pip install "peaq-os-cli[s3]" + S3 creds in env)
peaqos stream publish ... --s3 s3://my-bucket/streams/ --s3-region eu-west-1
```

No wallet, no on-chain writes: the only network I/O is URL input and the optional S3 upload. Output: `chunk-<i>.json` envelopes, `chunk-<i>.bin` ciphertext, `manifest.json`.

### Seller: grant access

```bash
# Manual: re-wrap chunk keys for one known buyer (offline)
peaqos stream grant \
  --chunk-dir ./out --buyer-public-key 0x<64hex> --buyer-id did:peaq:0x<buyer> \
  --owner-private-key-file ./owner-x25519.key --output-dir ./buyer-access

# Automatic: wait for payment confirmation, then grant + deliver to S3
peaqos stream distribute \
  --chunk-dir ./out --owner-private-key-file ./owner-x25519.key \
  --confirmation-url https://api.example.com/orders/ord-001/status \
  --order-id ord-001 --delivery s3 --s3 s3://my-bucket/distributes/
```

`distribute` blocks (default: poll every 30s, give up after 1h) and prints a pre-signed download URL for the **first** buyer-access file. `--delivery` supports only `s3`: the SDK's machine-to-machine P2P delivery channel has no CLI flag. On `grant`, exit 2 on a key-commitment mismatch means the wrong owner key; `distribute` reports the same mismatch as a validation error at exit 1. Point `--confirmation-url` only at an endpoint you or your platform control: its response decides who gets access.

### Buyer: pay

```bash
# Transfer + submit proof in one run
peaqos stream pay \
  --seller-address 0x<seller> --amount 1.0 --chain base --order-id ord-001 \
  --rpc-url https://mainnet.base.org \
  --token-address 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
  --confirmation-url https://api.example.com/payments/proof

# Proof only: transfer already done, or the proof step failed
peaqos stream payproof \
  --tx-hash 0x<hash> --order-id ord-001 --confirmation-url <url> \
  --chain base --payer-address 0x<buyer> --payee-address 0x<seller> --amount 1.0 \
  --token-address 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913   # repeat the token of the transfer; omitted means native token
```

Chains: `peaq`, `base`, `solana` (`--rpc-url` required for base/solana; solana needs `pip install "peaq-os-sdk[solana]"` and an active OWS wallet with a Solana account, `PEAQOS_OWS_WALLET`, a raw key is refused). The tx hash prints before the proof step: if proof fails, resubmit with `payproof`, never pay twice.

### Buyer: decrypt

```bash
# Local mode (offline)
peaqos stream consume \
  --chunk-dir ./out --access-dir ./buyer-access --data-dir ./out \
  --buyer-private-key-file ./buyer-x25519.key --buyer-id did:peaq:0x<buyer> \
  --output ./recovered.bin

# Remote mode: fetch a self-contained release bundle
peaqos stream consume \
  --download-url "https://bundles.example.com/releases/ord-001/" \
  --buyer-private-key-file ./buyer-x25519.key --buyer-id did:peaq:0x<buyer> \
  --output ./recovered.bin
```

> ⚠️ `--download-url` needs a **self-contained bundle** (chunk envelopes + `.bin` blobs + access files, served as a `manifest.json` listing or a ZIP). It does **not** accept the pre-signed URL from `peaqos stream distribute`: that URL carries only the first buyer-access file.

Every chunk is verified (hash, signature, chain link) before decryption; `--skip-verify` is for debugging only.

---

## Network reference {#network-reference}

### agung testnet

| Parameter | Value |
|-----------|-------|
| `PEAQOS_NETWORK` | `testnet` |
| `TOKENOMICS_DEPLOYMENT_ID` | `agung-2026-08-28` |
| Chain ID | 9990 |
| RPC URL | `https://peaq-agung.api.onfinality.io/public` |
| Legacy MCR API | `https://mcr.peaq.xyz` |
| Gas Station | Not available: use web faucet |
| Block explorer | https://agung-testnet.subscan.io |
| Faucet | https://docs.peaq.xyz/peaqchain/build/getting-started/get-test-tokens |
| `IDENTITY_REGISTRY_ADDRESS` | `0x9E9463a65c7B74623b3b6Cdc39F71be7274e5971` |
| `IDENTITY_STAKING_ADDRESS` | `0x55f336714aDb0749DbFE33b057a1702405564E3d` |
| `EVENT_REGISTRY_ADDRESS` | `0x2DAD8905380993940e340C5cE6d313d5c2780040` |
| `MACHINE_NFT_ADDRESS` | `0xB41C2A4f1c19b6B06beaAce0F5CD8439e77C4b1c` |
| `DID_REGISTRY_ADDRESS` | `0x0000000000000000000000000000000000000800` |
| `BATCH_PRECOMPILE_ADDRESS` | `0x0000000000000000000000000000000000000805` |

### mainnet

| Parameter | Value |
|-----------|-------|
| `PEAQOS_NETWORK` | `mainnet` |
| `TOKENOMICS_DEPLOYMENT_ID` | `peaq-mainnet` |
| 2.0 MCR API | `https://mcr-20.peaq.xyz` |
| Chain ID | 3338 |
| RPC URL | `https://peaq.api.onfinality.io/public` |
| Legacy MCR API | `https://mcr.peaq.xyz` |
| Gas Station | `https://depinstation.peaq.xyz` |
| Transaction and block explorer | https://peaq.subscan.io |
| `IDENTITY_REGISTRY_ADDRESS` | `0xb53Af985765031936311273599389b5B68aC9956` |
| `IDENTITY_STAKING_ADDRESS` | `0x11c05A650704136786253e8685f56879A202b1C7` |
| `EVENT_REGISTRY_ADDRESS` (2.0 machines) | `0xA1e7F1d7B24dAb55Dc92491e6d9B89F6E925Ad1e` |
| `EVENT_REGISTRY_ADDRESS` (1.0 machines) | `0x43c6AF2E14dc1327dc3cc6c7117D1CD72fffEcbA` |
| `MACHINE_NFT_ADDRESS` | `0x2943F80e9DdB11B9Dd275499C661Df78F5F691F9` |
| `DID_REGISTRY_ADDRESS` | `0x0000000000000000000000000000000000000800` |
| `BATCH_PRECOMPILE_ADDRESS` | `0x0000000000000000000000000000000000000805` |

Machine Explorer: `https://machines.peaq.xyz/machine/<decimal machine id>` for 2.0, or `https://machines.peaq.xyz/machine/0x<address>` for 1.0. Allow indexing time. Use Subscan for transactions and blocks.
