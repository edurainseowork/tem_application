# DECISIONS.md

## 2026-09-27 - Backend Architecture
- **Decision**: Wrap existing Express backend with `serverless-http` to run on AWS Lambda.
- **Rationale**: Meets the PRD requirement for AWS Lambda while avoiding a complete rewrite of the existing routing structure.

## 2026-09-27 - Frontend Authentication
- **Decision**: Use Firebase JS SDK in the Expo app instead of a custom backend authentication system.
- **Rationale**: Faster implementation, explicitly requested in PRD, handles OTP/Email seamlessly.
