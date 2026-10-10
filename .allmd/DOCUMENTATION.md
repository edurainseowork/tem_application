## 1. System Overview & Architecture

The Edurain platform consists of three main components:
1. **Mobile App (Study Sprint)**: Built with React Native (Expo). This is the student-facing application.
2. **CMS Portal (React Web)**: Built with React & Vite. This is the admin dashboard used by the Edurain team to manage courses, content, banners, and students.
3. **Backend API (Node.js / Express)**: Built with Node.js, Express, and Drizzle ORM. It serves both the mobile app and the CMS portal. It is designed to be deployed on AWS using the Serverless Framework.

---

## 2. Third-Party Integrations

### **Firebase (Authentication)**
- **Purpose**: Managing user identities securely.
- **Frontend (App)**: Users log in using Firebase Authentication.
- **CMS Portal**: Admin access is restricted to specific allowed emails. Admins log in using Firebase Email/Password authentication.
- **Backend Flow**: The mobile app sends the Firebase `uid` to the backend when requesting protected content (like videos or notes). The backend verifies this `uid` in the database to confirm the user has purchased the course.

### **AWS (Hosting & Storage)**
- **Serverless Framework**: The backend is configured with `serverless.yml` to be deployed seamlessly to AWS Lambda and API Gateway. This ensures the API auto-scales based on traffic.
- **Media Storage**: Currently, course thumbnails and PDFs are handled via a local `/uploads` directory in development. In production, this should map to an AWS S3 bucket to serve media quickly via CloudFront.

### **MSG91 (Communications)**
- **Purpose**: Sending transactional SMS (like OTPs for login) and Emails (like payment receipts or welcome emails).
- **Integration**: MSG91 is triggered via simple REST API POST requests from the Node.js backend. 
- **Template Variables**: For example, when a user purchases a course, the backend sends an email using a predefined Template ID where `{VARIABLE_1_VALUE}` is the Course Name and `{VARIABLE_2_VALUE}` is the Student's Name.

### **Razorpay (Payments)**
- **Purpose**: Processing course purchases securely in INR.
- **Backend**: Generates a unique Razorpay Order ID.
- **App**: Opens the Razorpay checkout overlay. Upon success, sends the Payment ID and Signature back to the backend for verification before unlocking the course.

---

## 3. For Backend Engineers

**Tech Stack**: Node.js, Express, Drizzle ORM, PostgreSQL/SQLite.

### **Key Routes & Responsibilities**
- `GET /api/courses` & `GET /api/courses/:id`: Fetches course metadata for the App and CMS.
- `GET /api/content/:courseId`: Fetches protected folders, PDFs, and video links. It requires `?uid=...` (to verify purchase) or `?admin=true` (for CMS access).
- `POST /api/upload`: Handles multipart/form-data for uploading course thumbnails and class notes.
- `GET /api/stats`: Fetches the real-time active student count for the CMS dashboard.

### **Database Schema (`schema.ts`)**
- `usersTable`: Stores Firebase UID, Email, and Name.
- `coursesTable`: Stores Course metadata (Title, Price, Thumbnail).
- `courseContentTable`: Stores hierarchical content (Folders, PDFs, Vimeo Links). Uses `courseId` and `parentId` for folder nesting.
- `userCoursesTable`: Tracks which user purchased which course (includes Razorpay IDs).

*Note on Deletion*: The API is configured to delete dependent rows (like course content) before deleting a course to prevent Foreign Key Constraint errors.

---

## 4. For Frontend Engineers (Mobile App)

**Tech Stack**: React Native, Expo Router, Context API.

### **Key Concepts**
- **State Management**: The `AppContext.tsx` manages the global state, particularly the Firebase `User` object and the list of purchased course IDs (stored persistently via AsyncStorage).
- **Routing**: Expo Router is used. `(tabs)/home.tsx` is the main discovery feed.
- **Dynamic Content (`course/[id].tsx`)**:
  - Clicking a course fetches its details dynamically from `/api/courses/:id`.
  - If the user has purchased the course (checked via `isPurchased(course.id)`), it makes a second call to `/api/content/:courseId` to fetch and render the folder structure, PDFs, and Videos.
