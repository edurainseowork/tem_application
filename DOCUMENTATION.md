

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
