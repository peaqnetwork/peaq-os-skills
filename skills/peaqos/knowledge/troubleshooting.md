# Troubleshooting

Symptom → cause → fix. Organized by phase.
When diagnosing, check exit code first: 1=input, 2=network/chain, 3=config.

---

## Phase: Init / Config (exit 3)

**Symptom:** `Error: Missing env var PEAQOS_PRIVATE_KEY` (or any required var)
**Cause:** `.env` not found, not in working directory, or variable missing from it.
**Fix:** Run `peaqos init` to regenerate `.env`, or `export PEAQOS_PRIVATE_KEY=0x...` in shell.

**Symptom:** `Error: invalid private key` / exit 3
**Cause:** `PEAQOS_PRIVATE_KEY` value is wrong length, not hex, or missing `0x` prefix.
**Fix:** Verify the key is exactly 64 hex characters with `0x` prefix (66 chars total).
Generate fresh: `peaqos init` → choose "generate".

**Symptom:** `peaqos whoami` shows wrong contract addresses
**Cause:** Env vars set for wrong network, or stale `.env` from a previous run.
**Fix:** Check `PEAQOS_NETWORK` matches your intent. Re-run `peaqos init` to regenerate.

**Symptom:** `Missing required env var: EVENT_REGISTRY_ADDRESS`, exit 3 after init.
**Cause:** The wizard left the variable empty: CLI 0.0.9 has no default on any network, and no version has an agung default (a mainnet init on 0.0.10 to 0.0.12 run offline also leaves it empty). Every command building an SDK client then fails.
**Fix:** Fill it and verify all six addresses using `GUIDE.md#network-reference`. Mainnet 2.0: `0xA1e7F1d7B24dAb55Dc92491e6d9B89F6E925Ad1e`; mainnet 1.0: `0x43c6AF2E14dc1327dc3cc6c7117D1CD72fffEcbA`; agung: `0x2DAD8905380993940e340C5cE6d313d5c2780040`. Confirm `TOKENOMICS_DEPLOYMENT_ID` in `whoami`'s `Tokenomics 2.0:` block.

**Symptom:** A 2.0 machine's events land in the 1.0 EventRegistry after a mainnet `peaqos init`.
**Cause:** CLI 0.0.10 to 0.0.12 prefill the mainnet network default, which is the 1.0 registry `0x43c6AF2E14dc1327dc3cc6c7117D1CD72fffEcbA`. CLI 0.0.13 or newer writes the 2.0 registry `0xA1e7F1d7B24dAb55Dc92491e6d9B89F6E925Ad1e` instead, unless `EVENT_REGISTRY_ADDRESS` is already in the environment. The CLI loads an existing `.env` into the environment before init runs, so a stale 1.0 value in `.env` survives an upgrade and rerun, the same as a shell export.
**Fix:** Edit `.env` to `EVENT_REGISTRY_ADDRESS=0xA1e7F1d7B24dAb55Dc92491e6d9B89F6E925Ad1e`. Or remove the line from `.env`, unset any shell export, and rerun init on CLI 0.0.13 or newer (`pip install -U peaq-os-cli`).

**Symptom:** `peaqos whoami` shows `Chain ID: 3338` but you expect testnet
**Cause:** `PEAQOS_RPC_URL` points at a mainnet endpoint; `PEAQOS_NETWORK` is only a label, the chain ID comes from the RPC.
**Fix:** Set the agung RPC, `TOKENOMICS_DEPLOYMENT_ID=agung-2026-08-28` and the agung legacy addresses in `.env` (or rerun `peaqos init` for testnet), then `whoami` again.

**Symptom:** `Your peaq_os_sdk does not support OWS wallet commands` or similar (exit 3)
**Cause:** OWS wallet support not installed.
**Fix:** `pip install "peaq-os-sdk[ows]"` then retry.

**Symptom:** `Wallet '<name>' not found in vault` (exit 3)
**Cause:** Wallet name doesn't exist in `~/.ows/`, or the wrong vault passphrase was entered.
**Fix:** Run `peaqos wallet list` to see available wallets. Verify the name and passphrase are correct.

**Symptom:** Commands using `PEAQOS_OWS_WALLET` succeed but prompt for passphrase on every call
**Cause:** `OWS_PASSPHRASE` is not set in the environment.
**Fix:** Add `export OWS_PASSPHRASE="your-passphrase"` to your shell profile, or set it in `.env`. Note: storing the passphrase in `.env` reduces the security benefit of OWS: prefer exporting it in your shell session.

---

## Phase: Funding / Balance

**Symptom:** `peaqos activate` reports an insufficient balance
**Cause (testnet):** Wallet not yet funded. Gas station is not available on agung testnet.
**Fix:** Fund via web faucet: https://docs.peaq.xyz/peaqchain/build/getting-started/get-test-tokens
Then re-run the full `peaqos activate` command (same identity flags, tier and DID document) with `--skip-funding` added.

