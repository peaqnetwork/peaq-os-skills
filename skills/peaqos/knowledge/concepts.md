# peaqOS Concepts

Reference for explaining peaqOS-specific terms. Use the "plain English" versions
when talking to non-technical operators; use the technical versions with developers.

---

## peaqID / DID

**Technical:** A W3C Decentralised Identifier in the format `did:peaq:0x<EVM-address>`.
Written to the peaq DID precompile at `0x0000000000000000000000000000000000000800`.
Six attributes are stored: machine ID, NFT token ID, operator DID, doc URL, data API URL, and visibility.

**Plain English:** Your machine's permanent on-chain identity card. It's derived from the machine's
wallet address, so it never changes even if the machine moves networks or operators.

---

## Machine NFT

**Technical:** An ERC-721 token minted by `MachineNFT.mintNft(machineId, recipient)`.
The NFT *owner* is the operator's address (not the machine's address in self-managed mode).
Represents ownership and transferability of the machine's identity.

**Plain English:** A digital certificate of ownership. It proves who owns the machine,
can be transferred to a new owner, and is required before DID attributes can be written.

---

## Machine Credit Rating (MCR)

**Technical:** A score (0–100) and tier label computed by the peaqOS MCR API from on-chain
event history, bond status, trust levels, and FX-adjusted revenue. Queried at `GET /mcr/{did}`.
Updated periodically by an off-chain indexer — there's typically a short lag after new events.

**Tiers:**
| Score | Rating |
|-------|--------|
| ≥ 95  | AAA    |
| ≥ 85  | AA     |
| ≥ 75  | A      |
| ≥ 65  | BBB    |
| ≥ 55  | BB     |
| ≥ 45  | B      |
| ≥ 35  | CCC    |
| ≥ 30  | CC     |
| < 30  | NR (no rating) |
| Fresh machine, no events yet | Provisioned |

**Plain English:** Think of it as a credit score for your machine. Higher scores unlock better
terms with DePIN service providers. A fresh machine starts as "Provisioned" — submit events to build history.

---

## Trust Level

Controls how much weight an event carries in the MCR calculation.

| Value | CLI flag | Meaning | MCR weight |
|-------|----------|---------|------------|
| 0 | `--trust self` | Self-reported — you assert the data | Lowest |
| 1 | `--trust onchain` | On-chain verifiable — backed by a source tx hash (`--source-tx` required) | Higher |
| 2 | `--trust hardware` | Hardware-signed — cryptographic attestation from the device | Highest |

**Plain English:** Trust level is like a source citation. "I said so" (self) carries less weight
than "here's the blockchain proof" (onchain) or "my tamper-proof chip signed this" (hardware).

---

## Bond Status

**Technical:** Whether the machine has staked PEAQ on the `IdentityStaking` contract.
The `activate` command handles bonding automatically as part of registration.
Bond status is either `bonded` or `unbonded`.

**Plain English:** A deposit that backs the machine's participation. Bonded machines
are eligible for full MCR scoring. `peaqos activate` handles this automatically.

---

## Data Visibility

Set during `peaqos activate` via `--visibility`. Controls who can see the machine's data API.

| Value | Meaning |
|-------|---------|
| `public` | Data API URL is visible to anyone querying the DID |
| `private` | Data API URL is hidden; only the operator can see it |
| `onchain` | Data is stored directly on-chain (for small payloads) |

Default is `public`. Most operators want `public` unless data is commercially sensitive.

---

## Self-managed vs Proxy-managed

**Self-managed (Architecture A):**
The machine holds its own private key and signs all transactions itself.
CLI invocation: `peaqos activate` (no extra flags).
The machine's address and the operator's address are the same EOA.

**Proxy-managed (Architecture B):**
The operator holds the machine's private key and signs on its behalf.
CLI invocation: `peaqos activate --for <machine-address> --machine-key <path>`.
The operator funds, registers, and mints. The machine EOA still signs its own DID writes
(the peaq DID precompile enforces `msg.sender == didAccount`).
Operator must be registered first (run `peaqos activate` in self mode before proxy mode).

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
