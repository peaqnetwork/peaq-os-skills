# peaqOS CLI Reference

Full reference for the `peaqos` command. Requires CLI 0.0.9 or newer and Python 3.10 or newer. Configure `.env` in the working directory for chain commands. Offline Stream commands need no wallet or RPC. Run `peaqos --help` for live help text.

Install:
```bash
python3 -m venv .peaqos-env
source .peaqos-env/bin/activate
pip install peaq-os-cli
```

---

## Global flags

| Flag | Effect |
|------|--------|
| `--version` | Print CLI and SDK versions |
| `-v` / `--verbose` | Enable DEBUG logging to stderr |
| `-q` / `--quiet` | Suppress progress output; only print errors |
| `--help` | Help for any command |
| `--orchestration-url`, `--orch-api-key` | Override Scale environment settings |
| `--verify-api-url` | HTTPS origin of the Verify API; overrides `PEAQOS_VERIFY_API_URL` (only on a CLI with `peaqos verify`) |

---

## `peaqos init`

Interactive wizard that scaffolds a `.env` with the required peaqOS variables. Prompts for network, private key source (`paste`, `generate`, or `wallet`), RPC URL, the Economics 2.0 deployment ID (`TOKENOMICS_DEPLOYMENT_ID`, default `peaq-mainnet` on mainnet and `agung-2026-08-28` on testnet), MCR API URL, Gas Station URL, the Event Registry address (the only one of the six Tokenomics 1.0 contract addresses it asks for; the other five are written from the network defaults, see the note below), and (optionally) `PEAQOS_ORCHESTRATION_URL` + `PEAQOS_ORCH_API_KEY` for Machine Markets. The orchestration key is masked in any echoed or logged output. The `wallet` path creates a new OWS vault wallet and writes `PEAQOS_OWS_WALLET=<name>` instead of `PEAQOS_PRIVATE_KEY`. Writes `.env` with `0o600` permissions and auto-runs `whoami` to verify.

