# SPEC.md — Project Specification

> **Status**: `FINALIZED`

## Vision
Develop and launch a Minimum Viable Product (MVP) for an EdTech platform within a strict 7-day timeline. The application enables students to browse courses across categories, purchase access via Razorpay, and consume educational content (live classes, recorded videos, PDF notes, and weekly tests).

## Goals
1. Provide seamless user authentication via Firebase (Phone/OTP or Email/Password).
2. Allow students to browse and purchase courses across 4 categories (JEE, NEET, Foundation, All Courses).
3. Deliver secure content consumption (Vimeo for videos, AWS S3 for PDFs) integrated with AWS API Gateway + Lambda.
4. Support public and private coupon applications before checkout.

## Non-Goals (Out of Scope)
- Custom video players or complex PDF viewer engines. (Must rely on native WebViews and default iframes).
- Content management system (admin panel) for uploading courses.

## Users
Up to 300 active students in the initial 45-day deployment phase. Target users are students preparing for competitive exams like JEE and NEET.

## Constraints
- **Timeline**: 7-day strict deadline.
- **Security**: Vimeo domain-level privacy settings ("Hide from Vimeo" and "Embed only on specific domains") to protect content.
- **Tech Stack**: React Native (Expo) frontend, AWS (API Gateway + Lambda + DynamoDB/RDS) backend, Firebase Auth, Razorpay.

## Success Criteria
- [ ] Users can successfully authenticate via Firebase.
- [ ] Users can view and navigate the 4 primary categories.
- [ ] Users can successfully apply a coupon and complete a purchase via Razorpay.
- [ ] Users can exclusively access purchased content (videos, PDFs, tests).
- [ ] App can be deployed to iOS and Android successfully.
