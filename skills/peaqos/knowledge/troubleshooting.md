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
**Fix:** This is non-blocking — the machine is registered and bonded on-chain. Re-run `peaqos activate` once (idempotent; skips completed steps) to retry the DID write. If it continues to fail, proceed without DID attributes for now. Note that `peaqos show machine` may return "not found" as a downstream consequence (see below).

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

**Symptom:** Exit 2 — `MachineNotBonded` revert even though `isStaked()` returns `True`
**Cause:** Known bug in how the CLI constructs the event submission transaction — the calldata differs from a direct SDK call in a way that triggers a false bonding check failure.
**Fix:** Submit the event directly via the SDK as a workaround while the CLI bug is investigated:
```python
from peaq_os_sdk import EventRegistry
event_reg = EventRegistry(web3, contract_address)
event_reg.functions.submitEvent(...).transact({'from': account.address})
```
Compare the exact transaction calldata between the CLI and SDK calls to isolate the root cause.

**Symptom:** Exit 2 — `RateLimitExceeded`
**Cause:** Too many events submitted within the configured time window.
**Fix:** Wait for the rate limit window to reset, or adjust operational limits.

**Symptom:** Exit 2 — `ValueCapExceeded`
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
**Fix:** Poll `peaqos qualify mcr <did>` every 10s for up to 2 minutes.
If still 0 after 2 minutes, use `peaqos show machine <did>` to confirm events landed on chain.

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

**Symptom:** Exit 3 — `PEAQOS_ORCH_API_KEY is not configured` / `AUTH_REQUIRED`
**Cause:** `PEAQOS_ORCH_API_KEY` env var is missing or invalid.
**Fix:** Add `PEAQOS_ORCH_API_KEY=<key>` to your `.env` file. Obtain the key from your platform admin.

---

## Phase: Scale — Machine Onboard (exit 1 or 2)

**Symptom:** Exit 1 — `Signer <address> is not a DID controller for this identity`
**Cause:** The key used to sign the identity challenge does not match any controller address registered for the DID.
**Fix:** Use `--identity-key-file` with the correct DID controller key, not a machine key or a different operator key. Verify the DID's controller addresses with `peaqos show machine <did>`.

**Symptom:** Exit 1 — `--identity-signature-file and --identity-key-file are mutually exclusive`
**Cause:** Both signing flags were passed.
**Fix:** Use one or the other — `--identity-key-file` for automatic signing, `--identity-signature-file` for a pre-computed signature.

**Symptom:** Exit 2 — `identity already exists` / `IDENTITY_CONFLICT`
**Cause:** The machine has already been registered in the Market.
**Fix:** Run `peaqos scale machine status <machine-id>` to check the existing registration. If status is `draft`, update rather than re-onboard.

---

## Phase: Scale — Agent Pairing (exit 1 or 2)

**Symptom:** Exit 1 — `--agent-signature-file is required in --json mode`
**Cause:** `--json` flag used without providing a pre-signed signature file.
**Fix:** Either remove `--json` (interactive mode will prompt for the signature), or pass `--agent-signature-file ./agent.sig`.

**Symptom:** Exit 2 — `PAIRING_PROOF_INVALID`
**Cause:** The EIP-191 signature provided by the agent does not match the challenge message.
**Fix:** Ensure the agent signed the exact challenge message string (including whitespace). The message is displayed during the pairing flow — relay it to the agent exactly as shown.

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

## Phase: Scale — Search (exit 1 or 2)

**Symptom:** Exit 1 — `Could not read provider credentials file`
**Cause:** `--provider-credentials` path does not exist or is not readable.
**Fix:** Check the file path. Credentials file must be a valid JSON object.

**Symptom:** Exit 2 — `AGENT_AUTH_REQUIRED` / `pairing token invalid`
**Cause:** The pairing token in `--pairing-token-file` is expired, revoked, or for a different machine.
**Fix:** Verify the token file contains the correct token for this machine. If expired, create a new agent pairing session:
```bash
peaqos scale agent pair --machine-id <id> ...
```

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

**Symptom:** Order created but execution failed — status stuck at `active`
**Cause:** The order was created and paid for but the execute step failed.
**Fix:** Check `peaqos scale order status <order-id>`. If the order is still active, execution can be retried. If the service is unavailable, dispute the order.

**Symptom:** Exit 2 — `ORDER_CLOSED`
**Cause:** Attempted to execute, confirm, or dispute an order that is already in a terminal state.
**Fix:** Check the current status with `peaqos scale order status <order-id>`. Terminal states: `closed`, `cancelled`, `disputed`.
