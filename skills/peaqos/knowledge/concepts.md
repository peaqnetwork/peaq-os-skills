# peaqOS Concepts

Reference for explaining peaqOS-specific terms. Use the "plain English" versions
when talking to non-technical operators; use the technical versions with developers.

---

## peaqID / DID

**Technical:** Economics 2.0 uses `did:peaq:<decimal machine id>`. The ID is `uint256(keccak256(abi.encode(machineType, credentialSubject)))`. Those two identity inputs cannot change. CLI activation and machine status serialize IDs as decimal strings.

The DID document contains `verificationMethods`, `authentication` and `serviceEndpoints`. See `GUIDE.md#did-document` for the schema. Documentation and API URLs belong in service endpoints.

**Plain English:** A permanent identity for the machine, independent of its owner's wallet. Legacy 1.0 machines use `did:peaq:0x<address>`.

---

## Machine NFT

**Technical:** `MachineStateAndSync.activateMachine` atomically mints the ERC-721 in `MachineRegistry`, stores the DID document, bonds the subscription tier and records the home chain. The NFT token ID is the machine ID. The sender owns and pays.

**Plain English:** A certificate of ownership. Transferring it changes the owner but retains the DID controller.

---

## Machine Credit Rating (MCR)

**Technical:** A score (0–100) and tier label computed by the peaqOS MCR API from on-chain
event history, bond status, trust levels, and FX-adjusted revenue. Queried at `GET /mcr/{did}`. With `TOKENOMICS_DEPLOYMENT_ID` set, `qualify mcr` and `show machine` use decimal DIDs at `mcr-20.peaq.xyz`; otherwise they use legacy address DIDs at `mcr.peaq.xyz`. Operator DIDs always identify an address.
Updated periodically by an off-chain indexer: there's typically a short lag after new events.

**Tiers:**
| Score | Rating |
|-------|--------|
| ≥ 95  | AAA    |
| ≥ 85  | AA     |
| ≥ 75  | A      |
| ≥ 60  | BBB    |
| ≥ 45  | BB     |
| ≥ 30  | B      |
| < 30 or unbonded | NR (no rating) |
| Fresh machine, no events yet | Provisioned |

**Plain English:** Think of it as a credit score for your machine. Higher scores unlock better
terms with DePIN service providers. A fresh machine starts as "Provisioned": submit events to build history.

---

## Trust Level

Controls how much weight an event carries in the MCR calculation.

| Value | CLI flag | Meaning | MCR weight |
|-------|----------|---------|------------|
| 0 | `--trust self` | Self-reported: you assert the data | Lowest |
| 1 | `--trust onchain` | On-chain verifiable: backed by a source tx hash (`--source-tx` required) | Higher |
| 2 | `--trust hardware` | Hardware-signed: cryptographic attestation from the device | Highest |

**Plain English:** Trust level is like a source citation. "I said so" (self) carries less weight
than "here's the blockchain proof" (onchain) or "my tamper-proof chip signed this" (hardware).

---

## Bond Status

Economics 2.0 bonds PEAQ in `MachineSubscription`. Tiers are `entry`, `basic` and `pro`. The tier price is converted at the oracle rate; voucher credit reduces the net payment. Preview before spending because quotes change. Settlement can be PEAQ or USDT. The bond is not withdrawable.

Renewal uses the stored tier and extends from the stored period end. Suspend and resume do not change the subscription. Bonding and onboarding credits accrue to the owner, even when a controller pays for renewal.

---

## DID services

Use `serviceEndpoints` for documentation and API URLs. DID array setters replace the entire array. Authentication entries are indices into verification methods. Publishing an endpoint does not itself control access to the data it serves.

---

## Self-owned vs machine-owned, operator-controlled

**Self-owned (Architecture A):** The configured signer owns, signs and pays. It is also the DID controller. Use the required activation flags without `--for`.

**Machine-owned, operator-controlled (Architecture B):** Add `--for 0xMachine --machine-key ./machine.key`. The machine signs, owns the NFT and pays gas and the bond. The operator becomes DID controller and signs nothing during activation. No prior operator activation is needed.

The owner can transfer the NFT and set or clear its controller. The controller can suspend, resume, renew and update verification methods, authentication and services. It cannot transfer the NFT or change the controller.

---

## Event Types

| Type | CLI flag | When to use |
|------|----------|------------|
| Revenue | `--type revenue` | Machine earned money (energy sold, service fee, data sold) |
| Activity | `--type activity` | Machine did work (heartbeat, computation, task completed) |

`--value` is always in ISO 4217 subunits. Examples:
- USD 1.23 → `--value 123 --currency USD`
- HKD 10.00 → `--value 1000 --currency HKD`
- JPY 100 → `--value 100 --currency JPY` (JPY has no minor unit)
- Activity with no monetary value → `--value 0`

---

## Machine Market (Scale)

The Machine Market is a service marketplace where machines can buy and sell capabilities. It sits on top of peaqOS on-chain identity: a machine needs a peaqID before it can enter the Market.

