# Osnovanie — «Основание», The Foundation

*English version. Русская версия: [README.ru.md](README.ru.md).*

**Who it is for.** For someone who wants to put their life in order and hold that order themselves, without a supervisor: to do daily what builds them up, and not do what tears them down. The app is private — it is not about competing with anyone and not about reporting to anyone.

It solves three problems.

**Discipline.** The day has a structure: a morning, an evening and a night ritual. The bot delivers each one inside its own window — not into a feed you have to open, but into a chat where the ritual is closed with a single tap. The daily quota adapts to how the person is actually doing: after missed days it drops to the minimum so there is something to start from, and on a steady streak it grows. Three shells — Body, Mind and Spirit — grow from action and decay from idleness, and overall Strength is computed so that pumping one shell and coasting on it is impossible.

**Restraint.** Part of the practice is *not* doing. The Fast sets an eating window and a set of prohibitions for a fixed term, and while it runs the interface desaturates itself to bone monochrome: the app cuts its own sensory reward instead of only demanding abstinence elsewhere. Tomorrow's Declaration passes through a validator that rejects items about idleness, consumption and pleasure. A lapse is recorded as experience and does not take away a level — there is no punishment here, only return.

**Internalization.** The Philosophy of the Foundation is not a reference you read once. Its theses are broken into cards and come back through spaced repetition: a card shows the opening of a thesis and reveals the text only after an attempt to recall it; what is forgotten returns tomorrow, what is remembered returns ever more rarely. Alongside it, the Trace: a spiral of lived days where the brightness of each point is that day's Strength, plus a weekly Scroll. The point is for the text to stop being text and to become the thing a person acts from without deliberating.

**What it looks like.** Telegram-first: the bot is the main entry point, and the morning and night rituals are closed right inside the chat. The Mini App opens for what does not fit in a chat: Declaration, Silence, Fast, Canon, Scroll, Trace. A session ends when the ritual is done — there is no infinite feed, by construction.

The mechanics are derived from [the Philosophy of the Foundation](Философия%20Основания/Философия%20Основания.md) — an Obsidian vault kept in the repository (in Russian). The vault is also the data source for the Canon section: its texts are imported into the database and take part in spaced repetition. If you want to know *why* a mechanic works the way it does, the answer is there; what follows is *how* it is built.

## Stack

| Layer | What |
|---|---|
| App | Next.js 15 (App Router, RSC), React 19, TypeScript 5.9 |
| Styling | Tailwind v4 (via `@tailwindcss/postcss`) |
| Database | Neon Postgres, Prisma 6 (`DATABASE_URL` — pooler, `DIRECT_URL` — migrations) |
| Auth | Telegram initData / Login Widget → own JWTs via `jose` |
| Telegram | Bot API called directly with `fetch` — no wrapper library |
| Tests | Vitest (unit), Playwright + sharp (visual checks) |
| Hosting | Vercel, region `fra1` |

Dependencies are kept deliberately few: in serverless every extra one adds to cold start. The Bot API wrapper is fifty own lines in [lib/bot/api.ts](lib/bot/api.ts), because exactly five methods are used.

## Architecture

**There is no worker.** Vercel has no long-lived process, so the schedule is an HTTP endpoint — [app/api/cron/rituals/route.ts](app/api/cron/rituals/route.ts) — pinged every 15 minutes by an external service (cron-job.org) passing `CRON_SECRET`. One tick does two things: it lays the ritual windows that have come due into a queue, and it sends whatever is sitting in that queue.

**The queue is a table.** `OutboxMessage` with a unique `dedupeKey`: overlapping ticks physically cannot send a ritual twice. Missed windows are not replayed later. Queue state is inspected with `npm run outbox`.

**The bot is webhook-only.** There is no polling (there would be nobody to poll). Incoming updates are handled by [app/api/bot/route.ts](app/api/bot/route.ts), with the signature verified against `X-Telegram-Bot-Api-Secret-Token`. The webhook is bound with `npm run bot:webhook -- set`.

**Two entrances, one account.** The Mini App sends `initData`, the browser sends a Login Widget payload; the two use different signing schemes (see [lib/auth/telegram.ts](lib/auth/telegram.ts)) but resolve to the same user. A session is a short access JWT (15 min) plus a long rotating refresh token; the access token is accepted both from a cookie and from `Authorization`, because inside the Telegram webview third-party cookies may be blocked.