**Cause (mainnet):** The paying wallet has no PEAQ. In self-owned mode that is the configured signer shown by `peaqos whoami`; in machine-owned mode (`--for` + `--machine-key`) it is the machine wallet, and funding the operator does nothing for the activation.
**Fix:** Transfer PEAQ to the wallet that pays: the `INSUFFICIENT_PEAQ` message names the amount short. Gas Station (`https://depinstation.peaq.xyz`) can fund a fresh machine wallet with gas after 2FA.

**Symptom:** 2FA enrollment fails / QR code doesn't appear
**Cause:** Gas station unreachable, or `PEAQOS_GAS_STATION_URL` is blank.
**Fix (testnet):** Don't use gas station on agung. Fund via faucet + `--skip-funding`.
**Fix (mainnet):** Confirm `PEAQOS_GAS_STATION_URL=https://depinstation.peaq.xyz` in `.env`.

**Symptom:** TOTP code rejected (`INVALID_2FA`)
**Cause:** The code was wrong or entered after the 30-second TOTP window.
**Fix:** The CLI exits on `INVALID_2FA`; rerun the command and enter the next code immediately. Only the expired codes (`TOTP_EXPIRED`, `TWO_FA_EXPIRED`, `2FA_EXPIRED`) get an automatic re-prompt.

---

## Phase: Activation and machine management

Read exit status and `error_code` together. Exit 0 is success or preview; 1 is user/input, 2 network/chain, 3 config. Input/flag errors before validation completes can be plain errors with no JSON report. `--json` never grants consent.