- **UI Design**: The app follows a strict glassmorphism aesthetic (translucent cards, blurred backgrounds, 1.618 golden ratio spacing) to maintain a premium feel.

---

## 5. CMS Portal Guide (What Admins Can Do)

The CMS Portal is available at `http://localhost:5173` and allows the admin team to operate the business without writing code.

**Available Features:**
1. **Dashboard Overview**: See total active courses and real-time registered student counts.
2. **Course Manager**: 
   - Add new courses with Title, Description, Price, Category, and Thumbnail.
   - Delete outdated courses securely.
3. **Content Manager (Post-Purchase)**:
   - Select a course and build a nested folder structure.
   - Upload PDF Notes and embed Vimeo Video links for recorded lectures.
4. **App Banners Manager**:
   - Upload up to 5 promotional banners. These instantly sync to the top carousel on the mobile app's Home Screen to notify students of new offers or live classes.
5. **Coupons (Pending API Hookup)**:
   - Generate private or public discount codes for students.

---

## Getting Started (Local Development)

1. **Backend**: `cd artifacts/api-server`, run `npm install`, then `npm run dev` (Runs on port 5000).
2. **CMS**: `cd artifacts/cms-portal`, run `npm install`, then `npm run dev` (Runs on port 5173).
3. **App**: `cd artifacts/study-sprint`, run `npm install`, then `npx expo start` (Runs on port 8081). 
*Ensure your `EXPO_PUBLIC_API_URL` in `.env` points to your backend IP.*

---

## 6. Recent Session Updates & Architectural Decisions (Oct 6 - Oct 7)

This section details recent updates to the codebase, explicitly documenting why certain decisions were made over alternatives, ensuring new developers understand the logic behind the code.

### 6.1 Banner Carousel Re-implementation (`Frontend/app/(tabs)/home.tsx` & `Frontend/components/Home/BannerCarousel.tsx`)
- **What was done:** The static `ScrollView` banner on the Home screen was replaced with a premium, auto-scrolling `BannerCarousel`.
- **Why this approach:** The application caters to students, requiring a modern, engaging, and lively UI rather than static images. We implemented an infinite loop using a clone pattern to ensure continuous scrolling without awkward rewinds.
- **Library Selection (`react-native-reanimated`):** We used `react-native-reanimated` for the pagination dots and layout animations instead of React Native's default `Animated` API.
- **Why not `Animated`?** The default `Animated` API throws a yellow warning when attempting to animate the `width` property using `useNativeDriver: true`. Without `useNativeDriver`, performance drops on slower devices. `reanimated` executes these layout calculations natively on the UI thread without triggering native driver warnings, ensuring smooth 60FPS performance.

### 6.2 In-App Content Viewer Restoration (`Frontend/app/course/[id].tsx`)
- **What was done:** Restored the "Open Curriculum" button and in-app file viewing functionality that had been accidentally overwritten in a previous merge.
- **The Problem:** A recent commit changed the behavior so that clicking on course materials (PDFs/Videos) inside `[id].tsx` called `Linking.openURL()`, redirecting the student to an external mobile browser like Chrome.
- **The Solution:** We reverted the `onPress` action of course items to instead trigger `router.push('/course/[id]/content')`.
- **Reasoning:** User Experience. Redirecting out of the app breaks immersion and risks losing the student's attention. By restoring the internal routing to `CourseContentScreen.tsx`, we enforce a sandboxed PDF reader and a protected video player directly within the app, which is a core requirement of a premium EdTech app.