**Plain English:** Think of it as an app store for machine services. A machine can search for services it needs (price feeds, compute, storage), place orders, and pay for them: all autonomously.

---

## Market Registration

Registering a machine in the Market (`peaqos scale machine onboard`) is separate from on-chain activation (`peaqos activate`). On-chain activation creates the machine's permanent identity. Market registration lists the machine as a participant in the marketplace, with a display name, machine type, capabilities, and runtime profile.

---

## Agent Pairing

An AI agent (like a Claude or LangChain instance) must be paired to a machine before it can search or order on its behalf. Pairing involves:
1. The CLI requesting a challenge from the API
2. The agent signing the challenge with its own key (EIP-191)
3. The API verifying the signature and creating the pairing

The result is a **pairing token**: a bearer credential that authorises the agent to act for that machine. The token is shown **once** and must be stored securely. It is passed to search and order commands via `--pairing-token-file`.

---

## Delegation Policy

When creating an agent pairing, operators can set a delegation policy that limits what the paired agent can do:
- `--per-tx-limit`: max spend per single transaction
- `--daily-limit`: max total spend per day
- `--currency`: currency for the limits
- `--allowed-skills` / `--denied-skills`: restrict which skill keys the agent can order
- `--allowed-service-ids` / `--denied-service-ids`: restrict which specific services the agent can use

**Plain English:** Like a corporate credit card with spending controls: the agent can buy things, but only within the limits the operator set.

---

## Market Search and Quotes

`peaqos scale search` queries the marketplace for services matching the machine's needs. The API returns a ranked list of **quotes** from available providers. Each quote has a `quote_id`, `service_id`, `score`, and `execution_mode`. The top-ranked quote is usually the best match; operators can inspect the full table and choose a different one.

---

## Market Orders and Payment

Placing an order (`peaqos scale order <service-id>`) commits to purchasing a service. Orders go through a lifecycle:
- `pending` → `active` → `delivered` → `closed`

**Payment rails:**
- **Not required**: some services have no cost: order flows straight to execution
- **Wallet payment (EVM)**: funds are transferred on-chain; the CLI creates a payment intent, sends the transfer, and submits a proof automatically (OWS wallets handle this without manual steps)
- **Escrow**: funds are locked in a smart contract until the order is confirmed or disputed

**Execution modes:**
- **Native**: the service executes directly and returns a result in the API response (HTTP 200)
- **Handoff**: the service returns a URL for external execution (HTTP 202): the operator or agent completes the task via that endpoint

---

## Order Confirmation and Disputes

After execution, the buyer confirms or disputes:
- `peaqos scale order received`: confirms delivery, releases held payment to the provider
- `peaqos scale order dispute --reason "..."`: flags a problem, freezes payment pending resolution

**Plain English:** Like accepting or rejecting a delivery. Confirm if the service did what it promised; dispute if it didn't.

---

## Stream (Data Sales)

Stream is the *data* side of the machine economy: a machine signs the data it produces, encrypts it, and sells access. Where Scale lets a machine **buy services**, Stream lets it **sell data**.

**Plain English:** The machine's sensor output becomes a product. Buyers can verify the data really came from that machine before paying, and they can only decrypt what they've been granted.

---

## Chunks and Chunk Chains

Data is split into bounded **chunks**: each encrypted under its own fresh key (XChaCha20-Poly1305) and linked to the previous chunk, forming a tamper-evident **chain** signed with one Ed25519 key. Reordering, gaps, or edits are detectable. A chunk is the unit of access: the CLI's `stream grant` re-wraps the whole published chain for a buyer, while per-chunk selection exists in the SDK purchases flow.

---

## Access Grants (Envelope Encryption)

Each chunk key is wrapped separately to each authorized recipient's X25519 public key (owner, operator, machine: and later, buyers). Granting a buyer access (`peaqos stream grant` or `distribute`) re-wraps the purchased chunk keys to the buyer's key. **The data itself is never re-encrypted and no master key is ever shared.**

**Plain English:** Like a locked box where each authorized person gets their own copy of the key, sealed in an envelope only they can open.

---

## Stream Payment and Delivery

The buyer pays on-chain (`peaqos stream pay`: peaq, Base, or Solana) and submits the tx hash as proof; the seller waits for confirmation and delivers access files (`peaqos stream distribute`, S3 delivery). At the SDK level there is also a machine-to-machine **P2P delivery channel** (`peaqos-p2p` transport) that streams encrypted chunks directly between seller and buyer: SDK-only for now, no CLI flag.

---

## x402 Payment Rail

x402 is a web payment standard built on HTTP 402 ("payment required"): the provider answers with exact payment instructions, and the buyer's wallet **signs an authorization** instead of sending its own on-chain transfer. peaqOS settles with the provider during execution. Used by Agentic Market paid-HTTP services on `peaqos scale order`.

**Plain English:** Instead of wiring money and showing the receipt, the agent signs a one-time payment authorization and the platform handles the rest.
