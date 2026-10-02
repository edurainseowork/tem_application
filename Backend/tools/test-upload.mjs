import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const BASE_URL = "http://localhost:5000/api";

const ADMIN_HEADER = {
  "Authorization": "Bearer test-admin",
  "Content-Type": "application/json",
};

const FACULTY_HEADER = {
  "Authorization": "Bearer test-faculty",
  "Content-Type": "application/json",
};

const STUDENT_HEADER = {
  "Authorization": "Bearer test-student",
  "Content-Type": "application/json",
};

async function run() {
  console.log("=== Testing S3 Presigned URL Upload Endpoint (POST /api/upload) ===");

  // 1. Test Unauthorized (No Token)
  console.log("\n1. Testing Unauthorized Request (No Token)...");
  const unauthRes = await fetch(`${BASE_URL}/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: "lecture-1.mp4",
      fileType: "video/mp4",
      courseId: "9",
    }),
  });
  console.log("No Token status:", unauthRes.status);
  if (unauthRes.status !== 401) {
    throw new Error(`Expected 401 for missing token, got ${unauthRes.status}`);
  }
  console.log("✓ Correctly rejected unauthenticated request with 401");

  // 2. Test Student Forbidden
  console.log("\n2. Testing Student Role Forbidden...");
  const studentRes = await fetch(`${BASE_URL}/upload`, {
    method: "POST",
    headers: STUDENT_HEADER,
    body: JSON.stringify({
      fileName: "lecture-1.mp4",
      fileType: "video/mp4",
      courseId: "9",
    }),
  });
  console.log("Student status:", studentRes.status);
  const studentData = await studentRes.json();
  console.log("Student response:", studentData);
  if (studentRes.status !== 403) {
    throw new Error(`Expected 403 for student, got ${studentRes.status}`);
  }
  console.log("✓ Correctly blocked student from upload with 403");

  // 3. Test Invalid MIME Types
  console.log("\n3. Testing Disallowed MIME Types...");
  const invalidMimes = ["image/gif", "text/plain", "application/javascript", "audio/mp3", "application/zip"];
  for (const mime of invalidMimes) {
    const invalidRes = await fetch(`${BASE_URL}/upload`, {
      method: "POST",
      headers: ADMIN_HEADER,
      body: JSON.stringify({
        fileName: "malicious.exe",
        fileType: mime,
        courseId: "9",
      }),
    });
    console.log(`MIME "${mime}" status:`, invalidRes.status);
    if (invalidRes.status !== 400) {
      throw new Error(`Expected 400 for invalid MIME ${mime}, got ${invalidRes.status}`);
    }
  }
  console.log("✓ Correctly rejected invalid MIME types with 400");

  // 4. Test Valid MIME Types for Presigned URL Generation
  console.log("\n4. Testing Allowed MIME Types for S3 Presigned URL Generation...");
  const allowedTestCases = [
    { fileName: "notes.pdf", fileType: "application/pdf", courseId: "9" },
    { fileName: "lecture.mp4", fileType: "video/mp4", courseId: "9" },
    { fileName: "clip.mov", fileType: "video/quicktime", courseId: "9" },
    { fileName: "recorded.mkv", fileType: "video/x-matroska", courseId: "9" },
  ];

  for (const testCase of allowedTestCases) {
    const presignedRes = await fetch(`${BASE_URL}/upload`, {
      method: "POST",
      headers: FACULTY_HEADER,
      body: JSON.stringify(testCase),
    });
    console.log(`\nTesting ${testCase.fileType} (${testCase.fileName})...`);
    console.log("Status:", presignedRes.status);
    if (presignedRes.status !== 200) {
      const errBody = await presignedRes.text();
      throw new Error(`Expected 200 for ${testCase.fileType}, got ${presignedRes.status}: ${errBody}`);
    }

    const data = await presignedRes.json();
    console.log("Response Keys:", Object.keys(data));
    console.log("uploadUrl:", data.uploadUrl?.slice(0, 80) + "...");
    console.log("key:", data.key);
    console.log("fileUrl:", data.fileUrl);

    // Validate presence of required keys
    if (!data.uploadUrl || !data.key || !data.fileUrl) {
      throw new Error("Missing required fields (uploadUrl, key, fileUrl) in response");
    }

    // Validate key format: courses/${courseId}/${Date.now()}-${fileName}
    if (!data.key.startsWith(`courses/${testCase.courseId}/`)) {
      throw new Error(`Key does not match courses/${testCase.courseId}/ format: ${data.key}`);
    }
    if (!data.key.includes(testCase.fileName)) {
      throw new Error(`Key does not include fileName: ${data.key}`);
    }

    // Validate expiration: 15 minutes (900 seconds) in presigned URL
    if (!data.uploadUrl.includes("X-Amz-Expires=900")) {
      throw new Error("Presigned URL does not specify 15-minute expiration (X-Amz-Expires=900)");
    }

    // Security check: ensure NO secrets leaked in response
    const jsonStr = JSON.stringify(data);
    if (
      jsonStr.includes("test-secret-access-key") ||
      jsonStr.includes("secretAccessKey") ||
      (process.env.AWS_SECRET_ACCESS_KEY && jsonStr.includes(process.env.AWS_SECRET_ACCESS_KEY))
    ) {
      throw new Error("CRITICAL SECURITY VIOLATION: AWS secrets leaked in client response!");
    }
  }

  console.log("\n✓ All allowed MIME types successfully generated valid S3 Presigned URLs!");
  console.log("✓ 15-minute expiration verified (X-Amz-Expires=900)!");
  console.log("✓ S3 Key formatting verified: courses/${courseId}/${Date.now()}-${fileName}!");
  console.log("✓ Security verification passed: zero credentials or secrets exposed to client!");
  console.log("\n=== ALL S3 UPLOAD TESTS PASSED SUCCESSFULLY ===");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
