# Spec: Live Bet

> **Pattern:** [The Spec](https://asdlc.io/patterns/the-spec) — durable, spec-anchored source of truth.
> This document defines the **State** (how the feature works + how we know it works). It is *not* phase- or slice-scoped. Execution deltas live in PBIs (see `/pbis/`), which reference this spec and update it when they change a contract.

| | |
|---|---|
| **Feature** | Live Bet — real-time fake-money betting on live golf events |
| **Status** | Living · refined each implementation cycle |
| **Owner** | Miro |
| **Maturity** | Spec-anchored (kept alive after each task) |

---

## Context — why this feature exists

When the Golf Company group plays a round, anyone not physically present misses the live drama and learns the outcome hours later in WhatsApp. There is no way for a remote person to follow a round in real time or hold any stake in it.

**Live Bet** lets remote observers follow a round through a live stream of *betting moments*: a player on the course logs something notable, a parimutuel market opens with imaginary coins, observers bet while the outcome is unknown, the result is revealed, and the pool pays out. No real money is ever involved. The product hypothesis is that the moment of *having a stake in a real event you can't see, resolving live* is the thing that makes a round followable from afar.

### The core experience (the thing every contract below protects)

> A player taps that something notable is happening. Within ~1 second a remote observer's phone shows a live bet. The observer picks a side with fake coins while the outcome is still unknown. The result is revealed, the pool pays out, the leaderboard shifts — and the observer feels the jolt of a stake in a moment they couldn't see.

---

# BLUEPRINT (Design)

Implementation constraints. These prevent invalid architectures from being generated. *How the system is built.*

## Domain model & roles

| Role | Location | Inputs events? | Bets? |
|------|----------|----------------|-------|
| **Player** | On course | Yes — own and peer events | Governed by `INV-betting-knowledge-wall` |
| **Observer** | Remote, no course visuals | No | Yes |
| **Operator** | Anywhere | Configures a Round | Only by joining as an Observer |

**Information-separation principle (architectural foundation):** the set of people who *know* an event's outcome (players, physically present) and the set who *bet* on it (remote observers, who have no course visuals and no data feed that reveals these events) must remain disjoint for a market to be fair. Course events (bunkers, bad drives, drive distances) are *not* present in any external data source (e.g. Gamebook records strokes only), so this separation holds by construction as long as the betting-knowledge wall (below) is respected.

## Market types

All market types resolve to **one** observer interaction: *a window opens → pick a side → outcome revealed → pool pays.* This uniformity is a design constraint, not a coincidence — new event types must fit this shell.

### Measured over/under (e.g. drive, pin, putt)
- Opening the input opens a fixed-duration betting window.
- The measured value is entered during the window and **locked** on submit (no editing afterward). It is **sealed from observers** — invisible on every observer-facing surface (broadcast, API, bet view) until the window closes. The reporting player may see their own locked submission as confirmation.
- Observers bet **blind** over/under a **non-integer line** for the full window.
- At the fixed close, the window shuts for **all observers simultaneously**, the value is revealed, and the pool resolves.

### Field prop — "who did it" (e.g. bunker, bad drive)
- The event has already happened; the unknown (to remote observers) is *which player* it happened to.
- Reporting it opens a short window with the candidate field.
- Observers pick a player; the true subject is revealed at close; the pool resolves.

## Payout — parimutuel

All stakes for a market enter one pot. Winners split the pot **proportional to stake**. No house, no odds-setter; self-balancing. Each pool carries a small **house seed** so thin pools resolve sensibly and don't feel empty. No coins are ever minted beyond the seed.

## Architecture — data contract

The durable schema. Types are illustrative; the **relationships, scoping, and seams** are the contract. Any implementation must preserve these even if it builds only a subset.

```
Tenant            # org / group boundary
  id

Round             # one playing session
  id
  tenant_id        -> Tenant
  name
  status           # setup | live | closed
  created_at

User
  id
  tenant_id        -> Tenant
  display_name
  role             # default role; per-round role lives on Participant

Participant       # a User's involvement in one Round (role can differ per round)
  id
  round_id         -> Round
  user_id          -> User
  role             # player | observer
  bankroll         # coins, scoped PER ROUND

EventType         # DATA-DRIVEN: adding a type is a config row, not code
  id
  key              # "drive" | "pin" | "putt" | "bunker" | "bad_drive" | ...
  resolution_mode  # measured_pool | field_prop
  label
  active

Event             # something that happened on the course
  id
  round_id         -> Round
  type_id          -> EventType
  author_id        -> User      # who REPORTED it  (seam for peer/negative events)
  subject_id       -> User      # who it HAPPENED TO (may equal author)
  hole             # int, optional
  created_at
  sealed_value     # measured_pool only; locked on entry, NEVER served to observers before market close
  value_entered_at

Market            # a betting opportunity spawned by an Event
  id
  event_id         -> Event
  type             # over_under | field_prop
  line             # non-integer, for over_under
  opens_at
  closes_at        # opens_at + fixed window duration
  status           # open | closed | resolved | void
  house_seed
  resolved_outcome # null until resolved

Bet
  id
  market_id        -> Market
  participant_id   -> Participant
  selection        # "over" | "under"  OR  a player's id (field_prop)
  stake
  created_at
  payout           # null until resolved
```

### Dependency directions
- `Market` depends on `Event`; `Event` depends on `EventType` + `Round`. Never the reverse.
- `Bet` depends on `Market` + `Participant`. Resolution writes `Bet.payout` and `Participant.bankroll` atomically together.
- Realtime delivery is a transport concern layered *on top of* the model; the model is the source of truth, the transport never is.

## Architecture — tech stack

The chosen stack and the constraints each choice imposes. Recorded here (not in chat) so the rationale survives across sessions. Stack is durable state; replacing a layer is a contract change and updates this section.

| Layer | Choice | Why |
|-------|--------|-----|
| **Backend (data + auth + realtime)** | **Supabase** | One product covers all three. Real **Postgres** matches the relational data contract above directly. Google OAuth built in. Realtime **Broadcast** can fire from the database — the mechanism that makes `INV-simultaneous-close` honest. Open-source / self-hostable → low lock-in for a learning build. |
| **Realtime transport** | **Supabase Broadcast, database-driven** | Market open/close emitted from a Postgres function on the **server clock**, fanned out to all subscribers at once. *Not* Postgres Changes (Supabase steers to Broadcast for non-trivial use, and DB-driven broadcast is what enforces a single authoritative close instant). |
| **Frontend framework** | **Next.js 16 (App Router)** | Largest ecosystem → most Supabase-integration guidance and examples; lowest dead-end risk for a solo summer ship. |
| **Language** | **TypeScript, strict** | Required for the ASDLC typed-contract discipline; enables generated DB types below. |
| **Type-safe data layer** | **Generated Supabase types + Zod** | DB schema → generated TS types makes the §Architecture data contract compile-time-checked. Zod validates runtime invariants types can't catch (non-integer line, stake ≤ bankroll, bet-before-close). |
| **Styling / UI** | **Tailwind CSS + shadcn/ui** | Phone-first, fast, ubiquitous examples in the Next ecosystem; owned (not vendored) components. Token config is the future home for an Experience-Modeling design schema. |
| **Hosting** | **Vercel (frontend) + Supabase (backend)** | First-party Next host, zero-config, push-to-deploy. Backend hosted by Supabase separately. Lock-in reversible at this scale. |
| **Repo / governance** | **Single GitHub repo · conventional commits · strict ESLint + Prettier · `/specs` + `/pbis` in-repo** | The ASDLC "standardized parts" jigs for a solo dev: lint as mold, spec under version control, commits as provenance trail. |

### Stack-imposed constraints

- **Live screens are client components.** The realtime board, bet entry, and countdown are client-side (Supabase subscriptions, optimistic UI, timers). Use Next Server Components only for the static shell. Do **not** attempt to render the live market board as a Server Component.
- **The server clock is the only authority for time.** Window open/close times originate server-side (DB function); client countdowns are display-only and must never be trusted to close a market.
- **Generated DB types are regenerated on every schema change** and committed, so the data contract and the code cannot silently diverge.
- **Atomic resolution runs server-side** (Postgres function / transaction): compute parimutuel payouts and update all bankrolls in one transaction, satisfying `INV-conservation` and the `Bet`↔`Participant` atomicity in Dependency directions.

> Considered and rejected for the first build: **Convex** (excellent reactive DX but proprietary store, weaker fit for the relational contract and explicit server-clock close); **Firebase** (NoSQL fights the relational model and transactional parimutuel payouts); **TanStack Start** (best type-safety/methodology fit but RC-stage with thin Supabase guidance — too much risk for a summer ship). Revisit only if a layer's constraints stop holding.

## Anti-Patterns — what an implementation must NOT do

- **Do NOT expose a sealed value to any observer (or anyone who could bet on the market) before its market closes** — not via the broadcast, the API, or any "preview"/debug path. The reporting player seeing their *own* submitted value is fine; an observer seeing it is the violation.
- **Do NOT allow a submitted measured value to be edited after submit.** It locks on submit so it cannot be changed in response to betting activity.
- **Do NOT run betting close as per-client timers.** Close is a single server-clock event; all observers transition together.
- **Do NOT let event/market knowledge reach a live betting view** for anyone who could know the outcome (see `INV-betting-knowledge-wall`).
- **Do NOT mint coins.** Total payout ≤ pot + house seed, always.
- **Do NOT use integer over/under lines** (creates exact-tie pushes).
- **Do NOT hardcode event types in logic.** Types are data; behavior branches on `resolution_mode`.
- **Do NOT let bankroll cross rounds.** It is per-Round by design.
- **Do NOT build season standings, multi-tenant admin surfaces, or score ingestion into runtime logic** because the schema has seams for them — seams are for later PBIs, not present features.

---

# CONTRACT (Quality)

Verification rules that exist independently of any task. *How we know it works.*

## Definition of Done (feature-level, observable)

- A player can open an event input and a market becomes live to remote observers within ~1s.
- Observers can stake coins on an open market and cannot after it closes.
- Markets close simultaneously for all observers and resolve with correct parimutuel payouts.
- Bankrolls and a live leaderboard reflect resolved markets.
- No observer-facing path exposes a sealed value before close.

## Regression Guardrails (invariants — must NEVER break)

- **INV-sealed-value:** A measured market's value is never readable by any observer (or any participant who could bet on the market), through any interface, before `Market.closes_at`. The reporting player may see their own submitted value as confirmation. The value **locks on submit** and cannot be edited afterward.
- **INV-simultaneous-close:** Market close is authoritative on the server clock and identical for all observers.
- **INV-no-late-bets:** No bet is accepted at or after `Market.closes_at`.
- **INV-betting-knowledge-wall:** No participant who can know an event's outcome may place a bet informed by that knowledge. *(In the current MVP this is enforced bluntly: players do not bet at all. When players may bet between rounds in future, this invariant still holds — live-event knowledge must never reach a live betting view.)*
- **INV-conservation:** Sum of payouts for a market ≤ pot + house seed. No coins created.
- **INV-bankroll-scope:** Bankroll is per-Round and never transfers between rounds.
- **INV-noninteger-line:** Over/under lines are always non-integer.
- **INV-void-refund:** A measured market with no value entered by close is voided and all stakes refunded.

## Scenarios (Gherkin — behavior, not implementation)

```gherkin
Feature: Live Bet markets

  Scenario: Sealed value is never exposed to observers before close
    Given a measured market is open
    And the reporting player has entered and locked a value
    When an observer requests the market state
    Then the response does not contain the value
    Until the market has closed

  Scenario: Reporting player sees their own submitted value
    Given a measured market is open
    When the reporting player submits a value
    Then their own client confirms the submitted value
    And the value can no longer be edited

  Scenario: Betting closes simultaneously and rejects late bets
    Given a market with a fixed close time
    When the close time passes
    Then every observer's market transitions to closed at the same instant
    And any bet submitted at or after that instant is rejected

  Scenario: Parimutuel payout on a measured market
    Given a measured over/under market with stakes on both sides
    And a house seed in the pool
    When the value is revealed and the market resolves
    Then observers on the winning side split the pot proportional to their stake
    And the total paid out does not exceed the pot plus the seed

  Scenario: Field prop resolves to the correct subject
    Given a "who did it" market with observers picking different players
    When the true subject is revealed
    Then only observers who picked the true subject share the pot

  Scenario: Player cannot place a live bet
    Given a participant whose role in this round is player
    When they attempt to place a bet on an open market
    Then the bet is rejected

  Scenario: Void and refund when no value is entered
    Given a measured market
    When it closes with no value entered
    Then the market is voided
    And every stake is refunded to its participant's bankroll
```

---

## Living-spec maintenance

This spec is a **hypothesis, not a verdict** (Beck). Implementation completes it; it does not invalidate it. Each PBI that touches a contract updates this file in the same commit. Discoveries from real rounds (window-duration tuning, seed sizing, candidate-field scoping, pacing) are folded back here as refined constraints rather than left in chat or commit messages.

**Parking lot (future PBIs; seams exist, runtime does not):** peer/negative events as a primary engagement engine · disaster leaderboard · within-flight candidate scoping · anticipatory "in trouble" markets · admin top-up codes · dispute/challenge flow · multi-tenant platform surface · Gamebook score ingestion · players betting between rounds · season standings.