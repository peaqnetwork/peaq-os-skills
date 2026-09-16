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
**Cause:** The wizard has no default for this variable and leaves it empty. Every command building an SDK client then fails.
**Fix:** Fill it and verify all six addresses using `GUIDE.md#network-reference`. Mainnet 2.0: `0xA1e7F1d7B24dAb55Dc92491e6d9B89F6E925Ad1e`; mainnet 1.0: `0x43c6AF2E14dc1327dc3cc6c7117D1CD72fffEcbA`; agung: `0x2DAD8905380993940e340C5cE6d313d5c2780040`. Confirm `TOKENOMICS_DEPLOYMENT_ID` in `whoami`'s `Tokenomics 2.0:` block.

**Symptom:** `peaqos whoami` shows `Chain ID: 3338` but you expect testnet
**Cause:** `PEAQOS_NETWORK=mainnet` instead of `testnet`.
**Fix:** Set `PEAQOS_NETWORK=testnet` in `.env`.

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
**Cause:** Code entered after the 30-second TOTP window expired.
**Fix:** Wait for next code in your authenticator app and re-enter immediately.
The CLI will prompt for a fresh code automatically.

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
| `RPC_FAILED` with `MachineSubscription.fullMode() could not be read` (the SDK's own code is `READ_FAILED`) | 2 | SDK 0.7.1 and older read `fullMode()`, which mainnet replaced with `isEconomicAuthority()` on 2026-09-15 (CORE-777). The RPC is fine. Run `pip install -U peaq-os-cli peaq-os-sdk`; a fixed SDK reads `isEconomicAuthority()` and never shows this message. If the newest release still fails, the fix is not published yet; agung is not upgraded and still activates. |
| `NOT_ECONOMIC_AUTHORITY` (SDK code; a CLI release without a row for it reports `ACTIVATION_FAILED` at exit 2, the mapped release uses exit 3) | 2 or 3 | The selected deployment's `MachineSubscription` is not the economic authority, so it cannot activate or fund a subscription. Use a peaq deployment (`peaq-mainnet`, `agung-2026-08-28`); changing the RPC does not help. Replaces `NOT_FULL_MODE`, which no longer occurs. |
| `TECHNICALLY_PAUSED` | 2 | A protocol technical pause (global or for this machine) blocks activation, renewal and the Solana `subscription` phase. The SDK reads both flags before its first approval; a pause that starts after an approval confirmed (renewal, USDT activation, the Solana subscription loop) still ends here, with the approval gas spent and the allowance left in place. Read the reported transactions before saying nothing was spent. Wait for the pause to clear, then preview again. Same code and exit on `activate` and `machine subscription renew`. |

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

**Symptom:** Exit 2: `RateLimitExceeded`
**Cause:** Too many events submitted within the configured time window.
**Fix:** Wait for the rate limit window to reset, or adjust operational limits.

**Symptom:** Exit 2: `ValueCapExceeded`
**Cause:** The event `--value` exceeds the per-transaction cap enforced by the `EventRegistry` contract on-chain. This is a protocol-level limit, not a CLI setting.
**Fix:** Submit the event with a smaller `--value` (remember it's in ISO 4217 subunits: `1000` = $10.00, not $1000). If your machine genuinely needs a higher cap, contact the peaq team: the limit is configured on the contract, not in the CLI or `.env`.

---

## Phase: MCR Query

| Symptom | Exit | Action |
|---------|------|--------|
| DID rejected for deployment mode | 1 | With `TOKENOMICS_DEPLOYMENT_ID`, use `did:peaq:<decimal machine id>` at `mcr-20.peaq.xyz`. Without it, use `did:peaq:0x<address>` at `mcr.peaq.xyz`. `show operator machines` always takes an address DID. |
| Missing private key or legacy address | 3 | Both `qualify mcr` and `show` still build the full SDK client. Supply `PEAQOS_PRIVATE_KEY` and all six legacy addresses in `.env`. |
| `SERVICE_UNAVAILABLE` | 2 | MCR or its operator index is unavailable or syncing. Retry later. `show machine` also reads MCR; use `machine status <decimal-id> --json` for independent chain state. |
| Machine not found | 2 | Confirm ID and deployment, then inspect chain state. An indexer delay is possible but is not proof of a successful activation. |
| Score is 0 or Provisioned | 0 | Inspect submitted event receipts and allow indexing time. Do not promise a score change or exact indexing delay. |
| Rounded ID from `show machine --json` | 0 | CLI 0.0.9 serializes this field as a number. Read `did` or use a big-integer-aware parser. `machine status --json` uses decimal strings. |

`FX Degraded: yes` means the rating used degraded FX data. It is not a transaction failure.

---

## Phase: Solana onboarding

| Observation | Action |
|-------------|--------|
| `activate --help` lacks `--chain` | Stop this path. Tell the user to run `pip install -U 'peaq-os-cli[solana,ows]'`. Extras alone do not add missing SDK APIs. |
| Wrong chain or missing configuration | Mainnet only: `PEAQOS_NETWORK=peaq`, `TOKENOMICS_DEPLOYMENT_ID=peaq-mainnet`, `PEAQOS_SVM_NETWORK=mainnet-beta`. Set separate peaq and Solana RPC URLs. `whoami` cluster output is unverified metadata. |
| Rejected tier or EVM mode flags | Use basic/pro; omit `--for`, `--machine-key` and `--slippage-bps`. Supply base58 native owner/manufacturer and all explicit caps/history/compute settings. |
| Reservation or subscription confirmed | Rerun that phase with original inputs without `--yes` to reconcile. Keep the same directory and `peaqos.log`. |
| Approval confirmed, subscription not submitted | Resume subscription with the original operator wallet and fresh consent. Retain approval evidence. |
| Reservation or tier mirror pending | Arrange external delivery, then repeat the native preview. A source receipt does not prove mirror delivery. |
| Native confirmed but linkage pending, even with exit 0 | Repeat full-input `--phase native_onboarding` without `--yes` after external delivery. Only `onboarding_state.evidence.stage.phase` equal to `complete` proves completion. |
| Timeout, interruption, cancellation or expired native reference | Reconcile retained evidence first. Never erase the journal or authorize a replacement from uncertainty. |
| Changed input, signer, deployment or account conflict | Restore the original identity, DID, controller, operator, tier, payment, bounds and history. Inspect SDK evidence; never bypass conflicts by erasing history. |
| `CONFIG_ERROR`, `DEPENDENCY_MISSING` | Fix local config or install matching SDK APIs/extras before retrying. Config/dependency failures exit 3. |
| `TIMEOUT` or read failure | Exit 2; retain partial observations and transaction references. |
| `MACHINE_HOMED_ELSEWHERE` | For a supported Solana home, configure both SVM settings and a compatible SDK for ID-only status fallback. |
| Status says observed/present | `machine status <id> --json` is a wallet-free, journal-free current observation. Inspect `native_current_state`; present alone proves neither a creation receipt nor completed linkage. |

Input errors exit 1. Pending/conflicting states successfully observed by `machine status` can exit 0. Keep historical receipts separate from current peaq/Solana observations.

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
**Fix:** Check `PEAQOS_RPC_URL` is correct and reachable. If the tx was mined, use `--payment-tx-hash` + `--payment-chain` + `--payment-token` + `--skip-payment` to submit proof manually.

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
**Fix:** Verify the endpoint URL returns JSON with `status`, `buyer_id`, `buyer_public_key_hex`; check the buyer actually paid (`stream pay` / `payproof`); re-run with a longer `--timeout`.

**Symptom:** `stream pay --chain solana`: missing dependency error
**Cause:** Solana extra not installed.
**Fix:** `pip install "peaq-os-sdk[solana]"`. Also pass `--rpc-url` (required for solana and base).

**Symptom:** `stream pay` transfer succeeded but proof submission failed
**Cause:** Confirmation endpoint unreachable or rejected the proof.
**Fix:** Do NOT pay again: the tx hash was already printed to stdout. Resubmit with `peaqos stream payproof --tx-hash <hash> ...`.

**Symptom:** `scale order` with an x402 service fails after `[4/6] Recording payment proof`
**Cause:** Execution failed after the signed authorization was recorded.
**Fix:** Run `peaqos scale order status <order-id>`: the error message includes the payment status. Do **not** re-pay: if the authorization shows `held`, the payment is already committed; check with the platform/provider before any retry.
