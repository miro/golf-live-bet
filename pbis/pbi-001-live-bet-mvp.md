# PBI-001: Live Bet — first runnable slice (single measured + field-prop market)

> **Pattern:** [The PBI](https://asdlc.io/patterns/the-pbi) — a transient execution unit defining the **Delta** (what changes), pointing to permanent context (**The Spec**). Closed after merge; the spec persists.

| | |
|---|---|
| **References spec** | [`/specs/live-bet/spec.md`](../specs/live-bet/spec.md) — all rules, invariants, and the data contract live there; this PBI does not restate them |
| **Status** | Open |
| **Type** | Greenfield feature slice |
| **Closes when** | Acceptance criteria below pass and the spec is updated with any discoveries |

---

## Goal (the delta)

Stand up the **smallest end-to-end path** that produces the core experience defined in the spec's Context: one player input → a live market → remote observers bet blind → simultaneous close → parimutuel payout → leaderboard move. Prove the spine (realtime + sealed-value + parimutuel) on a real round.

This PBI delivers a *subset* of the spec. It does not narrow the spec; unbuilt parts remain valid future deltas.

## In scope for this delta

- **Both market types** from the spec: one `measured_pool` path (drive) and one `field_prop` path (e.g. bunker), since both share the one interaction shell and the field prop is cheap once the shell exists.
- **Observers bet; players do not** — the blunt enforcement of `INV-betting-knowledge-wall` for now.
- **Auth/join:** one-tap Google login → fast "join this round" → land on role screen. Low friction is itself under test (will players input at all).
- **Thin player input UI:** current-hole screen, data-driven event-type buttons, value entry for measured types. No score tracking, no hole navigation, no history.
- **Realtime delivery** of open/close/resolve to all observers (the spine — not negotiable, not deferrable).
- **Parimutuel resolution + house seed**, atomic bankroll updates.
- **Per-round leaderboard** that updates on resolution.
- **Minimal round setup:** seed/config, not a built admin UI.

## Explicitly NOT in this delta (deferred to later PBIs)

Score / Gamebook integration · season standings · multi-round series · admin CRUD product · players betting · top-up codes · challenges/disputes · reactions feed · multi-tenant product surface · peer/negative-event input UI (schema supports it; UI deferred). *Rationale and seams: see the spec's Anti-Patterns and Parking Lot.*

## Build order (vertical slice first, scaffolding last)

1. **Spine:** data contract (only what's needed) + the single measured over/under path, server-authoritative, with realtime open/close/resolve. Verify with two browser tabs as fake observers — no real UI yet.
2. **Money:** observer bet placement + parimutuel resolution + house seed + leaderboard.
3. **People:** thin player input UI + Google login + join flow.
4. **Second type:** add `field_prop` ("who did it") as a second `resolution_mode` reusing the shell.
5. **Real round:** run it live with the group. Observe. Update the spec with what reality teaches. Then — and only then — consider P1 work.

> Guard against the failure mode named in the spec discussion: do not build schema-in-full + pretty join screens before step 1's realtime loop pushes a live close to a second client. Scaffolding is not progress.

## Acceptance Criteria (delta-level; inherits all spec invariants)

The spec's Gherkin scenarios and INV-* guardrails all apply and must pass. In addition, this slice is done when:

- [ ] A player, freshly logging in via Google and joining the round, reaches their current-hole input screen in one short flow (no account-creation friction on the tee).
- [ ] Player taps the drive event → a measured over/under market is live to all connected observers within ~1s.
- [ ] Observers place over/under stakes; the entered distance is never visible to anyone until close (`INV-sealed-value`).
- [ ] At the fixed window end, the market closes for all observers at the same instant (`INV-simultaneous-close`), the value reveals, and the pool pays parimutuel with the house seed (`INV-conservation`).
- [ ] Player taps the bunker event → a `field_prop` market opens with the candidate field; observers pick a name; resolves to the true subject.
- [ ] A player attempting any bet is rejected (`INV-betting-knowledge-wall`, blunt form).
- [ ] A measured market closing with no value entered voids and refunds (`INV-void-refund`).
- [ ] The per-round leaderboard reflects resolved markets; no coins minted beyond seed.

## Blocking question (must resolve before step 1)

- **Realtime transport:** hosted pub/sub vs. websockets on own server. Decide alongside stack choice. This is the spine — pick the option fastest to a reliable simultaneous-close in the chosen stack. *(Owner: eng / Miro.)*

## Non-blocking tuning (resolve during build or after first round; fold into spec)

- Window durations (start: 60s measured, 30s field-prop).
- Starting bankroll size; house-seed size.
- Field-prop candidate scope: whole-group (default, simplest) vs. within-flight (tighter/funnier, needs flight grouping). Not a fairness requirement — observers lack visuals.

## On close

When merged: update `/specs/live-bet/spec.md` with anything implementation revealed (tuned durations, transport decision as context, edge cases found), then close this PBI. The spec carries the learning forward; this PBI does not persist.