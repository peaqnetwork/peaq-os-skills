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

**Symptom:** `.env` has contract addresses mapped to wrong variable names after `peaqos init` (e.g. `EVENT_REGISTRY_ADDRESS` contains the IdentityRegistry address, `IDENTITY_REGISTRY_ADDRESS` is empty)
**Cause:** Known bug in `peaqos init` prompt handling — contract address inputs can be silently mis-mapped when input is piped or entered quickly.
**Fix:** Manually verify and correct `.env` against the known-good addresses in `GUIDE.md#network-reference`. Cross-check each variable name against its expected value before running `peaqos activate`.

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
**Fix:** Add `export OWS_PASSPHRASE="your-passphrase"` to your shell profile, or set it in `.env`. Note: storing the passphrase in `.env` reduces the security benefit of OWS — prefer exporting it in your shell session.

---

## Phase: Funding / Balance

**Symptom:** `peaqos activate` step 1 shows balance as 0 or `insufficient`
**Cause (testnet):** Wallet not yet funded. Gas station is not available on agung testnet.
**Fix:** Fund via web faucet: https://docs.peaq.xyz/peaqchain/build/getting-started/get-test-tokens
Then re-run with `peaqos activate --skip-funding`.

**Cause (mainnet):** Wallet genuinely has no PEAQ.
**Fix:** Transfer PEAQ to the operator wallet address shown in `peaqos whoami`.

**Symptom:** 2FA enrollment fails / QR code doesn't appear
**Cause:** Gas station unreachable, or `PEAQOS_GAS_STATION_URL` is blank.
**Fix (testnet):** Don't use gas station on agung. Fund via faucet + `--skip-funding`.
**Fix (mainnet):** Confirm `PEAQOS_GAS_STATION_URL=https://depinstation.peaq.xyz` in `.env`.

**Symptom:** TOTP code rejected (`TOTP_EXPIRED` / `2FA_EXPIRED`)
**Cause:** Code entered after the 30-second TOTP window expired.
**Fix:** Wait for next code in your authenticator app and re-enter immediately.
The CLI will prompt for a fresh code automatically.

---

## Phase: Activation (exit 2)

**Symptom:** Step 4 fails with `AlreadyRegistered` but reports no machine ID
**Cause:** Rare TOCTOU race — another process registered the same wallet concurrently.
**Fix:** Re-run `peaqos activate`; it reads chain state and skips already-complete steps.

**Symptom:** Step 4 fails: `Proxy operator is not registered on IdentityRegistry`
**Cause:** Proxy mode (`--for`) used before the operator wallet was registered in self mode.
**Fix:** Run `peaqos activate` (self mode, no `--for`) from the operator key first.
Then re-run with `--for <machine-address> --machine-key <path>`.

**Symptom:** Step 4 fails with `address mismatch` / `Machine key does not match --for address`
**Cause:** The key file passed to `--machine-key` doesn't match the address passed to `--for`.
**Fix:** Verify the key file corresponds to `<machine-address>`. Re-generate if needed.

**Symptom:** Step 5 fails with `MachineNotBonded`
**Cause:** Registration succeeded but the machine isn't bonded to IdentityStaking yet.
**Fix:** This should be automatic. Re-run `peaqos activate` — activation is idempotent.
If it persists, the machine may need manual bonding (contact peaq team).

**Symptom:** Step 6 fails with `Failed to read DID attribute on 0x...: Web3RPCError`
**Cause:** Known RPC quirk with the DID precompile at `0x0000000000000000000000000000000000000800` on agung testnet. Steps 4 (register) and 5 (mint NFT) are unaffected.
**Fix:** This is non-blocking — the machine is registered and bonded on-chain. Re-run `peaqos activate` once (idempotent; skips completed steps) to retry the DID write. If it continues to fail, you can still derive the Machine DID as `did:peaq:<machine-or-operator-address>` — this does not depend on DID attributes. P2 onboarding (`scale machine onboard`) will still work with this DID. Note that `peaqos show machine` lookups may return "not found" as a downstream consequence (see below).