**Domain logic is separate from screens.** Everything that computes state — shell levels, Strength as a harmonic mean, Pain, the daily quota, repetition intervals — lives in `lib/core/` as pure functions covered by unit tests. API routes only read the database, call those functions and write the result back.

## Layout

```
app/                     screens (RSC) and API routes
  api/                   akt, blago, put, dar, tishina, post, slovo,
                         settings, osnashenie, auth, bot, cron, health, version
components/
  triquetra/             the Triquetra SVG engine — geometry and fill
  <section>/             client components for the matching screens
lib/
  core/                  domain logic: shells, Strength/Pain, scheduling, SRS
  canon/                 parsing the Obsidian vault into the Canon, links, relevance
  auth/                  Telegram signature verification, sessions
  bot/                   Bot API and message copy
  sections.ts            the section map — source for the bottom bar and «Sections»
prisma/schema.prisma     data model
scripts/                 maintenance scripts (see below)
Философия Основания/     the source Obsidian vault
docs/                    work plan and the deliberately-deferred list (in Russian)
```

Routes and domain terms are transliterated Russian: `akt` — Act, `blago` — Blessing, `put` — Path (the Declaration), `dar` — Gift, `tishina` — Silence, `post` — Fast, `slovo` — Word of the Day, `osnashenie` — Equipping, `kanon` — Canon, `razdely` — Sections, `nastroyki` — Settings.

The Triquetra ([components/triquetra/geometry.ts](components/triquetra/geometry.ts)) is not a picture but a computed instrument: three circles of radius `R = 1` with centres on a radius of `D = 0.86`. The condition `R > D` is mandatory — it pushes the inner end of each petal past the centre and creates the shared core. The coordinates are derived in code and covered by tests.

## Getting started

```bash
npm install                 # postinstall runs prisma generate for you
cp .env.example .env        # fill in Neon, the bot token, JWT_SECRET, CRON_SECRET
npx prisma migrate dev
npm run canon:import        # load the Canon from the vault into the DB (idempotent)
npm run dev
```

The minimum for local work is `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`. The Telegram variables are only needed if you are touching the bot or sign-in; `NEXT_PUBLIC_APP_URL` over http is allowed for localhost only — Telegram requires HTTPS.

Running the bot locally needs a public HTTPS tunnel: `npm run bot:webhook -- set https://<tunnel>`. With no arguments, `npm run bot:webhook` reports whose token this is and where the webhook currently points.

The `.githooks/pre-commit` hook bumps the patch version in `package.json` on every commit (the version is shown at the bottom of the app). Enable it once: `git config core.hooksPath .githooks`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | the usual Next.js cycle |
| `npm test` | 282 unit tests: geometry, domain logic, Canon parsing |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | `prisma migrate dev` — migrate the dev database |
| `npm run db:migrate` | `prisma migrate deploy` — migrate production |
| `npm run canon:import` | import the vault into the database |
| `npm run canon:report` | Canon contents, thesis volume, broken links |
| `npm run outbox [-- days]` | what was sent, what is stuck, what it tripped on |
| `npm run bot:webhook -- [info\|set\|delete] [url]` | webhook status and binding |
| `npm run check:* -- <url>` | end-to-end checks in a real browser |
| `npm run shot -- <url> <file.png>` | screenshot a screen |

`check:*` are Playwright checks run against a live app, one per section (`fill`, `artifact`, `zavety`, `put`, `sled`, `duhdar`, `tishina`, `post`, `fasting`, `slovo`, `cron`, `bot`, `settings`, `osnashenie`). They catch a class of bug unit tests cannot: the Triquetra fill math can be correct while what breaks is the coordinate system a browser resolves `<mask>` contents in. These checks look at pixels.

## Status and what's next

The section map and the state of each section live on the «Sections» page in the app, built from [lib/sections.ts](lib/sections.ts). The order of work, the decisions taken and the risks are in [docs/plan.md](docs/plan.md); what has been deliberately left undone, and why, is in [docs/vperedi.md](docs/vperedi.md). Both documents are in Russian.