### 6.3 Razorpay Integration & Code Merge Strategy (`Backend/src/routes/razorpay.ts` & `Frontend/components/Payment/RazorpayCheckout.tsx`)
- **What was done:** Merged the Razorpay Integration Pull Request (`razorpay-integration` branch) raised by developer Rohit into the `main` branch.
- **Why it was merged without conflicts:** Our recent UI fixes in `[id].tsx` were located in the *unlocked* curriculum section of the file. Rohit's checkout logic was perfectly isolated inside the *locked* ("Buy Now") section at the bottom of the same file. Git was able to cleanly merge these disjointed edits.
- **Architecture & Security Decision:** We deliberately kept `RAZORPAY_KEY_ID` and `RAZORPAY_SECRET` isolated in the backend's `.env` file.
  - *Why not put it in the frontend?* Exposing the Secret Key in the frontend `app.json` or `.env` is a massive security risk. Instead, Rohit's architecture dynamically passes the safe `keyId` from the backend to the frontend inside the `PaymentOrder` payload. This guarantees that API secrets never touch the client device.
- **Final Output:** The `main` branch is now the undisputed source of truth, completely synced, type-checked, and clear of warnings. We strictly follow the protocol of resolving everything in feature branches and only pushing highly polished code to `main`.

### 6.4 Comprehensive Developer Contributions & Architectural Decisions (Git History Analysis)
By analyzing the entire commit history across all developer branches (`main`, `rohit`, `shivankar_01`, `abhinavtest`, etc.), the following key features and architectural choices have been established:

#### A. Notifications & Alerts Architecture (Rohit)
- **Branch/Commits:** `6_oct_rohit_updated_code`, `rohit`
- **What was done:** Complete rewrite of the push notification system, covering both backend triggering and frontend state management.
- **Key Features & Logic Implemented:**
  1. **Notification Segmentation:** Created distinct logic and channels for *Public Messages* (General Admin Announcements sent to all users via CMS) versus *Live Classes* (Targeted notifications sent strictly to students enrolled in that specific course when a teacher goes live).
  2. **Auto-Refresh & Caching Threshold:** Implemented a smart memory management rule. If a student accumulates more than 20 unread notifications, the local state auto-refreshes to clear old cache and fetch the latest batch. This prevents memory bloat and keeps the app's notification bell counter accurate.
- **Decision:** Utilized **Expo Push Notification Services** rather than integrating native Firebase Cloud Messaging (FCM) or APNs directly.
- **Advantages:** Provides a unified, single-API push service that works instantly across iOS and Android without writing Swift/Kotlin code. The segmented logic ensures users aren't spammed with irrelevant messages.
- **Disadvantages:** Reliant on Expo's delivery servers, which may introduce marginal latency compared to direct APNs/FCM routing.

#### B. Direct AWS S3 Uploads (Shivankar)
- **Branch/Commits:** `shivankar_01`
- **What was done:** Configured the platform to store heavy media (Course Thumbnails, Profile Pictures) on AWS S3.
- **Decision:** Implemented **S3 Presigned URLs** for uploads instead of proxying file uploads through the Node.js Express backend.
- **Advantages:** Extremely scalable. The client (CMS or Mobile App) requests a secure temporary URL from the backend, then uploads the heavy file directly to Amazon's servers. This prevents the Node.js backend from crashing due to memory overload when multiple users upload files simultaneously.
- **Disadvantages:** Requires strict AWS IAM and CORS policy management.

