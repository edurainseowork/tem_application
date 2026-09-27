
> **Project**: EdTech Mobile Application (MVP)
> **Timeline**: 7-Day Strict Deadline
> **Target Audience**: Up to 300 active students (Initial 45-day deployment)
> **Platform**: Mobile Application (iOS & Android)

## 1. Executive Summary
The objective is to develop and launch a Minimum Viable Product (MVP) for an EdTech platform within a strict 7-day timeline. The application will allow students to browse courses across four primary categories, purchase access using coupons and a payment gateway, and consume educational content (live classes, recorded videos, PDF notes, and weekly tests) within the app.

## 2. Technical Stack & Architecture (Hybrid Approach)
- **Frontend Framework**: React Native (using Expo for rapid development).
- **Authentication**: Firebase Authentication (Phone/OTP or Email/Password).
- **Backend & Database**: AWS (API Gateway + AWS Lambda + PostgreSQL via Drizzle ORM).
- **Asset Storage (PDFs/Images)**: AWS S3.
- **Video Hosting & Streaming**: Vimeo (for recorded lectures).
- **Live Classes**: Vimeo Live / Zoom Links / YouTube Live (Embedded).
- **Payment Gateway**: Razorpay.

## 3. Core Features (MVP Scope)

### 3.1 Authentication & Onboarding
- Firebase-based login/signup (Phone/OTP or Email/Password).
- User profile creation (Name, Standard, Goal - e.g., JEE/NEET).

### 3.2 Course Catalog & Navigation
- Four primary category tiles:
  1. JEE
  2. NEET
  3. Foundation (9th/10th)
  4. All Courses
- Course listing page with filters based on categories.
- Course Details Page: Syllabus, Instructor Info, Price, Demo Video.

### 3.3 Purchasing & Checkout Loop (Razorpay)
- **Coupons**: Support for two types of coupons:
  - *Public*: Displayed on the course page (e.g., "FESTIVE50").
  - *Private*: Distributed via WhatsApp/Email; user inputs the code.
- **Checkout Flow**: 
  - User selects a course.
  - User applies a coupon (API validation).
  - Price updates.
  - Razorpay checkout opens.
  - Payment success updates the database and unlocks the course.

### 3.4 Content Consumption (The "Unlocked" State)
Once purchased, the Course Details page transforms into a Learning Dashboard:
- **Video Player**: Vimeo iframe embedded in a React Native WebView.
- **Notes/PDFs**: Embedded using Google Docs Viewer in a WebView or direct download.
- **Live Classes**: A section showing upcoming live classes with direct external links (Zoom/YouTube).
- **Tests**: Simple MCQ interface utilizing native UI components.

## 4. Security & Content Protection
- Video content relies on Vimeo's domain-level privacy (embedded only on the verified domain).
- API endpoints are protected using Firebase UID verification.
- Razorpay webhook verification via HMAC SHA256 signature to prevent payment spoofing.

## 5. Non-Goals (Out of Scope for 7 Days)
- Custom Video Player Engine.
- Custom PDF rendering engine.
- Web version of the application.
- Complex gamification or social features.
- Admin portal (courses will be seeded directly into the database).
