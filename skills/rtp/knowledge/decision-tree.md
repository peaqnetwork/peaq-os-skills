# RTP Decision Tree

Which role the user is in, which phase serves it, and what it costs. Ask the questions verbatim, one
at a time, waiting for a response before moving on.

---

## Q1 — Which side of the market are you on?

> "Are you putting a machine to work, hiring one, or paying operators for work already done?"

- **A: Putting a machine to work** — the user owns or operates a robot, drone, sensor, or vehicle
- **B: Hiring a machine** — the user is building an agent that needs physical work done
- **C: Paying operators** — the user runs a fleet and owes money to several parties
- **D: Both A and B** — a machine that both sells its own capacity and hires other machines

---

## Q2 — (Provider path only) How does the gateway reach your machine?

> "When someone hires your machine, how should the gateway tell it there's work?"

- **C1: An HTTPS endpoint I control** — a server, edge gateway, or cloud function that can accept a
  POST and return 200 within 10 seconds
- **C2: The machine is behind NAT / has no public address**
- **C3: I don't have anything running yet — I want to see the flow first**

---

## Q3 — (Provider path only) Does the machine have a peaqID?

> "Does this machine already have a peaqID — a `did:peaq:0x…` identifier?"

- **P1: Yes**
- **P2: No, but I have a wallet address for it**
- **P3: Neither yet**

---

## Q4 — (Buyer path only) Do you already know which machine you want?

> "Do you have a robot ID already, or do you need to find one?"

- **H1: I need to find one** — discovery required
- **H2: I have the robot ID** — straight to dispatch

---

## Q5 — (Payer path only) Where does the payout roster come from?

> "Do you have the list of addresses and amounts, or does it need to be built from completed tasks?"

- **B1: I have the list**
- **B2: Build it from tasks I've dispatched**
- **B3: I want to test the flow with a couple of addresses first**

---

## Recommendation matrix

| Q1 | Q2 | Route | First step | Cost to get started |
|----|----|-------|------------|---------------------|
| A | C1 | Provider — full | Phase 2 → Phase 3 → Phase 4 | free |
| A | C2 | Provider — polling | Phase 3, then explain no push delivery | free |
| A | C3 | Provider — dry run | Phase 3 with a placeholder endpoint, drive `complete` by hand | free |
| B | — | Buyer | Phase 5 | $0.005 to discover, $0.05 to dispatch |
| C | — | Payer | Phase 6 | free to validate, $0.001 to quote |
| D | C1 | Both | Phase 3 first (free), then Phase 5 | free to start |

---

## Tie-breakers

Apply in order when the answers don't land cleanly on a row:

1. **Free before paid.** If a user could plausibly start on the provider side, start there — it
   costs nothing and produces a working robot record they can point at.
2. **Wallet readiness decides the buyer path.** No funded USDC wallet and no Node runtime means the
   buyer path cannot complete. Say so before discovery, not after the first 402.
3. **C2 or C3 does not block registration.** Register anyway; the machine is discoverable and the
   connection can be changed later with a free `PATCH /robots/update`.
4. **A user who says "both" almost always means provider first.** Selling capacity is the side that
   needs no capital.
5. **If the user's real goal is paying people and robots are incidental**, go straight to Phase 6 —
   the batch payout works for any 200 addresses, whether or not they are RTP robots.

---

## Output format for the recommendation

```
Recommended path: <name>

  Why:        <one sentence tied to their answers>
  Start at:   Phase <n> — <phase name>
  Costs:      <what is free, what is paid, and how much>
  You'll need: <address / endpoint / wallet — only what this path actually requires>
```

Then ask: "Does this fit what you're trying to do?" Wait for their response. Options:
- A: Yes, let's go
- B: I'm actually on the other side of this
- C: I have questions first

Routing: A → the recommended phase · B → swap paths and re-confirm · C → answer, then re-confirm.

---

## Cost-first framing

Lead with cost whenever a path involves paid calls. Users arriving from the `/peaqos` skill are used
to flows where the only cost is gas, and RTP's per-call pricing is a different model.

| Action | Cost | Notes |
|--------|------|-------|
| Register a robot | free | Also update, complete, deregister |
| Discover robots | $0.005 | Per query, regardless of results |
| Dispatch a task | $0.05 | Only on an accepted dispatch — a `400`/`404`/`409` rejection is free |
| Poll a task | $0.002 | Per poll — use `callback_url` instead where possible |
| Read a profile | $0.002 | The only way to read back `metadata` |
| Validate a payout roster | free | Always do this first |
| Quote a batch | $0.001 | Mandatory before execute |
| Build a batch transaction | $0.02 | Plus 0.3% protocol fee, plus gas, on the payout itself |
