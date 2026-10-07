# Edurain Platform

This is the main codebase for the Edurain platform. It contains the mobile app, the CMS admin portal, and the backend API server.

## Folders
- `artifacts/api-server`: The backend code (Node.js). It handles the database and APIs.
- `artifacts/cms-portal`: The admin dashboard for our team (React).
- `artifacts/study-sprint`: The mobile app for students (React Native).

## How to run the project locally

You need to run all three parts in separate terminal windows.

### 1. Run the Backend (API Server)
Open a terminal and type:
```
cd artifacts/api-server
npm install
npm run dev
```
This will start the server on http://localhost:5000. Keep this terminal open.

### 2. Run the CMS Portal (Admin Panel)
Open a new terminal and type:
```
cd artifacts/cms-portal
npm install
npm run dev
```
This will start the admin dashboard on http://localhost:5173. Keep this terminal open.

### 3. Run the Mobile App
Open a third terminal and type:
```
cd artifacts/study-sprint
npm install
npx expo start
```
This will start the Expo bundler. Press `w` to open it in a web browser, or use the Expo Go app on your phone to scan the QR code.

## Note
Make sure the backend is always running before you test the mobile app or the CMS, otherwise the data will not load.

## Recent Updates (Oct 7 - Gauransh's Profile & Coupon Update)
Gauransh has completed the **Profile Section** and fixed the **Coupon Bug**. 
**IMPORTANT:** Before running the backend, you must run the database extension/migration to add the new profile fields to your database. 
Run the following command in your terminal:
```bash
psql "$DATABASE_URL" -f shared/db/migrations/0005_user_profile.sql
```
*(Make sure to run this extension command carefully so the new profile features work without crashing).*
