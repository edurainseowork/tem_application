---
phase: 1
level: 2
researched_at: 2026-09-27
---

# Phase 1/2 Research: Backend Deployment & External Integrations

## Questions Investigated
1. How to deploy the existing Express backend to AWS Lambda?
2. How to integrate Razorpay securely in Node.js and React Native?
3. How to embed Vimeo videos and PDF notes in React Native without custom players?

## Findings

### AWS Lambda Deployment
To deploy an Express app to AWS Lambda without rewriting the routing logic, the `serverless-http` package is the industry standard. It wraps the Express app so it can consume AWS API Gateway events.
**Recommendation:** Use `serverless-http` with the Serverless Framework (`serverless.yml`).

### Razorpay Integration
Razorpay provides a Node.js SDK for creating orders (`POST /orders`). The frontend uses the order ID to open the Razorpay UI. Upon success, Razorpay returns a signature that must be validated on the backend using HMAC SHA256.
**Recommendation:** Implement `/razorpay/order` and `/razorpay/verify` endpoints. Use crypto module for signature verification. For the Expo frontend, standard web views or the `react-native-razorpay` library can be used, though native modules might require a custom dev client.

### Vimeo & PDF Embedding (React Native)
Building a custom video player or PDF engine in 7 days is out of scope. Expo provides `react-native-webview`. 
- **Vimeo:** Vimeo offers standard iframe embed codes. We can render an HTML string containing the iframe inside a WebView. Vimeo domain-level privacy will allow the video to play only if the `origin` matches.
- **PDFs:** S3 PDF URLs can be passed directly to the device browser or rendered inside a WebView using Google Docs Viewer (`https://docs.google.com/gview?embedded=true&url=<S3_URL>`).
**Recommendation:** Use `react-native-webview` for both.

## Decisions Made
| Decision | Choice | Rationale |
|----------|--------|-----------|
| AWS Backend | `serverless-http` | Preserves existing Express code, fastest path to AWS Lambda. |
| Payments | Razorpay SDK + Webhooks/Verify API | Standard, secure flow for Indian payments. |
| Content UI | `react-native-webview` | Avoids native module complexity, fits 7-day timeline constraint. |

## Patterns to Follow
- Use native WebViews instead of heavy custom UI components.
- Always verify Razorpay signatures on the backend, never on the frontend.
- Protect video URLs by validating Firebase UID before returning them.

## Dependencies Identified
| Package | Version | Purpose |
|---------|---------|---------|
| serverless-http | latest | AWS Lambda wrapper for Express |
| react-native-webview | latest | Rendering Vimeo and PDFs in Expo |

## Ready for Planning
- [x] Questions answered
- [x] Approach selected
- [x] Dependencies identified