**Symptom:** `peaqos show machine` returns "Machine not found" for a machine that exists on-chain
**Cause:** The `show machine` command depends on DID attributes being written (step 6). If step 6 failed, the lookup has nothing to resolve even though the machine is registered.
**Fix:** Verify the machine exists directly via the SDK: `registry.functions.machineExists(<machine-id>).call()`. If it returns `True`, the machine is registered — the "not found" error is a display limitation, not a registration failure.

**Symptom:** Step 6 fails with `NotMachineOwner` or `msg.sender != didAccount`
**Cause (proxy mode):** Machine key file doesn't match the machine's EOA.
**Cause (self mode):** Caller's key doesn't match the registered owner.
**Fix:** Verify `--machine-key` file address matches `--for` address. Use `peaqos whoami` to confirm caller identity.

**Symptom:** `activate` re-runs but keeps registering / minting again
**Cause:** On-chain state check returned 0 (stale RPC node).
**Fix:** Confirm with `peaqos show machine did:peaq:<address>` that registration exists.
If the RPC is lagging, wait ~30s and re-run.

---

## Phase: Event Submission (exit 1 or 2)

**Symptom:** Exit 1 — `--source-tx is required when --trust is 'onchain'`
**Cause:** `--trust onchain` used without providing `--source-tx`.
**Fix:** Add `--source-tx 0x<64-hex-chars>` pointing to the source chain transaction.

**Symptom:** Exit 1 — `--value must be greater than or equal to 0`
**Cause:** Negative value passed.
**Fix:** `--value` must be a non-negative integer in ISO 4217 subunits.

**Symptom:** Exit 1 — `--ts` parse error
**Cause:** Timestamp format not recognized.
**Fix:** Use Unix seconds (digits only) or ISO 8601 with explicit timezone: `2026-04-22T12:00:00Z`.

**Symptom:** Exit 2 — `FutureTimestamp` revert
**Cause:** `--ts` is ahead of the network's block timestamp.
**Fix:** Use a timestamp at or before now. `date +%s` gives current Unix time.

