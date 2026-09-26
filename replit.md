# StudySprint

StudySprint is a mobile learning app where students discover courses, unlock lessons, attend live classes, review recordings, read notes, and take weekly quizzes.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/study-sprint run dev` — run the Expo mobile preview
- `pnpm --filter @workspace/study-sprint run typecheck` — typecheck the mobile app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/study-sprint/app/` — Expo Router screens for authentication, dashboard, course detail, profile, and quizzes
- `artifacts/study-sprint/constants/data.ts` — local MVP course catalog and learning content fixtures
- `artifacts/study-sprint/context/AppContext.tsx` — persisted login and purchased-course state
- `artifacts/study-sprint/constants/colors.ts` — StudySprint theme tokens
- `artifacts/study-sprint/assets/images/` — generated app icon and course artwork

## Architecture decisions

- The first mobile build is frontend-first and uses AsyncStorage so the core student journey works without waiting on external service credentials.
- Course unlocks are represented locally, while notes, live sessions, and recordings open the native browser/WebView-compatible external destinations.
- Expo Router groups the primary experience into Home, Explore, and Profile tabs, with stack screens for course details and quizzes.

## Product

- Email-based onboarding with persisted student identity.
- Dashboard with JEE, NEET, Foundation, and All Courses discovery paths.
- Searchable course catalog and course detail pages with public/private coupon entry.
- Local purchase/unlock state that reveals notes, live classes, recordings, and weekly quizzes.
- Profile page with learning stats, active courses, and logout.

## User preferences

No additional preferences recorded.

## Gotchas

- External auth, Razorpay, AWS content APIs, Vimeo privacy, and live-class provider links are intentionally deferred from the first frontend MVP.
- Keep the mobile workflow running through the configured Expo workflow; do not launch Expo directly from the shell.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
