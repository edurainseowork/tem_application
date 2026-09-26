# ROADMAP.md

> **Current Phase**: Phase 2
> **Milestone**: v1.0 (7-Day MVP)

## Must-Haves (from SPEC)
- [x] Firebase Authentication setup
- [x] AWS Lambda API Backend & DB Schema
- [x] Secure content API endpoints
- [ ] Course Listing & Details UI integrated with Backend
- [ ] Razorpay checkout flow in Frontend
- [ ] Native WebViews for Vimeo and PDFs

## Phases

### Phase 1: Foundation (Architecture & APIs)
**Status**: ✅ Completed
**Objective**: Set up the project structure, dependencies, database schema, Firebase configuration, and Serverless AWS backend endpoints.
**Requirements**: REQ-01 (Auth), REQ-02 (APIs)

### Phase 2: Core Features (Frontend Integration)
**Status**: 🏃 In Progress
**Objective**: Connect the React Native app to the backend. Fetch courses, validate coupons, and initiate Razorpay checkout from the UI.
**Requirements**: REQ-03 (Checkout), REQ-04 (Course List)

### Phase 3: Content Delivery
**Status**: ⬜ Not Started
**Objective**: Implement the Unlocked (Post-Purchase) states. Embed Vimeo videos and PDF notes using WebViews. Build the MCQ quiz interface.
**Requirements**: REQ-05 (Content Consumption)

### Phase 4: Polish & Deploy
**Status**: ⬜ Not Started
**Objective**: Final UI polish, testing, and deployment. Deploy backend to AWS Lambda. Build Expo standalone apps for iOS & Android.
**Requirements**: REQ-06 (Deployment)
