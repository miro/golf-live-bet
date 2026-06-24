# AGENTS.md

Agent operating contract for this repo. Read this first, every session. It is intentionally short — it points to the durable sources of truth and states the rules that must hold while generating code. When in doubt, the spec wins over this file, and this file wins over your defaults.

## What this project is

**Live Bet** — a real-time, fake-money betting app for the Golf Company friend group. Players on a golf course log notable events; remote observers bet imaginary coins on the outcomes via parimutuel pools that open and close live. No real money, ever. The product only works if the *live moment* feels live, so realtime correctness is the spine of the whole thing.

## Sources of truth (read before writing code)

- **`specs/live-bet/spec.md`** — the durable spec. Defines *how the system works* (Blueprint) and *how we know it works* (Contract). This is authoritative for the data model, invariants, tech stack, and behavior. It is a living document: if implementation teaches you something, update the spec in the same commit.
- **`pbis/pbi-001-live-bet-mvp.md`** — the current unit of work (the Delta). Defines what we are building *now* and the build order. Do only what the active PBI scopes.

If anything here conflicts with the spec, the spec is correct and this file should be fixed.

## Hard invariants — NEVER violate (from the spec's Contract)

These are non-negotiable. Generated code that breaks any of these is wrong, even if it "works":

- **INV-sealed-value** — a measured market's value is never readable through any interface (API, preview, debug, the reporting player's own client) before the market closes.
- **INV-simultaneous-close** — market close is authoritative on the **server clock** and identical for all observers. Client countdowns are display-only and must never close a market.
- **INV-no-late-bets** — no bet is accepted at or after the close instant.
- **INV-betting-knowledge-wall** — no one who could know an outcome may place a bet informed by it. (MVP enforces this bluntly: players cannot bet at all.)
- **INV-conservation** — total payout for a market ≤ pot + house seed. Coins are never minted.
- **INV-bankroll-scope** — bankroll is per-Round; never transfers between rounds.
- **INV-noninteger-line** — over/under lines are always non-integer (no exact-tie pushes).
- **INV-void-refund** — a measured market that closes with no value entered is voided and all stakes refunded.

## Anti-patterns — do NOT do these

- Do **not** build anything outside the active PBI's scope. No season standings, multi-tenant admin UI, score/Gamebook ingestion, player betting, top-up codes, challenges, or reactions feed — the schema has *seams* for some of these, but seams are not features.
- Do **not** close markets with client-side timers. Close fires from a Postgres function on the server clock.
- Do **not** render the live market board / bet entry / countdown as Server Components — these are client components (Supabase subscriptions, optimistic UI, timers). Server Components are for the static shell only.
- Do **not** hardcode event types in logic. Event types are data (`EventType` rows); behavior branches on `resolution_mode`.
- Do **not** let generated DB types drift — regenerate from the Supabase schema on every schema change and commit them.
- Do **not** mint coins or resolve payouts outside a single server-side transaction.

## Build discipline

- **Vertical slice first, scaffolding last.** Follow the build order in the active PBI. Prove the realtime spine (a market opening and closing simultaneously across two clients) before building polished UI, auth flows, or extra screens.
- **Scaffolding is not progress.** Do not generate the full schema + pretty screens before the core open→close→resolve loop pushes a live close to a second client.
- One PBI at a time. When it's done, update the spec with what was learned, then close the PBI.

## Tech stack (see spec §Architecture — tech stack for rationale)

- **Frontend:** Next.js 16 (App Router), TypeScript strict.
- **Backend:** Supabase — Postgres (data), Auth (Google OAuth), Realtime **Broadcast** (database-driven, server-clock close). Not Postgres Changes.
- **Types/validation:** generated Supabase types + Zod for runtime invariant guards.
- **UI:** Tailwind CSS + shadcn/ui. Phone-first (players on course, observers on phones).
- **Hosting:** Vercel (frontend) + Supabase (backend).

## Repo conventions

- **Conventional Commits** (`feat:`, `fix:`, `chore:`, etc.). Each commit that changes a contract updates `specs/live-bet/spec.md` in the same commit.
- Strict ESLint + Prettier must pass before a change is considered done.
- `specs/` and `pbis/` are first-class, version-controlled artifacts — keep them current, not decorative.

## Repo layout

```
/AGENTS.md                      # this file
/CLAUDE.md                      # pointer to this file
/specs/live-bet/spec.md         # durable spec (source of truth)
/pbis/pbi-001-live-bet-mvp.md   # current unit of work
/ (app code added during build)
```