#### C. Video Streaming Engine (Shivankar - In Progress)
- **Decision:** Using **Vimeo Embedding** for recorded course lectures instead of hosting raw `.mp4` files on AWS S3 or a custom server.
- **Advantages:** 
  1. **Adaptive Bitrate Streaming (HLS):** Vimeo automatically adjusts video quality (1080p, 720p, 480p) based on the student's internet speed, ensuring buffer-free playback. Building this manually on S3 is highly complex.
  2. **Anti-Piracy (DRM):** Vimeo allows domain-level restriction (e.g., videos only play inside `edurain.in` or the app's WebView), preventing students from easily downloading and sharing premium content.
- **Disadvantages:** Requires a paid Vimeo Pro/Business subscription.

#### D. Database ORM Choice (Core Architecture)
- **Decision:** The backend utilizes **Drizzle ORM** with PostgreSQL instead of Prisma or raw SQL.
- **Advantages:** Drizzle is exceptionally lightweight and provides strictly-typed SQL schemas in TypeScript. Unlike Prisma, Drizzle does not require a heavy Rust binary engine, making it infinitely better for deployment on AWS Lambda (Serverless) where cold-start times and package sizes are critical.

#### E. Package Manager Configuration (Core Architecture)
- **Commit:** `6e02e36 config: configure pnpm hoisted node-linker to flatten node_modules`
- **Decision:** Forced `pnpm` to use a hoisted (flattened) node-linker instead of its default symlinked structure.
- **Advantages:** React Native's Metro bundler is notoriously bad at resolving symlinks. Flattening the `node_modules` directory entirely eliminates "Module not found" errors during Expo physical device builds, ensuring all developers can compile the app without local environment bugs.

#### F. Profile Section & Coupon Engine (Gauransh)
- **What was done:** Completed the Profile Section UI and resolved complex coupon code application bugs (Oct 7).
- **Decision:** Built a dynamic, glassmorphism-based Profile dashboard and fixed backend validation logic for applying discounts during checkout.
- **Advantages:** Ensures a seamless user experience where students can view their details and accurately apply promotional codes before proceeding to the Razorpay gateway.
- **Disadvantages:** Coupon logic requires strict server-side validation to prevent users from forcing negative cart values.

---

## 7. Advanced Test & Quiz Portal Architecture (Finalized Oct 7)

This section outlines the finalized architecture for the upcoming Test/Quiz Portal, which is designed to handle high concurrency with strict anti-cheat measures.

### 7.1 Database Schema (Drizzle ORM)
- **`tests` Table:** Stores metadata (`id`, `title`, `batch_id`, `duration_minutes`). Crucially, it includes `publish_time` (timestamp) and `status` (DRAFT/SCHEDULED/PUBLISHED) to manage auto-live scheduling.
- **`questions` Table:** Stores the actual questions.
  - **Decision:** Options will be stored in a dynamic `JSON` column rather than static columns.
  - **Advantage:** Easily supports varied question formats (MCQ, Integer, Match the Following) without altering the database schema for every new question type.
- **`test_submissions` Table:** Stores the student's `total_score` and a JSON dump of their exact answers for later review by the admin.

### 7.2 CMS Uploading Strategy
- **Decision:** Teachers will use an **Excel/CSV Template** to bulk-upload questions via the CMS Portal instead of parsing raw PDFs.
- **Advantages:** PDF parsing is highly error-prone and loses formatting. A structured CSV ensures 100% accurate data entry into the database, allowing the mobile app to render a perfectly interactive UI.

### 7.3 Auto-Live Scheduling (Zero-Cron Approach)
- **Decision:** Instead of using expensive background workers (cron jobs) to "unlock" tests at a specific time, the scheduling is completely request-driven.
- **How it works:** The Admin schedules a test for a future date (e.g., Sunday 12:00 PM). When the Mobile App fetches available tests (`GET /tests/live`), the backend query filters out any tests where `publish_time > CURRENT_TIMESTAMP`. 
- **Advantage:** 100% automated, zero server load, and requires no manual admin intervention on the day of the test.

### 7.4 Frontend Features & Anti-Cheat System (React Native)
- **UI Design:** Each question type will have a dedicated UI Card (e.g., Radio buttons for MCQ, Numeric Keypad exclusively for Integer questions).
- **Anti-Screenshot:** Enforced via `FLAG_SECURE` in Android, completely blacking out screenshots and screen recordings.
- **App Minimization Trap (`AppState`):** 
  - **Decision:** We monitor React Native's `AppState` during active tests.
  - **Logic:** If a student attempts to background the app (to cheat using Google), they receive exactly one warning. On the second attempt, the test forcibly auto-submits, and a flag (`reason: "Cheating - App Minimized"`) is saved in the database for the Admin to review.
- **Auto-Submit Timer:** A client-side countdown timer that forcibly submits the test payload when it reaches zero, ensuring strict time compliance.

---

## 8. Recent Engineering Milestones & Architectural Decisions (Oct 9 - Oct 10)

This section documents the latest development sprint covering video streaming infrastructure, anti-piracy mechanisms, NTA-level exam security, and UI optimizations.

### 8.1 Bunny.net Stream Migration (Complete Vimeo Replacement)
- **The Problem:** The legacy Vimeo integration suffered from severe upload quota limits, cumbersome API authentication errors ("Something strange occurred. Please get in touch with the app's creator"), and sluggish transcoding times.
- **The Solution:** Fully transitioned the platform to **Bunny.net Stream** across Backend, CMS Portal, and Frontend.
  - **Backend (`Backend/src/routes/bunny.routes.ts`):** Implemented `/api/videos/initiate-upload` generating SHA-256 HMAC authorization signatures (`libraryId + apiKey + expirationTime + videoId`) and providing TUS endpoints.
  - **CMS Portal (`CMS-Portal/src/services/uploadService.ts`):** Implemented client-to-CDN direct resumable chunked uploads (5MB chunks) via the TUS protocol. Video payloads completely bypass the Node.js backend.
  - **Mobile Player (`Frontend/screens/CourseContentScreen.tsx`):** Seamless playback using Bunny’s responsive embed player (`iframe.mediadelivery.net/embed/775402/<videoId>`) inside React Native WebView.
  - **Dead Code Purge:** Completely deleted obsolete Vimeo route files (`vimeo.routes.js`, `vimeo.routes.d.ts.txt`) and scrubbed deprecated aliases to maintain a lean, maintainable codebase.

### 8.2 Dynamic Anti-Piracy Watermarking & Landscape Cinema Mode
- **What was done:** Built an unobtrusive, single-line floating watermark overlay for all video streams and PDF study documents.
- **Bug Fix (Duplicate Watermarks):** Previously, an injected JavaScript script created a DOM element inside the WebView while React Native rendered a native overlay simultaneously. We eradicated the DOM injection script, consolidating watermark rendering purely inside React Native with `numberOfLines={1}` and `pointerEvents="none"`.
- **Identity Display:** Displays the student's authenticated email and phone number in semi-transparent text to deter screen capture and leak re-distribution.
- **Landscape Cinema Mode:** Added an explicit toggle button in the video modal header that rotates the video 90 degrees (`width: windowHeight, height: windowWidth`) into a widescreen 16:9 cinema view while keeping the rest of the application portrait-locked.

### 8.3 NTA-Level Anti-Cheat Security System
- **Full-Screen Enforcement:** Exam screen hides all native headers (`headerShown: false`) and status bars (`<StatusBar hidden={true} />`). Hardware back navigation on Android is intercepted by `BackHandler` with a dedicated security warning modal.
- **Screen Capture Prevention (`FLAG_SECURE`):** Enforced via `expo-screen-capture` on Android and system-level protection on iOS, blacking out screenshots, screen recordings, and app-switcher thumbnails.
- **AppState Minimization Trap:**
  - **1st Attempt:** If a student minimizes the app, pulls down notifications, or switches to another app (e.g., to Google answers), the app detects the transition away from `active`. Upon return, a high-impact **Red Warning Modal** is triggered: *"Warning 1/2: Do not minimize the app."* The violation is timestamped and recorded in the database.
  - **2nd Attempt:** Immediate forced auto-submission with `submissionReason: "CHEATING_APP_MINIMIZED"`.
- **Admin Audit Trail in CMS (`CMS-Portal/src/pages/TestResults.tsx`):** Cheating submissions are prominently highlighted with a bold red badge (`🚨 Cheating - App Minimized`). Admins can inspect the student's exact violation count and individual minimization timestamps.

### 8.4 Course Card Thumbnail Aspect Ratio Optimization (`Frontend/app/(tabs)/explore.tsx`)
- **The Problem:** The course card image thumbnail in the Explore tab was previously formatted as a portrait rectangle (`96x116`). Standard course banners uploaded by educators (which are 16:9 or 4:3 landscape images like *"Class 12th Mathematics"*) were severely cropped on both sides.
- **The Solution:** Adjusted the thumbnail dimensions to a sleek landscape ratio (`130x86`, `resizeMode: 'cover'`). The outer card width remains locked to the screen width (`paddingHorizontal: 20`), the card height is more compact, and the text content comfortably shifts to the right, displaying full teacher graphics and text without clipping.

### 8.5 CMS Portal Content Manager Cleanup
- Removed the deprecated static "Create Weekly Test / Quiz" card below the course content file manager in `CMS-Portal/src/pages/App.tsx`.
- Updated the sidebar navigation label from `Upload Content (PDF/Video/Test)` to `Upload Content (PDF/Video)` to clearly reflect that tests are managed exclusively through the dedicated Test Manager module.

### 8.6 AWS Production Deployment & Security Fixes (Oct 10)
- **CMS & Backend Live:** The CMS Portal and Node.js Backend are now fully deployed and live on AWS Production.
- **VPC & NAT Gateway Implementation:** To ensure absolute security for database connections and third-party APIs, the Lambda function was placed inside an AWS Virtual Private Cloud (VPC) using a private subnet. A NAT Gateway was configured so the Lambda function retains internet access (for Firebase and Razorpay validations).
- **Lambda Build & Dependency Fixes:**
  - Resolved `ERR_MODULE_NOT_FOUND` on Lambda by modifying `build.mjs` to bundle `firebase-admin` and `@aws-sdk/*` directly into the `.zip` artifact. Since the Serverless Framework only ships `dist/` and ignores `node_modules/`, externalizing these packages caused runtime crashes.
  - Included `firebase-service-account.json` into the deployment package using `serverless.yml` `package.patterns` to ensure Firebase Authentication initializes successfully on AWS.
  - Resolved an `ENOENT` crash where Lambda attempted to create an `uploads` directory inside `/var/task/` (which is read-only). Directed the file upload module to use `/tmp/uploads` strictly during the AWS Lambda execution lifecycle.
- **Git Secrets Hardening:**
  - Prevented historical and future `.env` and `firebase-service-account.json` leaks by establishing a strict `.githooks/pre-commit` hook that blocks any staging of secret keys. Tracked artifacts in `.serverless/` were purged from the git index.

### 8.7 Multiple Admins System & RBAC (Rohit)
- **What was done:** Introduced the ability to assign and manage multiple admin users within the platform.
- **Features:** 
  - Admin roles allow the Edurain team to scale content management without sharing a single root credential. 
  - Each admin has isolated access, and actions are logged, but the dashboard unifies content visibility to ensure smooth operations. 

### 8.8 CMS Analytics Dashboard Upgrade
- **What was done:** Re-architected the CMS Landing Page (`CMS-Portal/src/pages/App.tsx`). 
- **Features:**
  - The CMS now boots directly into a comprehensive **Overview Dashboard** instead of the Course Manager.
  - Displays platform-wide statistics for Total Courses, Published Courses, Active Students, Total Categories, Hosted Videos/Content, Live Classes, Banners, and Coupons.
  - The `GET /api/stats` endpoint was enhanced to efficiently run aggregation `count()` queries across all relevant Drizzle ORM tables and serve this unified JSON payload to the React frontend.

### 8.9 Back-Exit App Warning (Mobile App UI)
- **What was done:** Implemented a hardware back-button listener to prevent accidental app exits.
- **UX Enhancement:** If a student presses the back button on the root home screen, a toast/warning says "Press back again to exit". The app only exits if the back button is pressed twice consecutively within a short time threshold. This conforms to standard Android premium app behaviors and reduces accidental drops in user engagement.