**Symptom:** Exit 2 — `qualify event` reverts with **empty revert data** (`data: '0x'`) even though the machine exists, is active, and `isStaked()` returns `True`. The SDK fallback reverts identically (tx mined, `status=0`).
**Cause:** **Deployed EventRegistry ABI mismatch** (confirmed live on agung, 2026-07-06). agung runs a pre-currency EventRegistry whose function is `submitEvent(uint256,uint8,uint256,uint256,bytes32,uint8,uint256,bytes32,bytes)` — selector `0x6b58c7dc`, **no `string currency` parameter** — while `peaq-os-sdk` 0.4.0 ships the newer signature (selector `0xe58a43ca`). Every CLI/SDK submission therefore calls a selector the deployed contract does not dispatch → bare revert with no error data. (An earlier version of this entry blamed CLI calldata construction — that was a misdiagnosis of this same mismatch.)
**Fix:** Not fixable client-side — escalate to the peaq team (redeploy agung's EventRegistry or ship network-aware ABIs in the SDK). Interim agung-only workaround — submit with the legacy 9-argument ABI directly (no currency; args: machineId, eventType, value, timestamp, dataHash, trustLevel, sourceChainId, sourceTxHash, metadata; eventType 0=revenue, 1=activity):
```python
ABI = [{"inputs":[
    {"name":"machineId","type":"uint256"},{"name":"eventType","type":"uint8"},
    {"name":"value","type":"uint256"},{"name":"timestamp","type":"uint256"},
    {"name":"dataHash","type":"bytes32"},{"name":"trustLevel","type":"uint8"},
    {"name":"sourceChainId","type":"uint256"},{"name":"sourceTxHash","type":"bytes32"},
    {"name":"metadata","type":"bytes"}],
    "name":"submitEvent","outputs":[],"stateMutability":"nonpayable","type":"function"}]
```
Confirm with the peaq team how the legacy contract's `value` is interpreted downstream (the subunit convention arrived with the newer contract). Before assuming this cause on another network, verify with a selector check: fetch the ERC-1967 implementation bytecode and test whether `0xe58a43ca` is present. **Mainnet verified unaffected (2026-07-06)** — its implementation matches SDK 0.4.0, so this symptom on mainnet would indicate a different cause.

**Symptom:** Exit 1 — `RateLimitExceeded`
**Cause:** Too many events submitted within the configured time window.
**Fix:** Wait for the rate limit window to reset, or adjust operational limits.

**Symptom:** Exit 1 — `ValueCapExceeded`
**Cause:** Event value exceeds configured per-tx cap.
**Fix:** Check your SDK or CLI configuration for `--max-value-per-tx`.

---

## Phase: MCR Query (exit 2)

**Symptom:** `Machine not found` (HTTP 404)
**Cause:** DID not yet indexed, or DID format wrong.
**Fix:** Verify DID format: `did:peaq:0x` + exactly 40 hex chars.
If correct, the indexer may be lagging — wait 30–90s after activation and retry.

**Symptom:** `MCR API unavailable` (HTTP 503)
**Cause:** MCR API is temporarily down.
**Fix:** Check `peaqos show machine <did>` for chain-direct data (doesn't depend on MCR API).
Retry `qualify mcr` after a few minutes.

**Symptom:** MCR score is 0 or `Provisioned` after submitting events
**Cause:** Indexer lag — events take up to 90s to be reflected in the MCR API.
**Fix:** Poll `peaqos qualify mcr <did> --json` every 15s for up to 90s. Check the `mcr` field; terminate when it is any value other than `Provisioned`. If still `Provisioned` after 90s, use `peaqos show machine <did> --json` to confirm events landed on chain.

**Symptom:** `FX Degraded: yes` in MCR output
**Cause:** One or more events used a degraded FX source (stale or outage).
**Fix:** Not a failure — score is conservative. No action needed. Resolves when FX recovers.

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

**Symptom:** Partial activation — some steps confirmed in `peaqos.log`, some missing
**Cause:** Previous run interrupted mid-activation.
**Fix:** Re-run `peaqos activate` (same flags). Completed steps are skipped automatically.
Check `peaqos.log` to see which steps completed.

---

## Phase: Scale / Machine Market (exit 3)

**Symptom:** Exit 3 — `PEAQOS_ORCHESTRATION_URL is not configured`
**Cause:** `PEAQOS_ORCHESTRATION_URL` env var is missing from `.env` or shell.
**Fix:** Add `PEAQOS_ORCHESTRATION_URL=<url>` to your `.env` file. The URL is provided by your platform admin or the peaqOS team.

**Symptom:** `AUTH_REQUIRED` error on any Scale command
**Cause:** The Market deployment you are connecting to requires a platform API key, but `PEAQOS_ORCH_API_KEY` is not set.
**Fix:** Add `PEAQOS_ORCH_API_KEY=<key>` to your `.env` file. Obtain the key from your platform admin or the peaqOS team. Note: many deployments do not require this key — only set it if you see this error.

---

## Phase: Scale — Machine Onboard (exit 1 or 2)

**Symptom:** Exit 2 — `Signer <address> is not a DID controller for this identity`
**Cause:** The key used to sign the identity challenge does not match any controller address registered for the DID.
**Fix:** Use `--identity-key-file` with the correct DID controller key, not a machine key or a different operator key. Verify the DID's controller addresses with `peaqos show machine <did>`.

**Symptom:** Exit 1 — `--identity-signature-file and --identity-key-file are mutually exclusive`
**Cause:** Both signing flags were passed.
**Fix:** Use one or the other — `--identity-key-file` for automatic signing, `--identity-signature-file` for a pre-computed signature.

**Symptom:** Exit 2 — `identity already exists` / `MACHINE_IDENTITY_EXISTS`
**Cause:** The machine has already been registered in the Market.
**Fix:** Run `peaqos scale machine status <machine-id>` to check the existing registration. If status is `draft`, the machine was registered but not activated — there is no CLI command to activate a draft machine directly. Contact your platform admin or the peaqOS team to activate it, or re-register with a different `--identity-ref`.

---

## Phase: Scale — Agent Pairing (exit 1 or 2)

**Symptom:** Exit 1 — `--agent-signature-file is required in --json mode`
**Cause:** `--json` flag used without providing a pre-signed signature file.
**Fix:** Either remove `--json` (interactive mode will prompt for the signature), or pass `--agent-signature-file ./agent.sig`.

**Symptom:** Exit 2 — `AGENT_PAIRING_PROOF_INVALID`
**Cause:** The EIP-191 signature provided by the agent does not match the challenge message.
**Fix:** Ensure the agent signed the exact challenge message string (including whitespace). The message is displayed during the pairing flow — relay it to the agent exactly as shown.

**Symptom:** Pairing token lost / not saved
**Cause:** The token was displayed once and the window was closed or cleared.
**Fix:** The token cannot be recovered. Create a new pairing directly:
```bash
peaqos scale agent pair --machine-id <id> --agent-address <addr> --agent-provider <provider> --agent-role <role> --yes
```
Note: `peaqos scale machine list` lists machines, not pairings — it cannot be used to look up a pairing ID. If you need to identify existing pairings, contact the platform team or check your own records from when P3 was originally run.

---

## Phase: Scale — Search (exit 1 or 2)

**Symptom:** Exit 1 — `Could not read provider credentials file`
**Cause:** `--provider-credentials` path does not exist or is not readable.
**Fix:** Check the file path. Credentials file must be a valid JSON object.

**Symptom:** Exit 2 — `AGENT_AUTH_REQUIRED` / `AGENT_AUTH_EXPIRED` / pairing token invalid
**Cause:** The pairing token in `--pairing-token-file` is expired, revoked, or for a different machine.
**Fix:** The CLI does not expose a token-refresh command. The SDK has a `CreateAgentPairingSessionRequest` type for refreshing a token against an existing pairing, but no `peaqos scale` subcommand wraps it. The only CLI path is to create a new pairing:
```bash
peaqos scale agent pair --machine-id <id> --agent-address <addr> --agent-provider <provider> --agent-role <role> --yes
```
This creates a new pairing with a new ID and pairing token. Update any stored `pairing_id` and token file with the new values.

**Symptom:** No quotes returned despite valid search
**Cause:** No providers match the service type, capabilities, or budget.
**Fix:** Broaden the search — remove `--native-only`, increase `--budget-max`, try a different `--service-type`, or remove `--capabilities` filters.

---

## Phase: Scale — Orders and Payment (exit 2)

**Symptom:** Exit 2 — `QUOTE_EXPIRED`
**Cause:** Too much time elapsed between search and order placement. Quotes have a short TTL.
**Fix:** Re-run `peaqos scale search` to get fresh quotes, then place the order immediately.

**Symptom:** Exit 2 — `PAYMENT_RPC_ERROR` / `PAYMENT_TRANSFER_NOT_FOUND`
**Cause:** The payment transaction was submitted but could not be verified on-chain (RPC lag or wrong chain).
**Fix:** Check `PEAQOS_RPC_URL` is correct and reachable. If the tx was mined, use `--payment-tx-hash` + `--payment-chain` + `--payment-token` + `--skip-payment` to submit proof manually.

**Symptom:** Order created but execution failed — status stuck at `ready` or `executing`
**Cause:** The order was created and paid for but the execute step failed.
**Fix:** Check `peaqos scale order status <order-id> --json`. If `.order.status` is `ready` or `executing`, execution can be retried with the same `peaqos scale order <service-id>` command. If the service is unavailable, dispute the order.

**Symptom:** Exit 2 — `ORDER_CLOSED`
**Cause:** Attempted to execute, confirm, or dispute an order that is already in a terminal state.
**Fix:** Check the current status with `peaqos scale order status <order-id> --json`. Terminal states: `confirmed` · `cancelled` · `disputed` · `failed`.

**Symptom:** Order fails at step `x402 payment challenge` (stderr text: `Order '<id>' was created but x402 payment challenge failed.` — the CLI emits no JSON on errors)
**Cause:** The service returned a missing or malformed x402 payment challenge — the `payment.rail.metadata` block did not contain a valid `TransferWithAuthorization` signing challenge.
**Fix:** This is a service-provider issue, not an operator issue. Contact the service provider. As a workaround, search for an alternative service if one is available.

**Symptom:** Order fails at step `x402 signing` (stderr text: `Order '<id>' was created but x402 signing failed.`)
**Cause:** Local x402 signing failed. Most common cause: `PEAQOS_PRIVATE_KEY` is missing, malformed, or does not correspond to the wallet address registered with the service.
**Fix:** Verify `PEAQOS_PRIVATE_KEY` is set in `.env` (64 hex chars, `0x` prefix). Run `peaqos whoami` to confirm the active address. If using OWS wallet, ensure the wallet is unlocked and the correct wallet is active.

**Symptom:** `x402` module not found or import error during order placement
**Cause:** Older SDK version that did not bundle the x402 dependency.
**Fix:** Upgrade: `pip install --upgrade peaq-os-cli` (v0.0.6+ bundles `peaq_os_sdk[x402]>=0.4.0`).

---

## Phase: Stream commands

**Symptom:** `peaqos stream consume` exits 1 — `--chunk-dir is required when --download-url is not provided`
**Cause:** Neither `--download-url` nor the three directory flags were supplied.
**Fix:** Use `--download-url <url>` (seller-provided release package URL) or supply `--chunk-dir`, `--access-dir`, and `--data-dir` together.

**Symptom:** `peaqos stream consume` exits 1 — `--download-url is mutually exclusive with --chunk-dir, --access-dir, and --data-dir`
**Cause:** Both `--download-url` and directory flags were passed.
**Fix:** Use one mode or the other — never both.

**Symptom:** `Key commitment verification failed` (grant or consume)
**Cause:** The private key file does not match the public key used during the opposing step — wrong `--owner-private-key-file` in grant, or wrong `--buyer-private-key-file` in consume.
**Fix:** For grant: use `stream-owner.key` from the original publish. For consume: use the buyer's X25519 private key whose public key was passed to `peaqos stream grant --buyer-public-key`.

**Symptom:** `access not granted for this buyer private key` (consume)
**Cause:** The access files in `--access-dir` (or the downloaded package) do not include an entry for this buyer's key.
**Fix:** Re-run `peaqos stream grant` with the correct buyer public key, then share the updated access files.

**Symptom:** `No buyer access for chunk N` or `No buyer access files found in <dir>` (consume) when the files look correct
**Cause:** `--buyer-id` passed to consume does not match the ID used during grant — access entries with a non-matching `recipientId` are silently skipped, so a wrong buyer ID looks identical to missing access files. (There is no literal "Buyer ID mismatch" error.)
**Fix:** Use the exact string that was passed to `peaqos stream grant --buyer-id`. If it matches, re-run grant — some chunks were missed.

**Symptom:** `boto3 is required for S3 upload. Install with: pip install peaq-os-cli[s3]` (publish `--s3` or distribute)
**Cause:** S3 support is an optional extra — boto3 is not installed with the base CLI.
**Fix:** `pip install 'peaq-os-cli[s3]'` and re-run.

**Symptom:** `peaqos stream distribute` times out waiting for payment confirmation
**Cause:** Buyer has not yet completed payment, or `--confirmation-url` is unreachable.
**Fix:** Verify the buyer ran `peaqos stream pay` successfully. Check `--confirmation-url` is reachable from the seller's host. The command is idempotent — safe to re-run; it resumes polling from where it left off.
