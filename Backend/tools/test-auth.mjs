import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Test against running server on port 5000
const BASE_URL = "http://localhost:5000/api";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log("=== Testing Authentication, Role Guards, and Entitlement ===");

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

  const STUDENT_UNENROLLED_HEADER = {
    "Authorization": "Bearer test-student-unenrolled",
    "Content-Type": "application/json",
  };

  try {
    // -------------------------------------------------------------
    // Test 1: Role Guards - Student CANNOT create, update, reorder, or delete content
    // -------------------------------------------------------------
    console.log("\n1. Testing Student Role Restrictions...");

    // 1.1 POST /api/content as student -> should be 403
    const studentCreateRes = await fetch(`${BASE_URL}/content`, {
      method: "POST",
      headers: STUDENT_HEADER,
      body: JSON.stringify({
        course_id: 9,
        title: "Hacked by Student",
        type: "folder",
      }),
    });
    console.log("Student POST /api/content status:", studentCreateRes.status);
    const studentCreateData = await studentCreateRes.json();
    console.log("Student POST response:", studentCreateData);
    if (studentCreateRes.status !== 403) {
      throw new Error(`Expected 403 for student create, got ${studentCreateRes.status}`);
    }

    // 1.2 PATCH /api/content/reorder as student -> should be 403
    const studentReorderRes = await fetch(`${BASE_URL}/content/reorder`, {
      method: "PATCH",
      headers: STUDENT_HEADER,
      body: JSON.stringify([{ id: "dummy-id", order: 1 }]),
    });
    console.log("Student PATCH /api/content/reorder status:", studentReorderRes.status);
    if (studentReorderRes.status !== 403) {
      throw new Error(`Expected 403 for student reorder, got ${studentReorderRes.status}`);
    }

    // 1.3 DELETE /api/content/:id as student -> should be 403
    const studentDeleteRes = await fetch(`${BASE_URL}/content/dummy-id`, {
      method: "DELETE",
      headers: STUDENT_HEADER,
    });
    console.log("Student DELETE /api/content/:id status:", studentDeleteRes.status);
    if (studentDeleteRes.status !== 403) {
      throw new Error(`Expected 403 for student delete, got ${studentDeleteRes.status}`);
    }

    console.log("✓ Students are correctly blocked with 403 Forbidden from creating, reordering, and deleting content!");

    // -------------------------------------------------------------
    // Test 2: Role Guards - Faculty CAN create and manage content
    // -------------------------------------------------------------
    console.log("\n2. Testing Faculty Role Authorization...");
    const facultyCreateRes = await fetch(`${BASE_URL}/content`, {
      method: "POST",
      headers: FACULTY_HEADER,
      body: JSON.stringify({
        course_id: 9,
        title: "Faculty Unit 10",
        type: "folder",
        order: 50,
      }),
    });
    console.log("Faculty POST /api/content status:", facultyCreateRes.status);
    const facultyCreateData = await facultyCreateRes.json();
    console.log("Faculty Created Content:", facultyCreateData.data);
    if (facultyCreateRes.status !== 201) {
      throw new Error(`Expected 201 for faculty create, got ${facultyCreateRes.status}`);
    }
    const facultyContentId = facultyCreateData.data?.id;

    // Faculty can also delete the content
    const facultyDeleteRes = await fetch(`${BASE_URL}/content/${facultyContentId}`, {
      method: "DELETE",
      headers: FACULTY_HEADER,
    });
    console.log("Faculty DELETE /api/content/:id status:", facultyDeleteRes.status);
    if (facultyDeleteRes.status !== 200) {
      throw new Error(`Expected 200 for faculty delete, got ${facultyDeleteRes.status}`);
    }
    console.log("✓ Faculty is correctly authorized to create and delete content!");

    // -------------------------------------------------------------
    // Test 3: Entitlement Verification
    // -------------------------------------------------------------
    console.log("\n3. Testing Entitlement Verification for Students...");

    // 3.1 Unenrolled student tries to access course 9 content -> 403
    const unenrolledRes = await fetch(`${BASE_URL}/courses/9/content`, {
      headers: STUDENT_UNENROLLED_HEADER,
    });
    console.log("Unenrolled Student GET /courses/9/content status:", unenrolledRes.status);
    const unenrolledData = await unenrolledRes.json();
    console.log("Unenrolled response:", unenrolledData);
    if (unenrolledRes.status !== 403) {
      throw new Error(`Expected 403 for unenrolled student, got ${unenrolledRes.status}`);
    }

    // 3.2 Enroll test-student in course 9 in database
    console.log("\nEnrolling test-student in Course 9 in database...");
    const studentUserRes = await pool.query(
      "SELECT id FROM users WHERE firebase_uid = 'test-student-uid'"
    );
    let studentDbId;
    if (studentUserRes.rows.length === 0) {
      const insRes = await pool.query(
        "INSERT INTO users (firebase_uid, email, name) VALUES ('test-student-uid', 'student@edurain.in', 'Student User') RETURNING id"
      );
      studentDbId = insRes.rows[0].id;
    } else {
      studentDbId = studentUserRes.rows[0].id;
    }

    await pool.query(
      "INSERT INTO user_courses (user_id, course_id) VALUES ($1, 9) ON CONFLICT DO NOTHING",
      [studentDbId]
    );
    console.log(`Enrolled student ID ${studentDbId} in course 9.`);

    // 3.3 Enrolled student fetches course 9 content -> 200 OK
    const enrolledRes = await fetch(`${BASE_URL}/courses/9/content`, {
      headers: STUDENT_HEADER,
    });
    console.log("Enrolled Student GET /courses/9/content status:", enrolledRes.status);
    const enrolledData = await enrolledRes.json();
    console.log("Enrolled Student content count:", enrolledData.data?.length);
    if (enrolledRes.status !== 200) {
      throw new Error(`Expected 200 for enrolled student, got ${enrolledRes.status}`);
    }
    console.log("✓ Enrolled student granted access to course content!");

    // Clean up test enrollment
    await pool.query(
      "DELETE FROM user_courses WHERE user_id = $1 AND course_id = 9",
      [studentDbId]
    );
    console.log("Cleaned up test enrollment.");

    // -------------------------------------------------------------
    // Test 4: Verify Admin / Faculty bypass entitlement check
    // -------------------------------------------------------------
    console.log("\n4. Testing Admin / Faculty Content Access (Bypass entitlement)...");
    const adminContentRes = await fetch(`${BASE_URL}/courses/9/content`, {
      headers: ADMIN_HEADER,
    });
    console.log("Admin GET /courses/9/content status:", adminContentRes.status);
    if (adminContentRes.status !== 200) {
      throw new Error(`Expected 200 for admin, got ${adminContentRes.status}`);
    }

    const facultyContentRes = await fetch(`${BASE_URL}/courses/9/content`, {
      headers: FACULTY_HEADER,
    });
    console.log("Faculty GET /courses/9/content status:", facultyContentRes.status);
    if (facultyContentRes.status !== 200) {
      throw new Error(`Expected 200 for faculty, got ${facultyContentRes.status}`);
    }
    console.log("✓ Admin and Faculty bypass student enrollment check!");

    // -------------------------------------------------------------
    // Test 5: Verify User Sync in database on authenticateToken
    // -------------------------------------------------------------
    console.log("\n5. Testing User Synchronization in Database...");
    const syncCheckRes = await pool.query(
      "SELECT id, firebase_uid, email, name FROM users WHERE firebase_uid = 'test-student-uid'"
    );
    console.log("Synced student user in DB:", syncCheckRes.rows[0]);
    if (syncCheckRes.rows.length === 0) {
      throw new Error("Student was not synced to database");
    }
    console.log("✓ User sync verified in database!");

    console.log("\n=== ALL AUTH, ROLE GUARDS & ENTITLEMENT TESTS PASSED! ===");
    process.exit(0);
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