```bash
peaqos init
peaqos init --force            # overwrite existing .env without prompt
peaqos init --non-interactive  # read all values from env vars
```


  **The `EVENT_REGISTRY_ADDRESS` default depends on the CLI version.** An `EVENT_REGISTRY_ADDRESS` exported in the shell always takes precedence over the default, interactive or `--non-interactive`.

  | CLI | peaq mainnet | agung |
  | :-- | :-- | :-- |
  | 0.0.13 or newer | Tokenomics 2.0 EventRegistry `0xA1e7F1d7B24dAb55Dc92491e6d9B89F6E925Ad1e`, written with a `.env` comment naming it (also offline). Nothing to set by hand. | No default |
  | 0.0.10 to 0.0.12 | Network default from GitHub, which is the 1.0 registry `0x43c6AF2E14dc1327dc3cc6c7117D1CD72fffEcbA` (empty when offline). Replace it with the 2.0 address for a 2.0 machine. | No default |
  | 0.0.9 | No default | No default |

  On mainnet the other five legacy addresses come from the network defaults fetched from GitHub at init time (offline, `DID_REGISTRY_ADDRESS` and `BATCH_PRECOMPILE_ADDRESS` keep their precompile defaults `0x0000000000000000000000000000000000000800` and `0x0000000000000000000000000000000000000805`, the other three stay empty); on agung only `DID_REGISTRY_ADDRESS` and `BATCH_PRECOMPILE_ADDRESS` have defaults, so `IDENTITY_REGISTRY_ADDRESS`, `IDENTITY_STAKING_ADDRESS` and `MACHINE_NFT_ADDRESS` also stay empty and must be filled by hand from `examples/.env.example` (agung EventRegistry: `0x2DAD8905380993940e340C5cE6d313d5c2780040`). With an empty value every command that builds an SDK client exits `3` with `Missing required env var: EVENT_REGISTRY_ADDRESS`. Export it before running the wizard or fill the line in `.env` afterwards; the addresses are in the [install page tables](https://docs.peaq.xyz/peaqos/install#peaq-mainnet-contracts). CLI 0.0.14 or newer prefills the mainnet MCR API URL with `https://mcr.peaq.xyz`; CLI 0.0.13 prefilled `https://mcr-20.peaq.xyz`, which serves the same Tokenomics 2.0 API, and 0.0.9 to 0.0.12 prefilled `https://mcr.peaq.xyz`. Deployment-mode reads ignore this value and resolve the host from the installed SDK's deployment record.


## `peaqos whoami`

Read-only command that prints the signing address, network, chain ID, RPC + MCR API URLs, the legacy contract addresses from `.env`, and a `Tokenomics 2.0:` block with the deployment ID, chain ID, and the five addresses the SDK record resolved (these come from the SDK, not from `.env`). Useful as a sanity check after `init`.

```bash
peaqos whoami
```

## `peaqos activate`


  **Upgrade the SDK underneath the CLI.** `InfoDesk` re-pointed `MACHINE_BRIDGE_ADAPTER` on 2026-09-08 and `peaq-os-sdk` 0.7.1 (2026-09-11) carries the new address. CLI 0.0.9 pins `peaq-os-sdk>=0.7.1,<0.8.0`, which clears the `PEER_MISMATCH` check but still fails `peaq-mainnet` activation and renewal on the `fullMode()` read; CLI 0.0.10 requires `peaq-os-sdk` 0.8.0, which reads `isEconomicAuthority()` (see the exit-code section). An environment installed before 2026-09-11 fails every `peaq-mainnet` write with `PEER_MISMATCH` until you run `pip install -U peaq-os-sdk`.


Onboard a machine in **one atomic transaction**. `MachineStateAndSync.activateMachine` mints the ERC-721, stores the DID document, bonds the subscription tier, and registers the home chain in a single call. Mirrors the [Activate](https://docs.peaq.xyz/peaqos/functions/activate) flow. Requires `TOKENOMICS_DEPLOYMENT_ID`.

The transaction sender becomes the machine's **owner and bond payer**. The bond is quoted in PEAQ per tier at the oracle rate; `--payment` chooses what settles it.

```bash
# Self-owned: your configured signer owns the machine and is its DID controller
peaqos activate \
  --machine-type Sensor \
  --credential-subject-hex 0xdeadbeef \
  --manufacturer 0x3333333333333333333333333333333333333333 \
  --tier entry \
  --did-document ./did.json

# Machine-owned, operator-controlled: the machine key signs and pays, you become DID controller
peaqos activate ... --for 0xMachine --machine-key ./machine.key

# Preview the bond, the voucher credit, and the net PEAQ. Submits nothing.
peaqos activate ... --dry-run

# Scripted: --yes is the only non-interactive consent
peaqos activate ... --json --yes

# Settle the PEAQ-quoted bond in USDT, accepting 0.5% conversion movement
peaqos activate ... --payment usdt --slippage-bps 50
```

#### Flags

| Flag | Required | Meaning |
| :-- | :-- | :-- |
| `--machine-type` | yes | Identity domain. Half of what fixes the permanent machine ID. |
| `--credential-subject-hex` | yes | `0x`-prefixed identity-anchor bytes. The other half. |
| `--manufacturer` | yes | Manufacturer address. Recorded on-chain, never verified by the contract. |
| `--tier` | yes | `entry`, `basic`, or `pro`. |
| `--did-document` | yes | Path to a UTF-8 JSON DID document (schema in GUIDE.md). |
| `--for` | no | Machine EOA address. Switches to machine-owned mode; requires `--machine-key`. |
| `--machine-key` | no | File holding the machine's `0x`-prefixed hex private key. |
| `--payment` | no | `peaq` (default) or `usdt`. Which asset settles the PEAQ-quoted bond. |
| `--slippage-bps` | conditional | Accepted conversion movement, `0` to `10000`. Required for `usdt`, rejected for `peaq`. |
| `--skip-funding` | no | Skip the balance check, 2FA, and Gas Station funding. |
| `--dry-run` | no | Preview and stop. |
| `--json` | no | One JSON object on stdout. Never implies consent. |
| `--yes` / `-y` | no | Accept the displayed terms. The only non-interactive consent. |

`--machine-type` and `--credential-subject-hex` alone determine the machine ID (`uint256(keccak256(abi.encode(machineType, credentialSubject)))`). Neither can change after activation, and the same pair can never be activated twice.

Private keys must come from a file. Inline key flags are intentionally unsupported: a file keeps the key out of shell history and `ps` output.
Put documentation and API URLs in the DID document service endpoints.


#### DID document schema

Use the three-field schema in [GUIDE.md](../GUIDE.md#did-document).

#### Ownership modes

| Mode | Who signs and pays | Controller |
| :-- | :-- | :-- |
| Self-owned (no `--for`) | Your configured signer owns the machine and pays the bond | Same address |
| Machine-owned, operator-controlled (`--for` + `--machine-key`) | The **machine** signs, owns the NFT, and pays gas and the bond | Your operator address (`PEAQOS_PRIVATE_KEY`), which signs nothing in this mode |

In machine-key mode the CLI prints the changed rights before asking: the machine wallet can transfer the NFT and rotate or clear the controller; the operator can run lifecycle, subscription, and DID actions but cannot transfer the NFT or change the controller. The signer must own the machine and pay its bond.

#### Paying in USDT

The bond, the voucher credit, and the net amount stay in PEAQ; only settlement differs. The CLI shows the USDT token, the quote, the accepted slippage, and the resulting **maximum USDT**, then submits that exact maximum. The allowance goes to `SubscriptionTokenProvisionPool`, not to `MachineSubscription`. A bond covered entirely by voucher credit converts and transfers nothing.

#### Output, exit codes, and `error_code`

Progress, the preview, and prompts go to stderr; stdout carries only the final summary (or one JSON object with `--json`). Machine IDs and every unbounded chain integer are **decimal strings** in JSON, never numbers.

```json
{
  "status": "activated",
  "mode": "self-owned",
  "deployment_id": "peaq-mainnet",
  "chain_id": "3338",
  "machine_id": "57896044618658097711785492504343953926634992332820282019728792003956564819975",
  "tier": "entry",
  "owner": "0xDC5b20847F43d67928F49Cd4f85D696b5A7617B5",
  "controller": "0xDC5b20847F43d67928F49Cd4f85D696b5A7617B5",
  "bond_amount": "909153310068100128",
  "voucher_credit": "0",
  "net_peaq_amount": "909153310068100128",
  "transaction_hash": "0xabab...",
  "is_homed_locally": true
}
```

The four CLI-wide exit codes apply. Once input validation has passed, every `activate` outcome is a JSON report (with `--json`) whose failures carry a stable `error_code`, bracketed in human output; success and preview reports have no `error_code` key and report a `status` instead: `preview`, `activated`, `already_active`, or `pending`. Before that point there is no report: the CLI's own input validation exits `1` with a plain message, values Click itself rejects (an unknown option, a `--tier` outside entry/basic/pro) exit `2` with a usage message, and a missing or wrong Economics 2.0 configuration exits `3` with a plain message. The codes to know:

| Exit | `error_code` examples |
| :-- | :-- |
| `0` | none; `status` is `activated` or `already_active` |
| `1` | `INVALID_INPUT`, `CANCELLED_BEFORE_SUBMIT` (interrupted before anything was submitted; declining the prompt exits 1 with a plain message and no report), `SPONSORED_UNSUPPORTED`, `INVALID_TIER` |
| `2` | `ORACLE_UNPRICED` (contracts reachable, no PEAQ price committed), `INSUFFICIENT_PEAQ`, `QUOTE_MOVED`, `TX_REVERTED`, `EVENT_MISMATCH`, `PENDING`, `ALREADY_ACTIVATED_RACE`, `TECHNICALLY_PAUSED` (protocol pause; the flags are read before the first approval, an approval that already confirmed stays spent) |
| `3` | `TOKENOMICS_NOT_CONFIGURED`, `DEPLOYMENT_UNKNOWN`, `CHAIN_MISMATCH`, `PEER_MISMATCH`, `ADDRESSES_UNSET` (network supported, contracts not deployed there) |

Two codes come with the CORE-777 contract change of 2026-09-15 (SDK fixes in `peaq-os-sdk-js` #96 and `peaq-os-sdk-py` #98): `NOT_ECONOMIC_AUTHORITY` replaces `NOT_FULL_MODE` and means the selected deployment's `MachineSubscription` is not the economic authority (CLI 0.0.9 has no row for it and reports `ACTIVATION_FAILED` at exit `2`; CLI 0.0.10 maps it to exit `3`), and `TECHNICALLY_PAUSED` means activation or renewal read a set `MachineStateAndSync` pause flag, or on a Solana onboarding the suite's upgrade lock (exit `2` on every command; an approval that confirmed before the pause stays spent). CLI 0.0.9 with SDK 0.7.x fails `peaq-mainnet` activation and renewal with `RPC_FAILED` naming `fullMode()`; CLI 0.0.10 with SDK 0.8.0 reads `isEconomicAuthority()`; see `troubleshooting.md`.

#### Pending transactions and `peaqos.log`

A submitted transaction whose receipt does not arrive is reported as `PENDING` at exit `2` with its hash, not as a failure. It may still mine. Every submitted hash is appended to `./peaqos.log` (mode `0600`) **before** the receipt wait. Re-running the same command reconciles the recorded hash instead of resubmitting; a hash with no receipt blocks resubmission regardless of age. Never submit a second activation for the same machine, and never delete `peaqos.log` while a transaction is outstanding.

### Solana activation (`--chain solana`, CLI 0.0.15 or newer)

Gate with `peaqos activate --help | grep -q -- '--max-in'`. If absent, the CLI predates 0.0.15 and implements the removed reservation flow: tell the user to run `pip install -U 'peaq-os-cli[solana,ows]'` (pulls `peaq-os-sdk` 0.11.0) and stop the Solana path.

Terminal-first, seven stages: `[1/7]` operator registration on peaq (`registration`, operator wallet, once per owner wallet), `[2/7]` activation request (`request`), `[3/7]` the Trust Validator node's credit (a wait), `[4/7]` settlement (`finalise`, the point of no return), `[5/7]` bond on peaq (a wait), `[6/7]` native onboarding (`native_onboarding`), `[7/7]` link push (`linkage`, delivered on peaq by the node). Every Solana write is the owner wallet's. Without `--phase` one command runs every stage the onboarding still needs and waits out the three external legs. `--phase cancel_request` ends a `Pending` or `Committed` request and returns the escrow. Configuration: `TOKENOMICS_DEPLOYMENT_ID=peaq-mainnet`, `PEAQOS_SVM_NETWORK=mainnet-beta`, peaq `PEAQOS_RPC_URL` and a separate `PEAQOS_SVM_RPC_URL`, all in `.env`.

| Solana option | Meaning |
| --- | --- |
| `--chain solana` | Home the machine on Solana. Needs `PEAQOS_SVM_RPC_URL` or `--svm-rpc-url`. |
| `--operator-wallet`, `--owner-wallet` | OWS wallet names, both defaulting to `PEAQOS_OWS_WALLET` (which names only one), so the one-command run needs both. Each is unlocked once per run. |
| `--solana-owner` | Required. The owner wallet's base58 public key. |
| `--manufacturer` | Required base58 public key, recorded without verification. |
| `--machine-type`, `--credential-subject-hex`, `--did-document` | Required identity and DID inputs; the first two fix the machine ID. |
| `--tier` | `entry`, `basic` or `pro`, or a program tier `0` to `7`. The quote refuses a tier the deployment does not price. |
| `--pay-in` | `PEAQ` (the OFT, 9 decimals; default) or `USDC` (swapped for exactly the bond at settlement). |
| `--max-in` | Required to open a request: the escrow in base units of the pay-in token. `--dry-run` suggests it; what the bond does not use comes back at settlement. |
| `--slippage-bps` | Default `100`: the cushion on the suggested escrow (the swap on USDC, the price stamp on PEAQ). |
| `--max-native-fee-lamports`, `--max-native-rent-lamports` | Required ceilings for each Solana write (fee excludes rent). `0` is strict. |
| `--compute-unit-price-micro-lamports` | Default `10000`. `0` sends without priority, which the public endpoint can drop under load. |
| `--compute-unit-limit` | Optional mint compute budget, 1 to 1,400,000, default 600,000. |
| `--max-link-push-fee-lamports` | Only when the deployment routes the link push over LayerZero; production's Trust Validator route has no fee. Refused with any phase other than `linkage`. |
| `--wait-minutes` | `0` to `60`, default `0`: the run's budget for its three waits, each also capped by the SDK (3 minutes for the credit, 6 for the bond). Refused with `--dry-run`. |
| `--timeout-seconds` | Time budget per write attempt, default `300`. Not a spending limit. |
| `--solana-controller` | Optional native controller; omitted means owner-only. |
| `--evm-operator` | Optional assertion: must equal the operator wallet's peaq address (`EVM_OPERATOR_MISMATCH` before `[1/7]`). Omit it. |
| `--phase` | `registration`, `request`, `finalise`, `native_onboarding`, `linkage` or `cancel_request`. The waits are not phases. |
| `--nonce` | With `cancel_request` only: the request to cancel, default the latest. |
| `--audit` | With `--dry-run` only: re-reads every transaction of the onboarding from `peaqos.log`. |
| `--dry-run`, `--json`, `--yes` | Keyless preview; structured output; `--yes` accepts every stage's terms as printed. |

`--for` and `--machine-key` are rejected. `--payment`, `--max-net-peaq-amount` and `--max-usdt-amount` belong to the removed flow and are refused with `OPTION_NOT_FOR_CHAIN` (exit `1`) naming the replacement; `--from-block` is accepted and ignored. Keep every input unchanged across invocations, and keep the working directory and `peaqos.log`: a rerun reconciles from the journal and never resends. Done is exit `0` with `next_step.phase == "complete"`; exit `0` on one stage is not completion. Every stop prints `resume_command`, and each run writes `onboarding-<machine-id>.json` beside the journal.

`peaqos machine history <decimal-id> --chain solana` lists every transaction of the onboarding on both chains (who sent it, slot or block, cost), then totals per payer. Keyless, from any directory; `-v` adds explorer links, `--json` decimal strings; an unread source is named and exits `2`.

With SVM configuration, `whoami` displays the requested cluster and available metadata without verifying it. Root `--svm-network` and `--svm-rpc-url` override environment, then dotenv settings.

`peaqos machine status <decimal-id> --json` falls back to Solana for missing or foreign-home EVM records. It needs no wallet or journal. Output has `status: "observed"` and `native_current_state`, separating finalized peaq and confirmed Solana observations; unread values are `null`. With `--chain solana` it reads the native state, including the `link` block (`not_pushed`, `pending_application`, `linked` or `unavailable`). Successful pending/conflicting observations exit 0; unavailable config exits 3; read failures exit 2. `present` alone does not prove completed onboarding.

## `peaqos machine`

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

CLI 0.0.9 gives `machine status --json` a structured error object on failure. Every write accepts `--yes` and `--json`; every read accepts `--json`. Machine IDs are full-width `uint256`: pass them as canonical unsigned decimal (no `0x`, no leading zeros) and read them back as decimal strings.

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

Exit codes and `error_code` values are the ones documented under [`peaqos activate`](#peaqos-activate): one taxonomy for both.


  **`qualify mcr`, `show machine` and `show operator machines` follow the deployment mode since CLI 0.0.9 (2026-09-14).** With `TOKENOMICS_DEPLOYMENT_ID` set, a machine DID is `did:peaq:<decimal machine id>` and the reads go to `mcr.peaq.xyz` (the host the SDK deployment record names in CLI 0.0.14 / SDK 0.10.0 and newer); a `did:peaq:0x<address>` DID exits `1` with a message naming the mode. Without it the CLI accepts only address DIDs and sends them to the host in `PEAQOS_MCR_API_URL`, but address-DID reads are no longer served, so MCR reads need `TOKENOMICS_DEPLOYMENT_ID` set. `show operator machines` takes `did:peaq:0x<address>` in both modes, because an operator DID names an account, not a machine. On CLI 0.0.9 both commands build the full SDK client even for a read (signer source plus the six Tokenomics 1.0 addresses in `.env`); CLI 0.0.10 reads MCR over HTTP only and needs neither. A failed query exits `2` with the MCR error code (for example `SERVICE_UNAVAILABLE` while the 2.0 operator index is syncing) instead of a traceback. On CLI 0.0.8 the same commands reject every 2.0 DID; upgrade with `pip install -U peaq-os-cli`.

## `peaqos qualify event`

Submit a single machine event to the EventRegistry.

```bash
# Revenue event (self-reported)
peaqos qualify event --machine-id <decimal-id> --type revenue --value 123 --ts 1735000000

# Activity event with ISO timestamp
peaqos qualify event --machine-id <decimal-id> --type activity --value 0 --ts "2026-04-22T12:00:00Z"

# On-chain verified revenue event
peaqos qualify event --machine-id <decimal-id> --type revenue --value 500 --ts 1735000000 \
  --trust onchain --source-tx 0xabc...def

# With currency code (non-USD)
peaqos qualify event --machine-id <decimal-id> --type revenue --value 1000 --ts 1735000000 \
  --currency HKD
```

**Required flags:**

| Flag | Purpose |
|------|---------|
| `--machine-id <n>` | Machine ID from activation (positive integer) |
| `--type revenue\|activity` | Event type |
| `--value <n>` | Value in ISO 4217 subunits (e.g. USD cents). Must be ≥ 0. |
| `--ts <timestamp>` | Unix seconds or ISO 8601 with timezone (e.g. `2026-04-22T12:00:00Z`) |

**Optional flags:**

| Flag | Default | Purpose |
|------|---------|---------|
| `--trust self\|onchain\|hardware` | `self` | Trust level |
| `--source-chain same\|peaq\|base` | `same` | Source chain |
| `--source-tx <hash>` |: | 32-byte source tx hash. Required when `--trust onchain`. |
| `--raw-data <file>` |: | File path; bytes are hashed and stored as data hash |
| `--metadata <file>` |: | File path; bytes attached as on-chain metadata |
| `--currency <code>` | SDK default | Currency code (e.g. `USD`, `HKD`). Revenue defaults to `USD`. Activity should be `""`. |

**Important:** `--value` is always in subunits. HK$1.23 → `--value 123 --currency HKD`.
Using whole numbers here is a common mistake: 1000 means $10.00 USD, not $1000.00.

**Output:**
```
Event submitted.
  Machine ID:   57896044618658097711785492504343953926634992332820282019728792003956564819975
  Type:         revenue
  Value:        123
  Trust:        self-reported
  Tx:           0x3f4a...
  Data Hash:    0xa1b2...
```

---

## `peaqos qualify mcr`

With `TOKENOMICS_DEPLOYMENT_ID=peaq-mainnet`, use `did:peaq:<decimal machine id>` and reads go to `https://mcr.peaq.xyz`. MCR reads need the deployment ID: without it the CLI sends address DIDs (`did:peaq:0x<address>`) to the host in `PEAQOS_MCR_API_URL`, and those reads are no longer served. On `agung-2026-08-28` there is no paired MCR: `qualify mcr` and `show` exit `3` with `CONFIG_ERROR` (`The SDK rejected the selected MCR deployment`) before any request; use `peaqos machine status` there. In CLI 0.0.9 both commands build an SDK client, so they need a signer source (`PEAQOS_PRIVATE_KEY`, or `PEAQOS_OWS_WALLET`, which unlocks the wallet) and the six legacy contract addresses in `.env`; CLI 0.0.10 moves them to an HTTP-only query client that needs neither.

```bash
peaqos qualify mcr did:peaq:<decimal-id>
peaqos qualify mcr did:peaq:<decimal-id> --json
```

Human output includes rating, score, bond status, event counts, revenue trend and FX degraded status. A failed query exits 2 with the MCR error code, such as `SERVICE_UNAVAILABLE`. Wrong-mode DIDs exit 1.

## `peaqos show machine`

Fetch a full profile from the MCR API, not a chain-direct read.

```bash
peaqos show machine did:peaq:<decimal-id> --json
```

The same deployment-dependent DID rules apply. CLI 0.0.9 has a serialization bug: `show machine --json` emits `machine_id` as a JSON number. Read the decimal suffix of `did` or use a big-integer-aware parser. `machine status --json` preserves the ID as a decimal string.

## `peaqos wallet`

Manage OWS (Open Wallet Standard) encrypted vault wallets. Requires `pip install "peaq-os-sdk[ows]"`. Without OWS installed, all wallet subcommands exit with code 3 and an install hint.

Wallets are stored encrypted in `~/.ows/wallets/`, protected by a vault passphrase. The passphrase is prompted interactively or read from `OWS_PASSPHRASE` env var.

### `peaqos wallet create <name>`

Create a new BIP-39 mnemonic-backed wallet.

```bash
peaqos wallet create my-operator
peaqos wallet create my-operator --words 24
peaqos wallet create my-operator --json
```

**Flags:**

| Flag | Default | Purpose |
|------|---------|---------|
| `--words 12\|24` | `12` | Mnemonic word count |
| `--json` | false | Machine-readable output |

Prompts for vault passphrase. Prints the address and stores the encrypted wallet in `~/.ows/`. **The mnemonic is not displayed during creation**: back it up immediately afterward with `peaqos wallet export <name>` (requires interactive confirmation) and store the phrase somewhere safe.

### `peaqos wallet import <name>`

Import an existing wallet from a mnemonic or private key file.

```bash
peaqos wallet import my-operator --mnemonic
peaqos wallet import my-operator --private-key-file ./key.txt
peaqos wallet import my-operator --mnemonic --index 1
```

**Flags:**

| Flag | Default | Purpose |
|------|---------|---------|
| `--mnemonic` |: | Prompt for BIP-39 mnemonic phrase |
| `--private-key-file <path>` |: | Path to file containing 0x-prefixed hex private key |
| `--index <n>` | `0` | HD derivation index |
| `--json` | false | Machine-readable output |

### `peaqos wallet list`

List all wallets in the vault.

```bash
peaqos wallet list
peaqos wallet list --json
```

### `peaqos wallet show <name>`

Display wallet details and all chain addresses.

```bash
peaqos wallet show my-operator
peaqos wallet show my-operator --json
```

### `peaqos wallet export <name>`

Export the wallet's recovery phrase. Requires interactive confirmation.

```bash
peaqos wallet export my-operator
```

### `peaqos wallet delete <name>`

Securely delete a wallet from the vault. Requires interactive confirmation.

```bash
peaqos wallet delete my-operator
```

### `peaqos wallet use <name>`

Set a wallet as the active default. Writes `PEAQOS_OWS_WALLET=<name>` to `.env`.

```bash
peaqos wallet use my-operator
```

---

## `peaqos show operator machines`

List all machines managed by an operator DID. Use `did:peaq:0x<address>` in both deployment modes.

```bash
peaqos show operator machines did:peaq:0x<40-hex>
peaqos show operator machines did:peaq:0x<40-hex> --json
```

Output: tabular list of `peaqID`, `Machine ID`, `MCR score`, `Rating`.

---

## `peaqos stream`

Data-stream commands, all included in CLI 0.0.9. A machine's data is chunked, encrypted per chunk (XChaCha20-Poly1305), and signed as a chain (Ed25519); buyers get the chunk keys re-wrapped to their X25519 public key. The crypto commands (`publish`, `grant`, `consume` in local mode) need no wallet and write nothing on-chain: their only network I/O is `publish --input <url>` downloads and the optional `publish --s3` upload. The paid-flow commands (`distribute`, `pay`, `payproof`) talk to HTTP endpoints and chains.

**Key files:** **private** keys are passed as **file paths**, never inline: 64 hex chars (optional `0x` prefix), one per line, `chmod 600`. X25519 **public** keys are shared openly and passed inline as flags (`--owner-public-key`, `--buyer-public-key`, …).

### `peaqos stream publish`

Seller: chunk, encrypt, and sign a data file into an output directory. Writes `chunk-<i>.json` (envelope) + `chunk-<i>.bin` (ciphertext) per chunk plus a `manifest.json` (`peaq.stream.chunks.v1`).

```bash
peaqos stream publish \
  --input ./telemetry.bin \
  --output-dir ./out \
  --owner-public-key 0x<64hex> \
  --operator-public-key 0x<64hex> \
  --machine-public-key 0x<64hex> \
  --signing-key-file ./machine-ed25519.key \
  --machine-did <machine-did> \
  --machine-key-id "<machine-did>#keys-1"   # did:peaq:<decimal id> for a 2.0 machine, did:peaq:0x<address> for a 1.0 machine
```

**Required:** `--input` (file path or http(s) URL), `--output-dir`, the three X25519 recipient public keys (owner/operator/machine), `--signing-key-file` (Ed25519 private key file), `--machine-did`, `--machine-key-id`.

**Optional:** `--chunk-size` (bytes, default `262144`), `--json`, and S3 upload: `--s3 s3://bucket/prefix/`, `--s3-region`, `--s3-endpoint` (MinIO/R2). S3 needs `pip install "peaq-os-cli[s3]"` plus `PEAQOS_S3_ACCESS_KEY_ID` / `PEAQOS_S3_SECRET_ACCESS_KEY` (or the boto3 chain).

**Exit codes:** 0 success · 1 validation (bad key hex, missing input) · 2 URL download or S3 upload failure

### `peaqos stream grant`

Seller: re-wrap the chunk keys for one buyer: fully offline, a local re-key, not an on-chain grant. Writes `peaq.stream.buyer-access.v1` files.

```bash
peaqos stream grant \
  --chunk-dir ./out \
  --buyer-public-key 0x<64hex> \
  --buyer-id did:peaq:0x<buyer> \
  --owner-private-key-file ./owner-x25519.key \
  --output-dir ./buyer-access
```

**Optional:** `--max-file-size` (bytes per access file, default `512000`), `--json`.

**Exit codes:** 0 success · 1 validation · 2 key-commitment mismatch (**wrong owner key**: the most common failure)

### `peaqos stream consume`

Buyer: verify, decrypt, and reassemble purchased data. Two input modes:

```bash
# Local mode: offline
peaqos stream consume \
  --chunk-dir ./out --access-dir ./buyer-access --data-dir ./out \
  --buyer-private-key-file ./buyer-x25519.key \
  --buyer-id did:peaq:0x<buyer> \
  --output ./recovered.bin

# Remote mode: fetch a self-contained release bundle
peaqos stream consume \
  --download-url "https://bundles.example.com/releases/ord-001/" \
  --buyer-private-key-file ./buyer-x25519.key \
  --buyer-id did:peaq:0x<buyer> \
  --output ./recovered.bin
```

- `--download-url` is **mutually exclusive** with `--chunk-dir`/`--access-dir`/`--data-dir`. The URL must serve a **self-contained release package**: chunk envelopes + `.bin` blobs + access files: as a `manifest.json` file listing or a ZIP archive.
- ⚠️ `--download-url` does **not** accept the pre-signed URL printed by `peaqos stream distribute`: that URL delivers only the first buyer-access file. A full distribute→consume roundtrip needs a self-hosted bundle.
- Optional: `--work-dir` / `--keep-files` (remote mode), `--skip-verify` (debugging only), `--json`.

**Exit codes:** 0 success · 1 validation (missing dirs, `--download-url` combined with a dir flag) · 2 decryption/integrity/download failure. Error messages are specific: `access not granted for this buyer private key` = wrong buyer key; `No buyer access for chunk N` = `--buyer-id` doesn't match the access files.

### `peaqos stream distribute`

Seller: wait for a buyer's payment confirmation, then auto-generate access files (same re-key as `grant`) and deliver them to S3, returning a pre-signed download URL (for the first access file). Polls `--confirmation-url` every `--poll-interval`s (default 30) until confirmed or `--timeout`s (default 3600). The endpoint must return JSON with `status` (`confirmed`), the matching `order_id`, a non-empty `tx_hash`, `buyer_id` and `buyer_public_key_hex`; a response with a non-confirmed `status` or a mismatched `order_id` is retried until the timeout, a confirmed response missing `tx_hash`, `buyer_id` or `buyer_public_key_hex` stops `distribute` at once with exit 1.

```bash
peaqos stream distribute \
  --chunk-dir ./out \
  --owner-private-key-file ./owner-x25519.key \
  --confirmation-url https://api.example.com/orders/ord-001/status \
  --order-id ord-001 \
  --delivery s3 \
  --s3 s3://my-bucket/distributes/
```

**Required:** `--chunk-dir`, `--owner-private-key-file`, `--confirmation-url`, `--order-id`, `--delivery` (**only `s3`**: the SDK's P2P delivery channel has no CLI flag), `--s3`.

**Optional:** `--poll-interval`, `--timeout`, `--s3-region`, `--s3-endpoint`, `--presign-expiry` (default 3600), `--max-file-size`, `--json`.

**Exit codes:** 0 success · 1 validation · 2 confirmation timeout or S3 failure · 3 `boto3` missing (`pip install "peaq-os-cli[s3]"`)

### `peaqos stream pay`

Buyer: transfer tokens on-chain to the seller: native or ERC-20/SPL on `peaq`, `base`, or `solana`: and optionally submit the tx hash as proof in the same run. Without `--confirmation-url`, only the transfer runs and the CLI prints the matching `payproof` command. The tx hash always prints before the proof step, so it survives a failed proof.

```bash
peaqos stream pay \
  --seller-address 0x<seller> \
  --amount 1.0 \
  --chain base \
  --order-id order-002 \
  --rpc-url https://mainnet.base.org \
  --token-address 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
  --confirmation-url https://api.example.com/payments/proof
```

**Required:** `--seller-address` (EVM `0x…` or Solana base58), `--amount` (human-readable), `--chain`, `--order-id`.

**Optional:** `--confirmation-url`, `--token-address` (omit for native token), `--token-decimals`, `--rpc-url` (**required** for `base` and `solana`), `--private-key-file` (falls back to `PEAQOS_PRIVATE_KEY`), `--json`.

Solana support needs `pip install "peaq-os-sdk[solana]"` and signs with the active OWS wallet's Solana account (`PEAQOS_OWS_WALLET`, `OWS_PASSPHRASE` when non-interactive); `--private-key-file` and `PEAQOS_PRIVATE_KEY` cover EVM chains only.

**Exit codes:** 0 success · 1 validation/signing (never leaks key material) · 2 insufficient balance, revert, or proof HTTP failure · 3 config

### `peaqos stream payproof`

Buyer: submit proof for a transfer done outside `stream pay`, or retry a failed proof step.

```bash
peaqos stream payproof \
  --tx-hash 0x<hash> --order-id order-001 \
  --confirmation-url https://api.example.com/payments/proof \
  --chain peaq --payer-address 0x<payer> --payee-address 0x<seller> \
  --amount 10.5
```

**Required:** `--tx-hash`, `--order-id`, `--confirmation-url`, `--chain`, `--payer-address`, `--payee-address`, `--amount` (must match the transfer). **Optional:** `--token`, `--token-address`, `--json`.

---

## `peaqos scale`

Machine Market orchestration commands. All `scale` subcommands require `PEAQOS_ORCHESTRATION_URL`. `PEAQOS_ORCH_API_KEY` is optional: only needed if the deployment requires platform API key auth.

> **SDK note:** If using the Python SDK directly (`PeaqosClient`), the equivalent env var is `PEAQOS_API_KEY` (not `PEAQOS_ORCH_API_KEY`). Both hold the same platform API key value: the names differ between the CLI and the SDK.

> **Auth modes:** Scale commands use two auth mechanisms. Platform commands (machine CRUD, list, status, order list) use the platform API key (`PEAQOS_ORCH_API_KEY`) if configured. Agent commands (search, order create/execute, order received, order dispute) authenticate with the pairing token via `x-agent-pairing-token` and always require `--pairing-token-file`.

### `peaqos scale machine onboard`

Register a machine in the Machine Market. Distinct from `peaqos activate`: on-chain identity must exist first. **Tokenomics mode gate.** With `TOKENOMICS_DEPLOYMENT_ID` set, the CLI builds the SDK client in Tokenomics mode, and the SDK refuses every orchestration call that binds a machine identity (`scale machine onboard | list | status`, `scale agent pair`, `scale search`) with `TokenomicsIntegrationUnavailableError` ("orchestration identity binding"). The Market verifies identities against the Tokenomics 1.0 MCR, so Scale works today for **1.0 machines** (`did:peaq:0x<address>`) from a `.env` **without** `TOKENOMICS_DEPLOYMENT_ID`. A machine activated under Economics 2.0 cannot be registered in the Market yet; tell the user so instead of retrying.

```bash
peaqos scale machine onboard \
  --identity-ref did:peaq:0x<40-hex> \
  --display-name "Solar Inverter #4821" \
  --owner-id <owner-id> \
  --machine-type edge-node \
  --runtime-profile linux-docker \
  --capabilities inference,data-feed \
  --skill-keys oracle.price-feed \
  --labels env=production,region=eu \
  --identity-key-file ./controller.key
```

**Flags:**

| Flag | Required | Purpose |
|------|----------|---------|
| `--identity-ref` | Yes | DID (`did:peaq:0x...`) or `peaqos:machine:<id>` |
| `--display-name` | Yes | Human-readable machine name |
| `--owner-id` | Yes | Operator/owner identifier |
| `--machine-type` | Yes | e.g. `edge-node`, `robot`, `sensor` |
| `--runtime-profile` | Yes | e.g. `linux-docker` |
| `--capabilities` | No | Comma-separated capability list |
| `--skill-keys` | No | Skill keys the machine supports |
| `--labels` | No | `key=value` pairs, comma-separated |
| `--identity-key-file` | No | DID controller private key for signing |
| `--identity-signature-file` | No | Pre-signed EIP-191 signature file (mutually exclusive with `--identity-key-file`) |
| `--skip-activate` | No | Register in draft status without activating |
| `--yes` / `-y` | No | Skip confirmation prompt |
| `--json` | No | Machine-readable output (requires non-interactive signing) |

**Signing modes (checked in order):**
1. `--identity-signature-file`: pre-signed signature from file
2. `--identity-key-file`: sign with provided private key
3. OWS wallet active: sign via active OWS wallet automatically
4. Manual fallback: CLI prompts to paste EIP-191 signature

**Exit codes:** 0 success · 1 validation error · 2 API/proof error · 3 config error (missing `PEAQOS_ORCHESTRATION_URL`)

---

### `peaqos scale machine status`

Check a machine's status in the Market.

```bash
peaqos scale machine status <machine-id>
peaqos scale machine status <machine-id> --json
```

---

### `peaqos scale machine list`

List machines registered in the Market.

```bash
peaqos scale machine list
peaqos scale machine list --json
```

---

### `peaqos scale agent pair`

Pair an AI agent to a machine via the challenge-sign flow. Produces a **one-time pairing token**: store it securely immediately.

```bash
peaqos scale agent pair \
  --machine-id <id> \
  --agent-address 0x<address> \
  --agent-provider teneo \
  --agent-role machine-market-buyer \
  --agent-did did:pkh:eip155:1:0x<address> \
  --per-tx-limit 10.00 \
  --daily-limit 100.00 \
  --currency USD \
  --allowed-skills oracle.price-feed \
  --agent-signature-file ./agent.sig
```

**Flags:**

| Flag | Required | Purpose |
|------|----------|---------|
| `--machine-id` | Yes | Machine to pair to |
| `--agent-address` | Yes | Agent's on-chain address |
| `--agent-provider` | Yes | Provider identifier (e.g. `teneo`) |
| `--agent-role` | Yes | e.g. `machine-market-buyer` |
| `--agent-did` | No | Agent DID |
| `--agent-signature-file` | No | Pre-signed challenge signature (required for `--json` mode) |
| `--description` | No | Human-readable pairing description |
| `--per-tx-limit` | No | Max spend per transaction |
| `--daily-limit` | No | Max daily spend |
| `--currency` | No | Budget currency (e.g. `USD`) |
| `--allowed-skills` | No | Comma-separated allowed skill keys |
| `--denied-skills` | No | Comma-separated denied skill keys |
| `--allowed-service-ids` | No | Comma-separated allowed service IDs |
| `--denied-service-ids` | No | Comma-separated denied service IDs |
| `--yes` / `-y` | No | Skip confirmation |
| `--json` | No | Machine-readable output |

**Exit codes:** 0 success · 1 validation error · 2 API/proof error · 3 config error

---

### `peaqos scale search`

Search the Machine Market for services matching a task.

```bash
peaqos scale search \
  --machine-id <id> \
  --service-type oracle.price-feed \
  --pairing-token-file ./pairing.token \
  --operation get-latest-price \
  --capabilities realtime,verified \
  --region eu-west \
  --budget-amount 5.00 \
  --budget-max 10.00 \
  --budget-currency USD \
  --max-results 5
```

**Flags:**

| Flag | Required | Purpose |
|------|----------|---------|
| `--machine-id` | Yes | Machine performing the search |
| `--service-type` | Yes | Service type (e.g. `oracle.price-feed`) |
| `--pairing-token-file` | Yes | Path to agent pairing token file |
| `--agent-pairing-id` | No | Agent pairing ID |
| `--operation` | No | Desired operation (e.g. `get-latest-price`) |
| `--capabilities` | No | Required capabilities, comma-separated |
| `--region` | No | Preferred region |
| `--max-results` | No | Max quotes to return |
| `--budget-amount` | No | Budget amount |
| `--budget-max` | No | Maximum budget amount |
| `--budget-currency` | No | Budget currency (e.g. `USD`) |
| `--native-only` | No | Require native execution (no external handoff) |
| `--allow-handoff` | No | Allow external handoff |
| `--provider-credentials` | No | Path to JSON file with provider credentials |
| `--json` | No | Machine-readable output |

Returns a ranked table of quotes. Output includes `search_id` and per-quote `quote_id`, `service_id`, `operation`, `score`, `execution_mode`.

**Exit codes:** 0 success · 1 validation error · 2 API error · 3 config error (missing URL)

---

### `peaqos scale order <service-id>`

Place a market order for a service. `<service-id>` is the UUID from a search result.

```bash
peaqos scale order <service-id> \
  --machine-id <id> \
  --agent-pairing-id <pairing-id> \
  --pairing-token-file ./pairing.token \
  --search-id <search-id> \
  --quote-id <quote-id> \
  --operation get-latest-price \
  --input ./input.json \
  --budget-amount 5.00 \
  --budget-currency USD
```

**Payment flags:**

| Flag | Purpose |
|------|---------|
| `--payment-tx-hash` | Pre-completed payment tx hash |
| `--payment-chain` | Chain for payment proof (required with `--payment-tx-hash`) |
| `--payment-token` | Token for payment proof (required with `--payment-tx-hash`) |
| `--skip-payment` | Skip payment step (requires `--payment-tx-hash`) |

**Payment flows:**
- **No payment required**: 2-step create → execute
- **Wallet payment (EVM)**: 5-step create → intent → send → proof/escrow → execute. OWS wallets handle EVM transfers automatically.
- **Pre-completed**: pass `--payment-tx-hash` + `--payment-chain` + `--payment-token` with `--skip-payment`
- **x402**: 6-step create → intent → sign → proof → execute → confirm, used by paid-HTTP Agentic Market providers (e.g. Wolfram Alpha over USDC on Base). The CLI signs the provider's payment challenge **locally** with the active wallet (OWS wallet when `PEAQOS_OWS_WALLET` is set, otherwise the local key) and hands the signed `PAYMENT-SIGNATURE` header to peaqOS, which pays the provider during execute. **No separate on-chain transfer and no tx-hash prompt**; delivery is confirmed automatically in step 6. If execution fails after proof is recorded, the error shows the current payment status: run `peaqos scale order status <id>` to check whether the authorization is held.

Set `PEAQOS_ORDER_STEP_DELAY_SEC` to pause between placement steps (demos, eventually-consistent state); unset = no delay.

**Exit codes:** 0 success · 1 validation error · 2 API/payment error · 3 config error

---

### `peaqos scale order status`

Check the status of a market order.

```bash
peaqos scale order status <order-id>
peaqos scale order status <order-id> --json
```

---

### `peaqos scale order list`

List market orders for a machine. Uses platform auth: no pairing token needed.

```bash
peaqos scale order list --machine-id <id>
peaqos scale order list --machine-id <id> --json
peaqos scale order list --machine-id <id> --limit 10 --cursor <cursor>
```

---

### `peaqos scale order received`

Confirm delivery of a market order. Releases held payment to the provider.

```bash
peaqos scale order received <order-id> --pairing-token-file ./pairing.token
```

---

### `peaqos scale order dispute`

Dispute a market order. Freezes payment pending resolution.

```bash
peaqos scale order dispute <order-id> \
  --reason "Service output did not match expected schema" \
  --pairing-token-file ./pairing.token
```

---

## `peaqos monetize`

Manage a machine's **Economics 2.0 monetization** decision in the MCR: `status` is a public read; `opt-in` and `opt-out` are signed, off-chain decisions. Thin wrappers over the SDK's [opt-in client](https://docs.peaq.xyz/peaqos/sdk-reference/monetization-opt-in): the SDK runs the compatibility check, EIP-191 signing, retries, HTTP, and response validation; the CLI adds parsing, prompts, and output.


  **Live on `peaq-mainnet` since 2026-09-05.** The 2.0 MCR at `https://mcr.peaq.xyz` publishes the `/.well-known/peaq-monetization` signal and serves the mirrored 2.0 machines; `peaqos monetize status <decimal id>` returns `PENDING` for a machine that has never opted in. `agung-2026-08-28` has no paired MCR and exits `3` with `CONFIG_ERROR` (`The SDK rejected the selected MCR deployment`).


```text
peaqos monetize status  KEY [--timeout-seconds 30.0] [--max-unavailable-retries 2] [--unavailable-retry-delay-seconds 1.0] [--json]
peaqos monetize opt-in  KEY [same options] [--yes] [--json]
peaqos monetize opt-out KEY [same options] [--yes] [--json]
```

`KEY` is a canonical decimal machine ID or `did:peaq:<decimal machine id>`. Address DIDs (`did:peaq:0x…`), leading zeros, signs, hex, and exponents are rejected locally: there is no translation from a 1.0 address DID to a 2.0 machine ID.

Every command requires `TOKENOMICS_DEPLOYMENT_ID`. The SDK resolves the MCR URL, chain ID, `MachineRegistry`, and API version from that deployment and the server's live compatibility signal (`GET /.well-known/peaq-monetization`). `PEAQOS_MCR_API_URL`, `IDENTITY_REGISTRY_ADDRESS`, and `PEAQOS_RPC_URL` are not read; an explicit `--api-url` exits `3`. `status` needs no signer; writes sign with `PEAQOS_PRIVATE_KEY` or, on CLI 0.0.10, the active OWS wallet, and the signing address must be the machine's current **owner or DID controller** (a key without current owner/controller authority is not authorized).

Before a write the CLI reads the current state; an already-satisfied state returns without a prompt, signature, or PUT. Only `503 MACHINE_UNAVAILABLE` is retried. A timeout during a PUT is ambiguous (the MCR may have applied it): rerun the same command, which reads first and sends no second PUT if the state is already there.

```bash
peaqos monetize opt-in did:peaq:57896044618658097711785492504343953926634992332820282019728792003956564819975
peaqos monetize status 57896044618658097711785492504343953926634992332820282019728792003956564819975 --json
```

```json
{ "machine_id": "57896044618658097711785492504343953926634992332820282019728792003956564819975", "status": "OPTED_IN", "signer": "0x7099...79C8", "updated_at": 1783944004 }
```

CLI 0.0.9 gives `monetize status --json` a structured error object on failure. 2.0 state starts at `PENDING`; Tokenomics 1.0 decisions and signatures are not imported.

| Situation | Exit |
| :-- | :-- |
| Invalid or non-canonical `KEY` or option value; declined prompt; non-TTY write without `--yes` | `1` |
| Signer not owner or controller (`UNAUTHORIZED_SIGNER`); ineligible opt-in (`MACHINE_NOT_BONDED`, `MACHINE_DEACTIVATED`); network, timeout, or API rejection | `2` |
| Missing or unknown `TOKENOMICS_DEPLOYMENT_ID`; incompatible or unreachable MCR (`MONETIZATION_API_INCOMPATIBLE`); explicit `--api-url` | `3` |


### `peaqos monetize provision`

For an opted-in machine, use `peaqos monetize provision run <provider> --machine <decimal-id>`; `preflight` and `verify` inspect setup and results. Supply `PEAQOS_MANIFEST_REPO_URL` (or `--manifest-repo`) from the peaq team and `PEAQOS_MACHINE_WALLET_ADDRESS` for the payout context. Clear the wallet address before changing machines. Manual mode confirms each command. Read `peaqos monetize provision --help` before provisioning. (`monetize provision verify` is unrelated to `peaqos verify` below.)

---

## `peaqos verify`

Experimental: the command names are stable for v1 beta, the output may still change. Verify needs peaq-os-cli 0.0.14 or newer; 0.0.14 is the first published CLI with these commands and depends on peaq-os-sdk >=0.10.0,<0.11. Reads a machine's Verify record and builds local chip preflight artifacts. Nothing here writes a Verify record. Gate with `peaqos verify --help`: if it fails, the installed CLI has no Verify commands. Do not gate on a version number.

```text
peaqos verify status MACHINE_ID [--json]
peaqos verify chip prepare --context FILE --certificate FILE --out FILE [--json]
peaqos verify chip controller-request --context FILE --certificate FILE --chip-signature FILE --out FILE [--json]
peaqos verify chip finalize --context FILE --certificate FILE --chip-signature FILE --controller-signature FILE --out FILE [--json]
```

### `peaqos verify status`

```bash
export PEAQOS_VERIFY_API_URL=https://mcr.peaq.xyz
peaqos verify status 123
peaqos verify status 123 --json
peaqos --verify-api-url https://mcr.peaq.xyz verify status 123
```

One read of `GET /v1/verify/machines/{machineId}` through the SDK read client. The CLI does not retry. It needs only the origin: no wallet, key, RPC or `TOKENOMICS_DEPLOYMENT_ID`. The origin comes from the root `--verify-api-url` (which wins even when empty), then `PEAQOS_VERIFY_API_URL` from the shell or `.env`. There is no default. `MACHINE_ID` is a canonical decimal in `1..2^256-1` with no leading zeros; a DID or an address exits `1`.

Human output: `Verification for machine <id>`, then `Machine DID`, `Home Chain` (`peaq (EVM)`, `Agung testnet (EVM)`, `EVM chain <id>` for an unnamed EVM chain, or `Solana`; the CLI has labels for all four, but this release covers peaq mainnet Verify only, and it returns `peaq (EVM)` machines only), `DID Controller`, `Operator Address` (both truncated on a terminal), `KYB`, `Chip` and `Source: Verify API`.

`--json` prints one object with full identifiers:

```json
{
  "machineId": "123",
  "machineDid": "did:peaq:123",
  "homeChain": { "kind": "evm", "chainId": "3338" },
  "didController": { "kind": "evm", "address": "0x..." },
  "operator": { "kind": "evm", "address": "0x..." },
  "verification": { "kyb": { "status": "unverified" }, "chip": { "status": "unverified" } }
}
```

`homeChain` is `{ "kind": "solana", "genesisHash": "..." }` for a Solana home in the schema, but peaq mainnet Verify does not serve Solana-homed reads (see exit `2`). Each status is `unverified`, `verified`, `expired` or `revoked`, per topic, with no aggregate field.

| Exit | Message | When |
| :-- | :-- | :-- |
| `0` | record printed | Includes both topics `unverified` |
| `1` | `MACHINE_ID must be a canonical decimal integer in 1..2^256-1 (no leading zeros).` | Bad ID, DID or address |
| `2` | `Machine not found in the Verify service.` | API `404 MACHINE_NOT_FOUND`: no machine with that ID in the Verify service (expected for an agung testnet machine, because this release covers peaq mainnet Verify only); never means `unverified` |
| `2` | `Verify state is temporarily unavailable; retry later.` | API `503 VERIFY_READ_UNAVAILABLE` (always for a Solana-homed machine on mainnet; can be transient for a peaq-homed one) or `INTERNAL_ERROR` |
| `2` | `Verify API rate limit reached; retry later.` (plus `Retry after N seconds.` when the API sends 1 to 60) | API `429 RATE_LIMITED`. The read route allows 60 requests per minute per IP address; v1 sends no `Retry-After` |
| `2` | `Verify status request timed out; retry later.` / `Verify API could not be reached; check your connection and retry.` / `Verify status request was canceled; retry when ready.` | Transport failure or Ctrl-C |
| `2` | `Verify API returned an invalid response; do not treat it as verification state.` | Response failed the SDK's shape checks |
| `2` | `Verify status could not be read.` | Any other API error, for example `VERIFY_ROUTE_NOT_FOUND` from an origin without the Verify route |
| `3` | `Set PEAQOS_VERIFY_API_URL to a valid HTTPS origin.` | Origin missing, empty or not a valid HTTPS origin |
| `3` | `Install a peaq-os-sdk package with public Verify read support.` | Installed SDK lacks `peaq_os_sdk.verify` |

### `peaqos verify chip`

Three stateless stages: each re-reads its files and rebuilds the earlier stages, so nothing is cached or resumed. They never contact the chip, a wallet or the Verify API and hold no key. External signers produce the two signatures. Chip preflight is EVM-only and supports one profile: Infineon OPTIGA Trust M Express, leaf certificate under the CA306 chain.

| Stage | Reads | Writes (`--out`) | Then |
| :-- | :-- | :-- | :-- |
| `prepare` | `--context`, `--certificate` | `chip-prehash`: 32 bytes | Chip key `0xE0F0` signs it with ECDSA without hashing; do not hash it again |
| `controller-request` | adds `--chip-signature` | `controller-message` | The current DID controller signs it once as an EIP-191 personal message, no extra framing |
| `finalize` | adds `--controller-signature` | `evidence`: canonical `peaq.verify.chip-evidence/1` document | Hand it to the peaq contact who issued `context.json` |

| Flag | Content | Limit |
| :-- | :-- | :-- |
| `--context` | Challenge context JSON from peaq's onboarding service | UTF-8 without BOM, one object with exactly `chainId`, `didController`, `expiresAt`, `machineDid`, `machineId`, `nonce`, all strings; at most 4096 bytes. The raw challenge response also has `profile`, `protocol` and `verifier` and is rejected; strip them with `jq '{chainId, didController, expiresAt, machineDid, machineId, nonce}'` |
| `--certificate` | Raw DER leaf certificate read from chip object `0xE0E0` | At most 1300 bytes |
| `--chip-signature` | Chip's native signature from `0xE0F0`: `r` and `s` as two DER integers, no `SEQUENCE` header (`trustm_ecc_sign -o` output minus its first 2 bytes) | At most 80 bytes |
| `--controller-signature` | Controller's EIP-191 signature, raw bytes | Exactly 65 bytes, low-s, last byte 27 or 28 (`0x1b`/`0x1c`); 0/1 is rejected, not normalized, and fails `finalize` with exit 1 |
| `--out` | Artifact to create | Must not exist; created with mode `0600`, never overwritten, no `--force` |

Inputs must be regular files; symlinks, directories and FIFOs are refused. The challenge is valid for at most five minutes: every stage checks `now < expiresAt <= now + 300` (Unix seconds) against the local clock.

Human output: `Chip preflight artifact created.`, then `Stage`, `Artifact` (`chip-prehash`, `controller-message` or `evidence`), `Byte Length` and `Authority: local preflight only`. `finalize` adds `Protocol: peaq.verify.chip-proof/1`, `Profile: infineon-optiga-trust-m-express-ca306/1`, `Evidence Schema: peaq.verify.chip-evidence/1`, `Trust Bundle: infineon-optiga-trust-m-express-ca306-roots/1` and `Revocation Status: not_evaluated` (revocation was not checked locally; not a claim that the certificate is unrevoked). `--json` prints one object with `artifact`, `authority` (`local_preflight_only`), `byteLength` and `stage`, plus `evidenceSchema`, `profile`, `protocol`, `revocationStatus` and `trustBundle` on `finalize`. No artifact bytes, path, DID, address, evidence hash or chip ref is printed.

A successful `finalize` is local preflight, not a submission and not a verified machine. peaq's onboarding service submits the evidence, the Verify API revalidates it and consumes the challenge, and `chip` reads `verified` once peaq records the chip attestation; read the result with `peaqos verify status`. The chip challenge and evidence API routes take peaq's onboarding service token and are not for operators to call.

| Exit | When |
| :-- | :-- |
| `0` | Artifact written |
| `1` | Invalid input file, rejected certificate or signature, expired challenge, or `--out` cannot be created (`Chip <stage> failed because <reason>.`, see troubleshooting) |
| `2` | `Chip <stage> could not be completed.` (unexpected failure) or `Chip <stage> was canceled; retry when ready.` |
| `3` | `Install a peaq-os-sdk package with public Verify read support.` (SDK without the preflight functions) |

---

## Environment variables

All commands read from `.env` in the working directory (loaded automatically) or from shell env vars.

| Variable | Required | Purpose |
|----------|----------|---------|
| `PEAQOS_PRIVATE_KEY` | Writes and qualify/show reads without OWS | Signer private key (0x-prefixed hex); monetize writes also require this key |
| `PEAQOS_OWS_WALLET` | Yes (write commands, if not using raw key) | OWS wallet name: alternative to `PEAQOS_PRIVATE_KEY` |
| `OWS_PASSPHRASE` | No | Vault passphrase for OWS wallets; prompted interactively if absent |
| `PEAQOS_NETWORK` | Init defaults | `mainnet` or `testnet` |
| `PEAQOS_RPC_URL` | Yes for chain commands | peaq RPC endpoint |
| `PEAQOS_GAS_STATION_URL` | No | Gas station URL (not needed with `--skip-funding`) |
| `PEAQOS_MCR_API_URL` | No | Read by `qualify mcr` and `show` only when `TOKENOMICS_DEPLOYMENT_ID` is unset, and those address-DID reads are no longer served; with the deployment ID set, reads resolve the host from the deployment (`mcr.peaq.xyz` on `peaq-mainnet`) |
| `PEAQOS_VERIFY_API_URL` | `peaqos verify status` | HTTPS origin of the Verify API, `https://mcr.peaq.xyz`; no default. Root `--verify-api-url` overrides it |
| `TOKENOMICS_DEPLOYMENT_ID` | activate, machine, monetize | `peaq-mainnet` or `agung-2026-08-28` |
| `PEAQOS_SVM_NETWORK` | Solana | `mainnet-beta` for onboarding |
| `PEAQOS_SVM_RPC_URL` | Solana | Separate Solana RPC endpoint |
| `PEAQOS_ORCHESTRATION_URL` | Yes (Scale commands) | Base URL of the Machine Markets API |
| `PEAQOS_ORCH_API_KEY` | No (Scale commands) | Platform API key for orchestration: optional, only required if deployment enforces API key auth |
| `PEAQOS_S3_ACCESS_KEY_ID` | No (`stream publish --s3` / `stream distribute`) | S3 credentials; the standard boto3 chain works too |
| `PEAQOS_S3_SECRET_ACCESS_KEY` | No | Paired with the above |
| `PEAQOS_S3_REGION` | No | Default S3 region for stream uploads (overridden by `--s3-region`) |
| `PEAQOS_S3_ENDPOINT` | No | Default custom S3-compatible endpoint URL (overridden by `--s3-endpoint`) |
| `PEAQOS_ORDER_STEP_DELAY_SEC` | No | Seconds to pause between `scale order` placement steps (unset = no delay) |
| `IDENTITY_REGISTRY_ADDRESS` | Yes | IdentityRegistry contract |
| `IDENTITY_STAKING_ADDRESS` | Yes | IdentityStaking contract |
| `EVENT_REGISTRY_ADDRESS` | Yes | EventRegistry contract |
| `MACHINE_NFT_ADDRESS` | Yes | MachineNFT contract |
| `DID_REGISTRY_ADDRESS` | Yes | DID precompile (usually `0x0000...0800`) |
| `BATCH_PRECOMPILE_ADDRESS` | Yes | Batch precompile (usually `0x0000...0805`) |

---

## Exit codes

| Code | Meaning | Common causes |
|------|---------|---------------|
| 0 | Success |: |
| 1 | User / validation error | Bad flag values, invalid DID, missing `--source-tx` with onchain trust |
| 2 | Network / RPC / on-chain error | Connection failure, tx revert, API 404/503 |
| 3 | Config error | Missing env var, invalid private key |
