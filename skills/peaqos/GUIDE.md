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
- **Event Registry address:** the only contract address the wizard asks for; enter the agung value from `examples/.env.example` (`0x2DAD8905380993940e340C5cE6d313d5c2780040`, no agung default in any CLI version). `IDENTITY_REGISTRY_ADDRESS`, `IDENTITY_STAKING_ADDRESS` and `MACHINE_NFT_ADDRESS` have no agung default either: fill them in `.env` after the wizard.
- **Orchestration API URL:** the default Machine Markets API is `https://orchestration.peaq.xyz`. Use that unless your platform admin gave you a different URL. If you're not planning to use Scale (Phase 9), hit enter to leave it blank.
- **Orchestration API key:** leave blank unless your deployment requires one. If you later see an `AUTH_REQUIRED` error from a Scale command, that's the signal to set this and re-run.

The Event Registry default depends on the CLI version. On peaq mainnet, CLI 0.0.13 or newer writes the Tokenomics 2.0 EventRegistry `0xA1e7F1d7B24dAb55Dc92491e6d9B89F6E925Ad1e` with a `.env` comment naming it, so there is nothing to set by hand; an `EVENT_REGISTRY_ADDRESS` already in the environment still wins, and the CLI loads an existing `.env` into the environment before init, so edit a stale 1.0 value in `.env` to the 2.0 address (or remove the line) and unset a stale export first. CLI 0.0.10 to 0.0.12 prefill the mainnet network default, which is the 1.0 registry `0x43c6AF2E14dc1327dc3cc6c7117D1CD72fffEcbA`: replace it with the 2.0 address for a 2.0 machine. CLI 0.0.9 has no default on any network, and an empty value makes SDK client commands exit 3 with `Missing required env var: EVENT_REGISTRY_ADDRESS`. Verify all six legacy addresses against the network table below; on agung, IdentityRegistry, IdentityStaking and MachineNFT are written empty too. They are still required by the SDK constructor.

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

With `TOKENOMICS_DEPLOYMENT_ID=peaq-mainnet`, reads go to `mcr.peaq.xyz`; `agung-2026-08-28` has no paired MCR, so `qualify mcr` and `show machine` exit 3 with `CONFIG_ERROR` (`The SDK rejected the selected MCR deployment`) there and `machine status` is the only check. Event submission and MCR availability depend on the selected deployment. Report service errors honestly; do not claim an event or rating succeeded without evidence. `show machine` also uses the MCR API. Use `peaqos machine status <decimal-id> --json` to confirm chain state independently.

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

A Solana-homed machine keeps its identity record, DID document and Machine NFT in Solana accounts owned by a Solana key. The bond is paid on Solana, in PEAQ or USDC, and booked on peaq, so the machine still has one subscription and one credit rating on peaq. Onboarding runs terminal-first in seven stages, with sync messages carried by peaq's Trust Validator node:

| Stage | Signer | `--phase` |
| --- | --- | --- |
| `[1/7]` Operator registration on peaq | operator wallet (once per owner wallet; later machines send nothing) | `registration` |
| `[2/7]` Activation request on Solana | owner wallet: the escrow moves in, the bond is sized and frozen | `request` |
| `[3/7]` Credit from peaq | the node; a wait, nothing signed | none |
| `[4/7]` Settlement on Solana | owner wallet: PEAQ to the vault, or USDC swapped for exactly the bond. **The point of no return** | `finalise` |
| `[5/7]` Bond on peaq | the node and peaq; a wait | none |
| `[6/7]` Native onboarding on Solana | owner wallet: mints the machine and its DID | `native_onboarding` |
| `[7/7]` Link push Solana to peaq | owner wallet, then the node delivers it on peaq (no messaging fee) | `linkage` |

This path needs `peaq-os-cli` 0.0.15 or newer with `peaq-os-sdk` 0.11.0 and the `[solana]` and `[ows]` extras: `pip install -U 'peaq-os-cli[solana,ows]'`. Older releases implement the removed reservation flow and fail against the current programs. Gate on the escrow flag, which only the terminal-first CLI has:

```bash
peaqos activate --help | grep -q -- '--max-in'
```

If absent, tell the user to upgrade and stop this path. Mainnet only; there is no testnet, and the keyless preview is the only rehearsal.

### Configure and prepare two wallets

One directory per machine, kept for every run: it holds `.env`, `did.json`, the journal `peaqos.log` and the record `onboarding-<machine-id>.json`.

```bash
mkdir -p solana-onboarding && cd solana-onboarding
peaqos init                      # mainnet, deployment peaq-mainnet, your own peaq RPC endpoint
printf '%s\n' 'PEAQOS_SVM_NETWORK=mainnet-beta' 'PEAQOS_SVM_RPC_URL=<your Solana RPC endpoint>' >> .env
peaqos wallet create svm-operator
peaqos wallet create svm-owner
peaqos wallet show svm-operator --json
peaqos wallet show svm-owner --json
unset PEAQOS_PRIVATE_KEY
```

Keep endpoint URLs in `.env`: an exported variable wins over `.env`, and the CLI warns when they differ. Use your own provider endpoint for peaq; the free public endpoints rate-limit an onboarding's reads (`RPC_RATE_LIMITED`). The public Solana endpoint works; a provider endpoint avoids the occasional rerun.

- **Operator wallet (peaq):** signs `[1/7]` only, about 0.01 PEAQ of gas, once per owner wallet. It owns the machine's points and revenue on peaq and pays no bond. Fund it with 0.05 PEAQ.
- **Owner wallet (Solana):** signs every Solana write and pays the bond from its own token account, in PEAQ on Solana (the OFT, mint `PEAQjk7SRS6rXHVFFmpRr7zrC4g5ZuEebpwTxvaLr3b`, 9 decimals) or USDC (6 decimals), plus rent and fees in SOL. Fund it with at least 0.015 SOL per machine and the bond in the pay-in token plus the cushion the preview shows. Getting PEAQ or USDC onto Solana is outside the CLI.

Wallet creation does not fund them. Each wallet has its own passphrase; the run asks for each once. Keep any `OWS_PASSPHRASE` in a private environment, never chat.

### Keep one original argument set

