# Decision Tree — Architecture Questionnaire

Routes an operator to the right onboarding architecture based on 5 questions.
Read this file at runtime and run the questions via `AskUserQuestion`, one per turn.

---

## Questions

Ask these verbatim. Don't paraphrase — the wording maps directly to the matrix rows.

**Q1 — Machine type**
> What kind of machine are you onboarding?
- A: IoT sensor (temperature, air quality, energy meter, GPS tracker, etc.)
- B: Edge gateway (Raspberry Pi, Jetson, NUC — runs a real OS, coordinates other devices)
- C: Cloud VM / container (a process running in AWS, GCP, Azure, k8s, etc.)
- D: Robot (autonomous physical agent — wheeled, arm, drone)
- E: Consumer device (phone, laptop, wearable, or device not built yet)

**Q2 — Where deployed**
> Where does the machine live?
- A: Cloud / data centre (managed, always-networked)
- B: On-premises (office, factory floor, server room)
- C: Customer premises (installed at end-user sites you don't fully control)
- D: Mobile / vehicle (moves around, connectivity varies)
- E: Air-gapped / offline (no direct internet access)

**Q3 — Connectivity**
> How does the machine connect to the internet?
- A: Always online (reliable broadband or LTE)
- B: Intermittent (connects periodically — minutes to hours between windows)
- C: Relay-only (traffic goes through a gateway or broker; machine can't reach peaq directly)
- D: Offline / batch (events are collected locally and uploaded later)

**Q4 — Operator access on the device**
> How much control do you have over the machine's software?
- A: Root / SSH (you own the runtime — can install packages, set env vars, run any process)
- B: Service slot (you can deploy a containerised service or sidecar, but not the full OS)
- C: Black box (you can send commands or read data, but can't run arbitrary code on device)
- D: Not built yet (the machine is still in development)

**Q5 — Admin wallet situation**
> What's your situation with an admin wallet?
- A: I have one (existing EOA with PEAQ balance or ready to fund on testnet)
- B: I need to generate one (I'll create a fresh keypair now)
- C: I want KMS / hardware wallet / multisig (Fireblocks, AWS KMS, Safe, Ledger)

---

## Recommendation Matrix {#recommendation-matrix}

12 canonical Q1–Q4 tuples → architecture. Q5 routes wallet setup independently (Phase 5).

| Row | Q1 | Q2 | Q3 | Q4 | Architecture | Trust Level | Notes |
|-----|----|----|----|----|-------------|-------------|-------|
| 1 | C (Cloud VM) | A (Cloud) | A (Always) | A (Root) | **A — Self-managed** | L1 | Machine holds its own key; signs everything on-device |
| 2 | C (Cloud VM) | A (Cloud) | A (Always) | B (Service) | **A — Self-managed** | L1 | Deploy SDK as a sidecar service |
| 3 | B (Edge GW) | B (On-prem) | A (Always) | A (Root) | **A — Self-managed** | L1 | Gateway has reliable connectivity and root access |
| 4 | B (Edge GW) | B (On-prem) | B (Intermittent) | A (Root) | **A — Self-managed** | L1 | Buffer events locally; flush when online |
| 5 | A (IoT sensor) | B (On-prem) | A (Always) | A (Root) | **A — Self-managed** | L1 | Sensor has root and always-on — self is simpler |
| 6 | A (IoT sensor) | B (On-prem) | B (Intermittent) | A (Root) | **B — Proxy-operator** | L2 | Intermittent; operator gateway relays events |
| 7 | A (IoT sensor) | C (Customer) | B–D (Any) | B–C (Service/BB) | **B — Proxy-operator** | L2 | No root on customer device; operator controls key |
| 8 | D (Robot) | B–C (On-prem/Cust) | A (Always) | A (Root) | **A — Self-managed** | L1 | Robot with root and connectivity — self is fine |
| 9 | D (Robot) | D (Mobile) | B (Intermittent) | A (Root) | **A — Self-managed** | L1 | Buffer + flush; robot holds its own key |
| 10 | E (Consumer) | C (Customer) | A–B (Any) | C (Black box) | **B — Proxy-operator** | L2 | Consumer device; operator manages key externally |
| 11 | Any | E (Air-gap) | D (Offline) | Any | **B — Proxy-operator** | L2 | Batch relay — proxy uploads collected events |
| 12 | Any | Any | Any | C (Black box) | **B — Proxy-operator** | L2 | No code execution on device → proxy always |

---

## Tie-breakers (apply in order when no row matches exactly)

1. **Q4 = Black box** → B, regardless of everything else.
2. **Q2 = Air-gap AND Q3 = Offline** → B with batch-relay note.
3. **Q1 = Cloud VM AND Q4 = Root** → A, regardless of Q3.
4. **Q3 = Relay OR Q3 = Offline** → B.
5. **Q1 = IoT sensor AND Q4 ≠ Root** → B.
6. **Q1 = Robot AND Q4 = Root** → A (add offline buffer note if Q3 ≠ Always).
7. **Anything else** → A.

---

## Edge cases

**Mixed fleet** (some machines root-accessible, some black-box):
→ Recommend B for the fleet as a whole. Operator manages all keys centrally.
Simpler operationally than running two architectures.

**Machine not built yet (Q4 = D)**:
→ Ask whether they plan to have root access. If yes → A. If uncertain → B (easier to migrate A→B later than B→A).

**Machine changes class over time** (dev device becomes production black-box):
→ Registration is permanent (machine ID and DID don't change). Architecture can migrate — A→B requires transferring the key to the operator. Flag this early.

**Q5 = C (KMS/hardware)**:
→ Acknowledge the instinct. v1 of this skill supports hot keys on testnet and mainnet only.
Provide the `GUIDE.md#admin-wallet-options` reference and offer a throwaway hot key for now with a rotation reminder.

---

## Output format for Phase 4 {#output-format-for-phase-4}

```
Recommended architecture: <A|B>

Why:
- <1-2 lines from matrix "Notes" column>
- <1 line on what the operator actually does differently>

Trust Level: <L1|L2>

Operationally:
- Where the SDK/CLI runs: <on-device (A) | operator host (B)>
- Who signs events: <machine EOA (A) | operator EOA (B)>
- Key custody: <machine holds its own key (A) | operator holds machine key (B)>

Runner-up: <B|A> — switch if <trigger condition from tie-breaker or edge case>
```

For Architecture C (Smart Account / ERC-4337): v2 — recommend A for now, can migrate later.
For Architecture D (Third-party attestation / Trust L3): v2 — onboard with A or B at L1/L2 for now.
