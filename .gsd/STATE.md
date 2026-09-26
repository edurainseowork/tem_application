# STATE.md

> Project Memory and Context

## Current Status
- Backend API structure is defined (Express + serverless-http).
- Database Schema (Drizzle + Postgres) is created.
- React Native (Expo) frontend has been decoupled from Replit dependencies.
- Firebase Auth is integrated in `AppContext.tsx`.

## Key Files
- `d:\EdTech-Learning-Hub\artifacts\api-server\src\lambda.ts`: Serverless entry point.
- `d:\EdTech-Learning-Hub\lib\db\src\schema\index.ts`: Database definitions.
- `d:\EdTech-Learning-Hub\artifacts\study-sprint\context\AppContext.tsx`: Auth state management.

## Open Threads
- Awaiting `.env` configuration for Razorpay, Firebase, and DB credentials.
- Need to integrate frontend screens with actual API calls instead of local mocked data.

## Last Session Summary
Codebase mapping complete.
- 4 components identified
- 4 dependencies analyzed
- 2 technical debt items found