Write `did.json` using the [DID schema](#did-document): `controller` is the owner wallet's base58 address, `methodType` `Ed25519VerificationKey2020`, `publicKeyMultibase` its real key. Replace example service endpoints with the machine's own: they are written on chain and shown on its public MCR profile. Every invocation takes the same arguments:

```bash
ARGS=(
  --chain solana
  --solana-owner "${OWNER:?}"                        # base58 owner wallet
  --manufacturer "${MANUFACTURER:?}"                 # base58, recorded without verification
  --machine-type "${MACHINE_TYPE:?}"                 # with the credential subject it fixes the machine ID for good
  --credential-subject-hex "${CREDENTIAL_SUBJECT_HEX:?}"
  --tier basic --did-document ./did.json
  --pay-in PEAQ                                      # or USDC
  --max-native-fee-lamports 50000                    # network + priority fee of each Solana write
  --max-native-rent-lamports 6000000                 # rent of each Solana write
  --timeout-seconds 300
)
```

`--tier` is `entry`, `basic` or `pro` (program tiers 0 to 2); the quote refuses a tier the deployment does not price. Ceilings of `0` are strict, never unlimited. Optional `--solana-controller` is base58; omit `--evm-operator`, the machine inherits the registration's operator. `--for` and `--machine-key` are rejected. The removed flow's `--payment`, `--max-net-peaq-amount` and `--max-usdt-amount` are refused with `OPTION_NOT_FOR_CHAIN`; `--from-block` is accepted and ignored.

The request freezes the tier, the rail and the escrow, and the SDK fingerprints the owner, DID document, controller, manufacturer, identity and ceilings. Keep every value for every later invocation, and finish a machine before upgrading the CLI or SDK.

### Preview, then run

```bash
peaqos activate "${ARGS[@]}" --operator-wallet svm-operator --dry-run   # keyless; ends with "Run it with --max-in N"
MAX_IN=<N from the preview>                         # escrow in base units of the pay-in token
ARGS+=(--max-in "$MAX_IN")
peaqos activate "${ARGS[@]}" \
  --operator-wallet svm-operator --owner-wallet svm-owner \
  --wait-minutes 60 --yes
```

`--operator-wallet` in the preview reads only the wallet's public address (no unlock); an owner wallet that is not registered yet cannot be quoted without it. The preview shows where the onboarding stands, the registration, the bond and the escrow against the owner's balance, the rents, the settlement path (on USDC, check it names the lookup table as verified) and all seven stages. `--yes` accepts every stage's terms as printed, so give it only after the user agreed to the whole plan; to decide at settlement, run stage by stage instead (`--phase registration` with the operator wallet, then `request`, `finalise`, `native_onboarding`, `linkage` with the owner wallet). No link fee cap: production's link push goes to the Trust Validator node with no fee. `--max-link-push-fee-lamports` is needed only if `--phase linkage --dry-run` names a LayerZero route.

With a healthy node a first run took about 10 minutes. Done means exit `0` and `next_step.phase` equal to `complete` (the summary prints `link seq N applied`). Exit `0` on a single stage is not completion.

### The point of no return

Until `[4/7]` the owner can step out: `--phase cancel_request --owner-wallet svm-owner` returns the escrow in the pay-in token and the request's rents, from a request that is still `Pending` or `Committed`. After the settlement there is no cancel. If peaq refuses the bond, the Trust Validator refunds it in PEAQ to the owner's PEAQ token account (`ACTIVATION_REFUNDED`) and a rerun opens a new request. Bonds are not withdrawable.

### If it stops early

Rerun the same command in the same directory. It reads `peaqos.log`, works out where the onboarding stands and starts there; nothing recorded is sent again. That covers `PENDING` (exit `2`, naming `credit`, `bond` or `link_application`: each wait is also capped by the SDK, 3 minutes for the credit and 6 for the bond), Ctrl-C (`CANCELLED`, exit `1`, or `PENDING`, exit `2`, when a journaled write's outcome still needs reconciling), a timeout and a lost connection. Every stop prints `resume_command`. Never delete the journal, change the inputs or send a replacement transaction yourself.

### See what ran and read the state

```bash
peaqos machine history <decimal-id> --chain solana       # every transaction on both chains, then totals per payer
peaqos -v machine history <decimal-id> --chain solana    # plus full references and explorer links
peaqos machine status <decimal-id> --json --chain solana # native state, with the top-level link block
```

`machine history` needs no journal, original inputs or wallet, but it reads the chain configuration from `.env`: run it in the onboarding directory, or in one whose `.env` has the same public configuration. A source it could not read is named and it exits `2`; the rows shown are still exact. `machine status --json --chain solana` reports the `link` block (`not_pushed`, `pending_application`, `linked` or `unavailable`). Without `--chain solana`, a missing or foreign-home peaq record falls back to the Solana read: `status: "observed"` with a `native_current_state` that separates finalized peaq and confirmed Solana observations, not an atomic snapshot. `present` proves the accounts exist, not that the link is complete.

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

With `TOKENOMICS_DEPLOYMENT_ID` set, `qualify mcr` and `show machine` use decimal machine DIDs at `https://mcr.peaq.xyz`, the host the SDK deployment record names in CLI 0.0.14 / SDK 0.10.0 and newer. MCR reads need it set: with it unset the CLI sends `did:peaq:0x<address>` DIDs to the host in `PEAQOS_MCR_API_URL`, and those address-DID reads are no longer served. `peaq-os-sdk` 0.7.0 to 0.9.0 (CLI 0.0.13 pins 0.9.x) name `https://mcr-20.peaq.xyz`, which serves the same Tokenomics 2.0 MCR API. `show operator machines` always uses an address DID. On CLI 0.0.9 both command groups still need a signer (`PEAQOS_PRIVATE_KEY` or `PEAQOS_OWS_WALLET`) and the six legacy addresses; CLI 0.0.10 reads MCR over HTTP only and needs neither.

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

Requires `TOKENOMICS_DEPLOYMENT_ID=peaq-mainnet`. Agung has no paired monetization MCR and returns exit 3, `CONFIG_ERROR`.

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

## Verify {#verify}

> **Experimental.** Verify reads a machine's KYB and chip records and builds local chip preflight evidence. Nothing in the CLI writes a Verify record. Verify needs peaq-os-cli 0.0.14 or newer. Gate on `peaqos verify --help`: if it fails, offer `pip install -U 'peaq-os-cli>=0.0.14'` and run it only after the user agrees, then repeat the check. If it still fails, stop: the installed CLI still has no Verify commands.

Reads need only the Verify API origin, no wallet, key, RPC or deployment ID:

```bash
export PEAQOS_VERIFY_API_URL=https://mcr.peaq.xyz   # or put it in .env, or pass --verify-api-url before the command name
peaqos verify status <decimal-id>
peaqos verify status <decimal-id> --json
```

`kyb` and `chip` each report `unverified`, `verified`, `expired` or `revoked`. `unverified` on an existing machine is a normal, successful read. There is no combined status. Verify on peaq mainnet reads peaq-homed machines only: a Solana-homed machine gets `Verify state is temporarily unavailable; retry later.` (exit 2) every time. For a peaq-homed machine that message can be transient; the CLI does not retry, so run the command once more after a short pause.

Chip preflight is for machines homed on peaq with an Infineon OPTIGA Trust M Express secure element (CA306 chain). It starts from a challenge context issued by peaq's onboarding service and runs in three stages; the chip and the DID controller's wallet sign between them:

```bash
# context.json: the six fields chainId, didController, expiresAt, machineDid, machineId, nonce of the challenge
#   jq '{chainId, didController, expiresAt, machineDid, machineId, nonce}' challenge.json > context.json
# leaf.der: trustm_cert -r 0xe0e0 -o leaf.pem && openssl x509 -in leaf.pem -outform DER -out leaf.der
peaqos verify chip prepare --context context.json --certificate leaf.der --out prehash.bin
# chip key 0xE0F0 signs prehash.bin (ECDSA without hashing, no -H), header stripped -> chip-signature.bin
#   trustm_ecc_sign -k 0xe0f0 -i prehash.bin -o chip-signature.der && tail -c +3 chip-signature.der > chip-signature.bin
peaqos verify chip controller-request --context context.json --certificate leaf.der \
  --chip-signature chip-signature.bin --out controller-message.bin
# the current DID controller signs controller-message.bin once as an EIP-191 personal message -> controller-signature.bin (65 bytes)
peaqos verify chip finalize --context context.json --certificate leaf.der \
  --chip-signature chip-signature.bin --controller-signature controller-signature.bin --out evidence.json
```

The challenge expires after at most five minutes: every stage checks `now < expiresAt <= now + 300` (Unix seconds) against the local clock. Hand `evidence.json` to the peaq contact who issued `context.json` and delete the artifacts afterwards. `finalize` succeeding is local preflight only, not a verified machine; `Revocation Status: not_evaluated` means revocation was not checked locally. The challenge and evidence API routes are for peaq's onboarding service only; `chip` reads `verified` once peaq records the chip attestation, not when the evidence is accepted. Full flags, output and exit codes: `knowledge/cli-reference.md`. Full flow: https://docs.peaq.xyz/peaqos/functions/verify#verify-a-chip-end-to-end.

---

## Network reference {#network-reference}

### agung testnet

| Parameter | Value |
|-----------|-------|
| `PEAQOS_NETWORK` | `testnet` |
| `TOKENOMICS_DEPLOYMENT_ID` | `agung-2026-08-28` |
| Chain ID | 9990 |
| RPC URL | `https://peaq-agung.api.onfinality.io/public` |
| MCR API | None paired with `agung-2026-08-28`: `qualify mcr` and `show` exit 3 with `CONFIG_ERROR` |
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
| MCR API | `https://mcr.peaq.xyz` (used by CLI 0.0.14 / SDK 0.10.0 and newer) |
| Chain ID | 3338 |
| RPC URL | `https://peaq.api.onfinality.io/public` |
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