| Code / symptom | Exit | Action |
|---------------|------|--------|
| `INVALID_INPUT`, `INVALID_TIER` | 1 | Check canonical decimal IDs, required flags, matching machine key/address and DID schema. EVM tiers are entry/basic/pro. |
| `CANCELLED_BEFORE_SUBMIT` | 1 | No consent was given. Stop; do not bypass the prompt. |
| `ORACLE_UNPRICED` | 2 | Contracts are reachable but have no committed PEAQ price. Wait for the oracle; do not invent a bond amount. |
| `INSUFFICIENT_PEAQ` | 2 | Fund the actual payer for the net bond plus gas. In machine-owned mode this is the machine wallet. |
| `QUOTE_MOVED` | 2 | Preview again and review the changed quote and accepted payment bounds before authorizing a write. |
| `TX_REVERTED`, `EVENT_MISMATCH`, `ALREADY_ACTIVATED_RACE` | 2 | Inspect receipt and chain state with `machine status`; retain journal evidence before any retry. |
| `PENDING` | 2 | The transaction may still mine. Rerun the same command in the same directory to reconcile `peaqos.log`, never resubmit or delete the journal. An unreceipted hash blocks resubmission regardless of age. |
| `TOKENOMICS_NOT_CONFIGURED` | 3 | Set `TOKENOMICS_DEPLOYMENT_ID`. |
| `DEPLOYMENT_UNKNOWN` | 3 | Use `peaq-mainnet` or `agung-2026-08-28`. |
| `CHAIN_MISMATCH` | 3 | Match the RPC chain to the deployment. |
| `ADDRESSES_UNSET` | 3 | The network is supported but required contracts are not deployed there. Use a supported deployment. |
| `PEER_MISMATCH` on `peaq-mainnet` | 3 | SDK older than 0.7.1 has stale peer addresses. Run `pip install -U peaq-os-sdk`. |
| `RPC_FAILED` with `MachineSubscription.fullMode() could not be read` (the SDK's own code is `READ_FAILED`) | 2 | SDK 0.7.1 and older read `fullMode()`, which mainnet replaced with `isEconomicAuthority()` on 2026-09-15 (CORE-777). The RPC is fine. Run `pip install -U peaq-os-cli peaq-os-sdk` (CLI 0.0.10 with SDK 0.8.0 reads `isEconomicAuthority()` and never shows this message); agung is not upgraded and still activates on 0.7.x. |
| `NOT_ECONOMIC_AUTHORITY` (SDK code; CLI 0.0.9 has no row for it and reports `ACTIVATION_FAILED` at exit 2, CLI 0.0.10 maps it to exit 3 with `TOKENOMICS_DEPLOYMENT_ID` guidance) | 2 or 3 | The selected deployment's `MachineSubscription` is not the economic authority, so it cannot activate or fund a subscription. Use a peaq deployment (`peaq-mainnet`, `agung-2026-08-28`); changing the RPC does not help. Replaces `NOT_FULL_MODE`, which no longer occurs. |
| `TECHNICALLY_PAUSED` | 2 | A protocol technical pause (global or for this machine) blocks activation and renewal; on a Solana onboarding it means the suite's upgrade lock is set, either as a refusal before signing or on a transaction that landed and failed (check `phases[]` and the references before saying nothing was spent); rerun once `--dry-run` shows the lock released. The SDK reads both flags before its first approval; a pause that starts after an approval confirmed (renewal, USDT activation) still ends here, with the approval gas spent and the allowance left in place. Read the reported transactions before saying nothing was spent. Wait for the pause to clear, then preview again. Same code and exit on `activate` and `machine subscription renew`. |
| `SUBSCRIPTION_NOT_ELIGIBLE` | 1 | Event submission for a Solana-homed machine: the `SubscriptionTerminal` account is absent or not Active/Grace, so the event is refused before any write (CLI 0.0.10, reader `terminal`). Inspect with `peaqos machine status <decimal-id> --json`: an active peaq subscription with an absent terminal is waiting for the node's status commit, wait and retry; an inactive one needs renewal, or an unfinished onboarding resumed (Phase 11). |

Machine writes reconcile the recorded action before previewing or submitting. Do not treat uncertain receipts as permission for a replacement. EVM activation is one atomic transaction; confirm it with `peaqos machine status <decimal-id> --json`.

---

## Phase: Event Submission (exit 1 or 2)

**Symptom:** Exit 1: `--source-tx is required when --trust is 'onchain'`
**Cause:** `--trust onchain` used without providing `--source-tx`.
**Fix:** Add `--source-tx 0x<64-hex-chars>` pointing to the source chain transaction.

**Symptom:** Exit 1: `--value must be greater than or equal to 0`
**Cause:** Negative value passed.
**Fix:** `--value` must be a non-negative integer in ISO 4217 subunits.

**Symptom:** Exit 1: `--ts` parse error
**Cause:** Timestamp format not recognized.
**Fix:** Use Unix seconds (digits only) or ISO 8601 with explicit timezone: `2026-04-22T12:00:00Z`.

**Symptom:** Exit 2: `FutureTimestamp` revert
**Cause:** `--ts` is ahead of the network's block timestamp.
**Fix:** Use a timestamp at or before now. `date +%s` gives current Unix time.

**Symptom:** Event rejected after 2.0 activation.
**Fix:** Confirm activation with `machine status`, then check `EVENT_REGISTRY_ADDRESS`: 2.0 machines write to `0xA1e7F1d7B24dAb55Dc92491e6d9B89F6E925Ad1e` on mainnet, 1.0 machines to `0x43c6AF2E14dc1327dc3cc6c7117D1CD72fffEcbA`; both accept the call, so a write to the wrong one lands there without an error. The signer must be the machine's owner or operator. Preserve the actual error; do not infer that activation failed.

**Symptom:** Exit 1: rate limit reached for machine (`RateLimitExceeded` in an SDK integration)
**Cause:** The SDK's local operational limits (`rate_limit_max_events` / `rate_limit_window_seconds` on the client config) are set; they are 0 (off) by default and the CLI does not set them, so this comes from a custom SDK configuration, not from the chain.
**Fix:** Wait for the window or raise the limit in that configuration.

**Symptom:** Exit 1: event value exceeds configured cap (`ValueCapExceeded` in an SDK integration)
**Cause:** The SDK's local `max_value_per_tx` limit is set in that integration's client config; it is 0 (off) by default and the CLI does not set it. It is not an on-chain cap.
**Fix:** Check the value is in ISO 4217 subunits (`1000` = $10.00) and raise or remove the local limit in the SDK configuration.

---

## Phase: MCR Query

| Symptom | Exit | Action |
|---------|------|--------|
| DID rejected for deployment mode | 1 | With `TOKENOMICS_DEPLOYMENT_ID`, use `did:peaq:<decimal machine id>` (reads go to the host in the installed SDK's deployment record: `mcr.peaq.xyz` with `peaq-os-sdk` 0.10.0 or newer, `mcr-20.peaq.xyz` with 0.7.0 to 0.9.0, which serves the same Tokenomics 2.0 API). Without it the CLI expects `did:peaq:0x<address>` and reads the host in `PEAQOS_MCR_API_URL`, but address-DID reads are no longer served: set the variable and use the decimal DID. `show operator machines` always takes an address DID. |
| Missing private key or legacy address | 3 | On CLI 0.0.9 `qualify mcr` and `show` build the full SDK client: supply `PEAQOS_PRIVATE_KEY` or `PEAQOS_OWS_WALLET` plus all six legacy addresses in `.env`. The Solana release reads MCR over HTTP only and never raises this for these commands. |
| `CONFIG_ERROR` (`The SDK rejected the selected MCR deployment`) on `agung-2026-08-28` | 3 | Agung has no paired MCR, so `qualify mcr`, `show` and `monetize status` cannot run there and no config change fixes it. Use `machine status <decimal-id> --json` for chain state; MCR reads run on `peaq-mainnet`. |
| `SERVICE_UNAVAILABLE` | 2 | MCR or its operator index is unavailable or syncing. Retry later. `show machine` also reads MCR; use `machine status <decimal-id> --json` for independent chain state. |
| Machine not found | 2 | Confirm ID and deployment, then inspect chain state. An indexer delay is possible but is not proof of a successful activation. |
| Score is 0 or Provisioned | 0 | Inspect submitted event receipts and allow indexing time. Do not promise a score change or exact indexing delay. |
| Rounded ID from `show machine --json` | 0 | CLI 0.0.9 serializes this field as a number. Read `did` or use a big-integer-aware parser. `machine status --json` uses decimal strings. |

`FX Degraded: yes` means the rating used degraded FX data. It is not a transaction failure.

---

## Phase: Solana onboarding

A refusal before signing says so (`Nothing was signed`). For anything that stopped mid-run, the first move is the same: rerun the exact command in the same directory, with the same inputs and `peaqos.log`. It resumes and never resends a recorded transaction.

| Observation | Action |
|-------------|--------|
| `activate --help` lacks `--max-in` | CLI older than 0.0.15, which implements the removed reservation flow. Stop this path; tell the user to run `pip install -U 'peaq-os-cli[solana,ows]'`. |
| `OPTION_NOT_FOR_CHAIN` (exit 1) | An option of the removed reservation flow (`--payment`, `--max-net-peaq-amount`, `--max-usdt-amount`). Use the replacement the message names: `--pay-in`, `--max-in`. |
| `PENDING` (exit 2) naming `credit`, `bond` or `link_application` | The wait budget ran out. The wait sends nothing, but earlier stages of the same run may have escrowed or settled the bond: read `phases[]` before reporting spending. Rerun; it keeps waiting. Measured waits are minutes (credit up to about 2, bond up to about 5, link delivery up to about 4). Nothing moving after 30 minutes: the node may be down, post the `machine_id` in the [peaq Discord](https://discord.gg/UKTFkPWsyH). |
| `PENDING` right after a send, or a write unconfirmed for minutes | The receipt is not visible yet, or the write was dropped (most likely at priority price `0`). Rerun once; it reconciles the journaled signature and never resends. |
| `CANCELLED` (exit 1) | Ctrl-C with no transaction outcome outstanding. Ctrl-C after a journaled write ends `PENDING` (exit 2) instead. Rerun to continue either way. |
| `REQUEST_EXPIRED` (exit 2) | The node did not commit the credit within the request's window. Nothing was settled. Run the cancel command the message prints (`--phase cancel_request`, owner wallet, with the user's yes) to reclaim the escrow, then rerun: it opens a new request. |
| `COMMIT_EXPIRED` (exit 2) | The commit expired before settlement. Nothing was settled. Cancel, then rerun. |
| `ACTIVATION_REFUNDED` (exit 2) | peaq refused the bond after settlement; the Trust Validator returned it in PEAQ to the owner's PEAQ token account (reason and amount in the message). Rerun: it opens a new request. |
| `ESCROW_BELOW_BOND` (exit 1) | `--max-in` is below the bond on PEAQ. Take the preview's suggested `--max-in`. |
| `INSUFFICIENT_BALANCE` (exit 2) | The owner's pay-in token account holds less than `--max-in`, or does not exist. Fund it on Solana. |
| `INSUFFICIENT_SOL` (exit 2) | The owner cannot pay the write's rent and fee and keep its 650,240-lamport rent-exempt minimum. Fund the owner in SOL. |
| `FEE_LIMIT_EXCEEDED` (exit 2) | A quoted fee is above its ceiling. Network fee: lower `--compute-unit-price-micro-lamports`. LayerZero fee (LayerZero route only): raise `--max-link-push-fee-lamports`. |
| `RENT_LIMIT_EXCEEDED` (exit 2) | A write's rent is above `--max-native-rent-lamports`. That ceiling is a fingerprinted input, so changing it mid-onboarding describes a different onboarding; set it before the first request (the guide's 6,000,000 covered the proven runs). |
| `FINALISE_TABLE_MISSING`, `FINALISE_TABLE_STALE` (exit 3) | USDC only: no usable lookup table for the swap. Before a request opens, pay in PEAQ. An open USDC request keeps its rail whatever `--pay-in` says: wait for the table, or cancel it (`--phase cancel_request`, owner wallet, the user's yes), then preview again with `--pay-in PEAQ` for a new `--max-in`. |
| `TECHNICALLY_PAUSED` (exit 2) | The suite is mid-upgrade. Either refused before signing or a landed, failed transaction: check `phases[]`. Rerun once the preview shows `upgrade lock released`. |
| `TV_OUTBOX_MISSING`, `TV_INBOUND_REFUSED` (exit 2) | The link push's route to the node is not set up. A deployment problem, not the user's; post the code and `machine_id` in the peaq Discord. |
| `EVM_OPERATOR_MISMATCH` (exit 1) | `--evm-operator` is not the operator wallet's address. Drop the flag. |
| `OPERATOR_BOUND_ELSEWHERE` (exit 2) | The owner wallet is registered to another peaq operator. Use that operator wallet, or a new owner wallet. |
| `STATE_MISMATCH` with `Select the accepted phase's wallet` | Wrong wallet for the stage; nothing was submitted. Registration takes the operator wallet, every Solana write the owner wallet. |
| `RPC_RATE_LIMITED`, `RPC_FAILED` naming `-32016` (exit 2) | An endpoint kept answering 429, or a lagging Solana server, after the SDK's retries. The failed read signs nothing, but earlier stages of the run may have: check `phases[]`. Rerun, or switch to a provider endpoint. |
| `ADDRESSES_UNSET` with `sdk_code` `DEPLOYMENT_UNAVAILABLE` (exit 3) | The installed SDK's deployment record does not match the deployed programs. Upgrade with `pip install -U 'peaq-os-cli[solana,ows]'`; keep `TOKENOMICS_DEPLOYMENT_ID=peaq-mainnet` (the generic message suggests unsetting it, which does not apply to Solana). |
| Changed input, signer or account conflict | Restore the original argument set and DID document. Never bypass conflicts by erasing the journal. |
| `machine history` names an unread source (exit 2) | The rows shown are exact; a read timed out. Rerun it. |
| `MACHINE_HOMED_ELSEWHERE` | For a supported Solana home, configure both SVM settings for the ID-only status fallback. During a Verify read, configure nothing: treat the machine as Solana-homed per Phase 12. |
| Status says observed/present | `machine status <id> --json` is a wallet-free, journal-free current observation. Inspect `native_current_state`, or the `link` block with `--chain solana`; `present` alone does not prove the link is complete. |

Exit codes: `1` input or consent, `2` chain, read or transaction failure (and `PENDING`), `3` configuration or missing dependency. With `--json` read `error_code` and `phases[]`, not only the exit code.

---

## Phase: Verify

Verify is experimental. Read the exact message and exit code; the CLI prints fixed messages and never the API's own text.

**Symptom:** `peaqos verify --help` fails / `No such command 'verify'`
**Cause:** The installed CLI has no Verify commands.
**Fix:** Verify needs peaq-os-cli 0.0.14 or newer. Offer `pip install -U 'peaq-os-cli>=0.0.14'` and run it only after the user agrees, then check `peaqos verify --help` again. If it still fails, stop: the installed CLI still has no Verify commands. Do not install from a source branch or a test index.

| Message | Exit | Action |
|---------|------|--------|
| `Set PEAQOS_VERIFY_API_URL to a valid HTTPS origin.` | 3 | Set `PEAQOS_VERIFY_API_URL=https://mcr.peaq.xyz` in `.env` or the shell, or pass `--verify-api-url https://mcr.peaq.xyz` before the command name. An empty `--verify-api-url` wins over the variable and fails the same way. `http://` is rejected. |
| `Install a peaq-os-sdk package with public Verify read support.` | 3 | The SDK under the CLI lacks `peaq_os_sdk.verify`. After the user agrees, run `pip install -U 'peaq-os-cli>=0.0.14'` to install the compatible SDK dependency, then check `peaqos verify --help` again. |
| `MACHINE_ID must be a canonical decimal integer in 1..2^256-1 (no leading zeros).` | 1 | Pass the decimal machine ID, not a DID, address, hex or zero-padded value. |
| `Machine not found in the Verify service.` | 2 | API `404 MACHINE_NOT_FOUND`. It only means the Verify service has no machine with that ID and never means `unverified`. Ask the user to check the ID first. This release covers peaq mainnet Verify only: for an agung testnet machine this answer is expected, not a wrong ID. If the ID is right and the machine is not on agung, check it with `peaqos machine status <decimal-id> --json`. |
| `Verify state is temporarily unavailable; retry later.` | 2 | API `503 VERIFY_READ_UNAVAILABLE` or `INTERNAL_ERROR`. For a Solana-homed machine this is permanent on mainnet: Verify reads are EVM-only, do not retry. Count a machine as Solana-homed when `machine status --json` fails with `error_code` `MACHINE_HOMED_ELSEWHERE` and a message naming solana (the normal result with a peaq-only configuration, exit 2), when `native_current_state.status` is `present`, or when the user confirms it; `status: "observed"` alone does not prove it. If `machine status` cannot run, ask the user for the home chain. For a peaq-homed machine it can be transient; the CLI does not retry, so run the command once more after a short pause. |
| `Verify API rate limit reached; retry later.` | 2 | API `429 RATE_LIMITED`: the read route allows 60 requests per minute per IP address, and v1 sends no `Retry-After`, so wait about a minute before the next read. When the API sends a delay of 1 to 60 seconds the message adds `Retry after N seconds.` |
| `Verify status could not be read.` | 2 | Any other API error, for example `VERIFY_ROUTE_NOT_FOUND` when the origin has no Verify route. Check the origin is `https://mcr.peaq.xyz`. |
| `Verify API returned an invalid response; do not treat it as verification state.` | 2 | The response failed the SDK's checks. Report nothing about the machine's state from it. |
| `Verify status request timed out; retry later.` / `Verify API could not be reached; check your connection and retry.` | 2 | Network problem; check connectivity and the origin. |

**Chip preflight (`peaqos verify chip`).** Rejections exit 1 and read `Chip <stage> failed because <reason>.`:

| Reason in the message | Action |
|-----------------------|--------|
| `the challenge is outside its freshness window. Request a new challenge and retry.` | The challenge expired, or the local clock is behind the server's so that `expiresAt` is more than 300 seconds ahead of it. Sync the clock (NTP), get a new `context.json` from peaq's onboarding service, and start again from `prepare` in a new directory (new prehash, new signatures). |
| `the supplied certificate is not a valid chip leaf` / `does not chain to a trusted chip root` / `is not a supported chip profile` | Only an Infineon OPTIGA Trust M Express leaf under the CA306 chain works. Re-read the raw DER from object `0xE0E0`; another chip cannot be used. |
| `the supplied chip signature is not well formed` | Pass the chip's native signature from `0xE0F0` as raw bytes: `r` and `s` as two DER integers with no `SEQUENCE` header, at most 80 bytes. `trustm_ecc_sign -o` adds a 2-byte header; strip it with `tail -c +3 chip-signature.der > chip-signature.bin`. |
| `the supplied chip signature does not match this attempt` | The chip signed something other than this `prehash.bin`, or the prehash was hashed again. Sign the exact file with ECDSA without hashing. |
| `the supplied controller signature does not match this attempt` | Check the last byte first: `xxd -s 64 -p controller-signature.bin` must print `1b` or `1c`. A signature ending in `00` or `01` (the 0/1 recovery convention) is rejected, not normalized: change that byte to `1b` or `1c` and rerun `finalize`. A high-s signature is rejected too; sign again with a standard EIP-191 signer. Otherwise: wrong signer, or extra prefix/hashing. The DID controller named in `context.json` signs `controller-message.bin` once as an EIP-191 personal message. If the controller changed since the challenge was issued, request a new challenge. |
| `the supplied certificate or signature could not be verified` / `the supplied preflight material is not valid` | Check that every file belongs to this attempt: the same `context.json`, the leaf from this chip, and signatures made over this run's `prehash.bin` and `controller-message.bin`. |
| `the evidence document does not match its schema` / `exceeds its size limit` / `a derived evidence value was zero` / `could not be canonicalized` / `the canonical evidence could not be produced` | Rerun `finalize` with the same files; if it repeats, report it to peaq with the stage name. |

File checks also exit 1 and name only the flag: `--context must be a readable regular file of at most 4096 bytes.` (same form for `--certificate` 1300, `--chip-signature` 80, `--controller-signature` exactly 65), `--context must be UTF-8 JSON without a byte-order mark.`, `--context must be one JSON object holding exactly chainId, didController, expiresAt, machineDid, machineId and nonce as strings.` (the raw challenge response has three more fields; strip it with `jq '{chainId, didController, expiresAt, machineDid, machineId, nonce}'`), `--context must name a machine whose DID, identifier, chain and controller the SDK accepts together.` (the context does not describe one consistent EVM machine), and `--out must be a path that does not exist yet and can be created as a new file.` (pick a new path; there is no overwrite). A controller signature saved as hex fails the 65-byte check: convert it to raw bytes first. `Chip <stage> could not be completed.` is exit 2: rerun once, then report it.

---

## General

**Symptom:** Command hangs indefinitely
**Cause:** RPC endpoint unreachable or very slow.
**Fix:** Check `PEAQOS_RPC_URL` is correct. Try `curl -s <rpc-url>` to verify connectivity.
Use `-v` / `--verbose` to see what the CLI is waiting on.

**Symptom:** `peaqos` command not found
**Cause:** CLI not installed, or virtual environment not activated.
**Fix:**
```bash
source .peaqos-env/bin/activate   # if using venv
pip install peaq-os-cli           # if not installed
```

**Symptom:** `pip install peaq-os-cli` fails with `metadata-generation-failed`, mentioning `pycairo`, `meson.build`, `Dependency lookup for cairo`, or `pkg-config` not found
**Cause:** You're installing an older version (≤ 0.0.3) which pulled in `svglib` → `pycairo`. The Cairo dependency was removed in 0.0.4.
**Fix:** Upgrade to the current release:
```bash
pip install --upgrade peaq-os-cli
```
If you must use ≤ 0.0.3 for some reason, install Cairo + pkg-config first: `brew install cairo pkg-config` on macOS, `sudo apt-get install -y libcairo2-dev pkg-config` on Ubuntu/Debian.

**Symptom:** Activation was interrupted after submission.
**Fix:** Preserve `peaqos.log` and rerun the exact original command to reconcile the recorded transaction. Never submit a replacement because the receipt is uncertain.

---

## Phase: Scale / Machine Market (exit 3)

**Symptom:** Exit 3: `PEAQOS_ORCHESTRATION_URL is not configured`
**Cause:** `PEAQOS_ORCHESTRATION_URL` env var is missing from `.env` or shell.
**Fix:** Add `PEAQOS_ORCHESTRATION_URL=<url>` to your `.env` file. The URL is provided by your platform admin or the peaqOS team.

**Symptom:** `AUTH_REQUIRED` error on any Scale command
**Cause:** The Market deployment you are connecting to requires a platform API key, but `PEAQOS_ORCH_API_KEY` is not set.
**Fix:** Add `PEAQOS_ORCH_API_KEY=<key>` to your `.env` file. Obtain the key from your platform admin or the peaqOS team. Note: many deployments do not require this key: only set it if you see this error.

---

## Phase: Scale: Machine Onboard (exit 1 or 2)

**Symptom:** Exit 1: `Signer <address> is not a DID controller for this identity`
**Cause:** The key used to sign the identity challenge does not match any controller address registered for the DID.
**Fix:** Use `--identity-key-file` with the correct DID controller key, not a machine key or a different operator key. Verify the DID's controller addresses with `peaqos show machine <did>`.

**Symptom:** Exit 1: `--identity-signature-file and --identity-key-file are mutually exclusive`
**Cause:** Both signing flags were passed.
**Fix:** Use one or the other: `--identity-key-file` for automatic signing, `--identity-signature-file` for a pre-computed signature.

**Symptom:** Exit 2: `MACHINE_IDENTITY_EXISTS`
**Cause:** The machine has already been registered in the Market.
**Fix:** Run `peaqos scale machine status <machine-id>` to check the existing registration. If status is `draft`, update rather than re-onboard.

---

## Phase: Scale: Agent Pairing (exit 1 or 2)

**Symptom:** Exit 1: `--agent-signature-file is required in --json mode`
**Cause:** `--json` flag used without providing a pre-signed signature file.
**Fix:** Either remove `--json` (interactive mode will prompt for the signature), or pass `--agent-signature-file ./agent.sig`.

**Symptom:** Exit 2: the pairing proof is rejected (for `scale machine onboard` the code is `MACHINE_IDENTITY_PROOF_INVALID`)
**Cause:** The EIP-191 signature provided by the agent does not match the challenge message.
**Fix:** Ensure the agent signed the exact challenge message string (including whitespace). The message is displayed during the pairing flow: relay it to the agent exactly as shown.

**Symptom:** Pairing token lost / not saved
**Cause:** The token was displayed once and the window was closed or cleared.
**Fix:** The token cannot be recovered. Revoke the existing pairing and create a new one:
```bash
# List pairings to find the pairing ID
peaqos scale machine list

# Create a fresh pairing
peaqos scale agent pair --machine-id <id> ...
```

---

## Phase: Scale: Search (exit 1 or 2)

**Symptom:** Exit 1: `Could not read provider credentials file`
**Cause:** `--provider-credentials` path does not exist or is not readable.
**Fix:** Check the file path. Credentials file must be a valid JSON object.

**Symptom:** Exit 2: `AGENT_AUTH_INVALID` / `pairing token invalid` (`AUTH_REQUIRED` means the platform API key is missing, not the pairing token)
**Cause:** The pairing token in `--pairing-token-file` is expired, revoked, or for a different machine.
**Fix:** Verify the token file contains the correct token for this machine. If expired, create a fresh pairing:
```bash
peaqos scale agent pair --machine-id <id> ...
```
The CLI has no session-refresh subcommand; re-running `agent pair` is the CLI path. From code, rotate the session with `client.orchestration.createAgentPairingSession(...)` (JS) or `create_agent_pairing_session` (Python), signing a fresh challenge.

**Symptom:** `peaqos scale` returns `Error: No such command 'scale'` or similar
**Cause:** The installed `peaq-os-cli` predates the Scale command group.
**Fix:** Upgrade the CLI:
```bash
pip install --upgrade peaq-os-cli
peaqos scale --help   # confirm the group is registered
```
If you installed from source, pull the latest and reinstall with `pip install -e .` from the CLI repo root.

**Symptom:** No quotes returned despite valid search
**Cause:** No providers match the service type, capabilities, or budget.
**Fix:** Broaden the search: remove `--native-only`, increase `--budget-max`, try a different `--service-type`, or remove `--capabilities` filters.

---

## Phase: Scale: Orders and Payment (exit 2)

**Symptom:** Exit 2: `QUOTE_EXPIRED`
**Cause:** Too much time elapsed between search and order placement. Quotes have a short TTL.
**Fix:** Re-run `peaqos scale search` to get fresh quotes, then place the order immediately.

**Symptom:** Exit 2: `PAYMENT_RPC_ERROR` / `PAYMENT_TRANSFER_NOT_FOUND`
**Cause:** The payment transaction was submitted but could not be verified on-chain (RPC lag or wrong chain).
**Fix:** Check `PEAQOS_RPC_URL` is correct and reachable. If the tx was mined, keep the order ID and tx hash: `scale order create` always creates a new order, also with `--skip-payment` and `--payment-tx-hash`, so rerunning it opens a second order instead of repairing the first. Attach the proof to the existing order through the platform (orchestration API or its operator), then check `scale order status`.

**Symptom:** Order created but execution failed: status stuck at `active`
**Cause:** The order was created and paid for but the execute step failed.
**Fix:** Check `peaqos scale order status <order-id>`. If the order is still active, execution can be retried. If the service is unavailable, dispute the order.

**Symptom:** Exit 2: `ORDER_CLOSED`
**Cause:** Attempted to execute, confirm, or dispute an order that is already in a terminal state.
**Fix:** Check the current status with `peaqos scale order status <order-id>`. Terminal states: `closed`, `cancelled`, `disputed`.

---

## Phase: Stream (exit 1, 2, or 3)

**Symptom:** `peaqos stream --help` fails / `No such command 'stream'`
**Cause:** The installed CLI is missing a command group included in CLI 0.0.9.
**Fix:** `pip install --upgrade peaq-os-cli`, then `peaqos --version` to confirm.

**Symptom:** Exit 2 on `stream grant` or `stream distribute`: key-commitment mismatch
**Cause:** Wrong owner X25519 private key: it doesn't match the owner public key used at publish time. The most common Stream failure.
**Fix:** Use the exact owner key file from `stream publish`. There is no recovery with a different key.

**Symptom:** `stream consume`: `Decryption failed for chunk N: access not granted for this buyer private key`
**Cause:** The buyer's private key doesn't match the public key the seller granted to.
**Fix:** Confirm the buyer gave the seller the right public key, and is using the matching private key file.

**Symptom:** `stream consume`: `No buyer access for chunk N (<chunk-id>)`
**Cause:** `--buyer-id` doesn't match the `recipientId` in the access files.
**Fix:** Use the exact buyer ID string the seller passed to `stream grant --buyer-id` / that the confirmation endpoint reported.

**Symptom:** `stream consume`: `Data integrity check failed for chunk N: plaintext hash mismatch`
**Cause:** The encrypted data was tampered with or corrupted in transit/storage.
**Fix:** Do not trust the output. Re-download the chunks; if it persists, the source data is bad: contact the seller.

**Symptom:** Exit 1: `--download-url is mutually exclusive with --chunk-dir, --access-dir, and --data-dir.`
**Cause:** Mixed remote and local input modes.
**Fix:** Use either `--download-url` alone or all three directory flags.

**Symptom:** `consume --download-url` fails against the URL printed by `stream distribute`
**Cause:** Expected: the distribute pre-signed URL carries only the first buyer-access file, not the envelopes/ciphertext.
**Fix:** Point `--download-url` at a self-contained bundle (envelopes + `.bin` + access files via `manifest.json` or ZIP), or use local mode with separately downloaded files.

**Symptom:** Exit 3: `boto3 is required for S3 delivery but is not installed: install with: pip install boto3`
**Cause:** S3 extra missing.
**Fix:** `pip install "peaq-os-cli[s3]"` and set `PEAQOS_S3_ACCESS_KEY_ID` / `PEAQOS_S3_SECRET_ACCESS_KEY`.

**Symptom:** Exit 2: `Payment confirmation timed out after Ns for order <id>`
**Cause:** `stream distribute` never saw `status: confirmed` from the confirmation endpoint within `--timeout`.
**Fix:** Verify the endpoint URL returns JSON with `status` (`confirmed`), matching `order_id`, non-empty `tx_hash`, `buyer_id`, `buyer_public_key_hex`; check the buyer actually paid (`stream pay` / `payproof`); re-run with a longer `--timeout`.

**Symptom:** `stream pay --chain solana`: missing dependency error
**Cause:** Solana extra not installed.
**Fix:** `pip install "peaq-os-sdk[solana]"`. Also pass `--rpc-url` (required for solana and base).

**Symptom:** `stream pay` transfer succeeded but proof submission failed
**Cause:** Confirmation endpoint unreachable or rejected the proof.
**Fix:** Do NOT pay again: the tx hash was already printed to stdout. Resubmit with `peaqos stream payproof --tx-hash <hash> ...`.

**Symptom:** `scale order` with an x402 service fails after `[4/6] Recording payment proof`
**Cause:** Execution failed after the signed authorization was recorded.
**Fix:** Run `peaqos scale order status <order-id>`: the error message includes the payment status. Do **not** re-pay: if the authorization shows `held`, the payment is already committed; check with the platform/provider before any retry.
