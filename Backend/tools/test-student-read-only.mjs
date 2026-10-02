/**
 * Verification Test: Student Read-Only Access & Sandboxed In-App DRM Consumption
 * Matches PRD Sections 6.2, 6.3, 6.5, and 7
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const API_BASE = 'http://localhost:5000/api';
const STUDENT_TOKEN = 'test-student';
const UNENROLLED_STUDENT_TOKEN = 'test-student-unenrolled';
const COURSE_ID = '10';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function request(path, token = STUDENT_TOKEN, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, data };
}

async function verifyStudentAccess() {
  console.log('='.repeat(70));
  console.log('    STUDENT READ-ONLY CONSUMPTION & SANDBOX VERIFICATION');
  console.log('='.repeat(70));

  let studentDbId = null;

  try {
    // 1. Verify Unenrolled Student is blocked with 403 (PRD Section 12)
    console.log('\n[1/6] Verifying unenrolled student access is protected (GET /api/courses/10/content)...');
    const unenrolledRes = await request(`/courses/${COURSE_ID}/content?parentId=null`, UNENROLLED_STUDENT_TOKEN);
    assert.strictEqual(unenrolledRes.status, 403, 'Unenrolled student must receive 403 Forbidden');
    console.log('   ✓ Unenrolled student access correctly rejected with 403 Forbidden');

    // Setup active enrollment for test-student in Course 10
    console.log('\n[2/6] Setting up verified student enrollment in Course 10...');
    const userRes = await pool.query("SELECT id FROM users WHERE firebase_uid = 'test-student-uid'");
    if (userRes.rows.length === 0) {
      const insRes = await pool.query(
        "INSERT INTO users (firebase_uid, email, name, role) VALUES ('test-student-uid', 'student@edurain.in', 'Student User', 'student') RETURNING id"
      );
      studentDbId = insRes.rows[0].id;
    } else {
      studentDbId = userRes.rows[0].id;
    }

    await pool.query(
      'INSERT INTO user_courses (user_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [studentDbId, Number(COURSE_ID)]
    );
    console.log(`   ✓ Student ID ${studentDbId} enrolled in course ${COURSE_ID}`);

    // 2. Verify Enrolled Student CAN read published course materials
    console.log('\n[3/6] Verifying enrolled student read access (GET /api/courses/10/content)...');
    const readRes = await request(`/courses/${COURSE_ID}/content?parentId=null`, STUDENT_TOKEN);
    assert.strictEqual(readRes.status, 200, 'Enrolled student should be allowed to view course contents');
    assert.strictEqual(readRes.data.success, true);
    console.log(`   ✓ Successfully fetched ${readRes.data.data.length} published root items with student token`);

    // 3. Verify Student CANNOT create, reorder, or upload content
    console.log('\n[4/6] Verifying student CANNOT create, reorder, or upload content...');
    const postRes = await request('/content', STUDENT_TOKEN, {
      method: 'POST',
      body: JSON.stringify({
        courseId: COURSE_ID,
        title: 'Hacked Student Note',
        type: 'note',
      }),
    });
    assert.strictEqual(postRes.status, 403, 'Student POST must return 403 Forbidden');
    console.log('   ✓ Content creation rejected with 403 Forbidden');

    const reorderRes = await request('/content/reorder', STUDENT_TOKEN, {
      method: 'PATCH',
      body: JSON.stringify({ items: [{ id: 'dummy-id', order: 0 }] }),
    });
    assert.strictEqual(reorderRes.status, 403, 'Student PATCH reorder must return 403 Forbidden');
    console.log('   ✓ Content reordering rejected with 403 Forbidden');

    const uploadRes = await request('/upload', STUDENT_TOKEN, {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'malicious.pdf',
        fileType: 'application/pdf',
        courseId: COURSE_ID,
      }),
    });
    assert.strictEqual(uploadRes.status, 403, 'Student POST /api/upload must return 403 Forbidden');
    console.log('   ✓ Presigned upload request rejected with 403 Forbidden');

    // 4. Verify Code Architecture for Sandboxed Offline Caching & In-App DRM
    console.log('\n[5/6] Auditing CourseContentScreen.tsx for strict in-app sandbox & DRM...');
    const screenFilePath = path.resolve(__dirname, '../../Frontend/screens/CourseContentScreen.tsx');
    const screenCode = fs.readFileSync(screenFilePath, 'utf8');

    // Ensure sandboxed storage prefix is used
    assert(
      screenCode.includes('@edurain_sandboxed_pdf_'),
      'Must use @edurain_sandboxed_pdf_ private app storage key'
    );
    console.log('   ✓ Sandboxed storage key (@edurain_sandboxed_pdf_) confirmed');

    // Ensure NO external file sharing or downloading libraries are imported
    assert(
      !screenCode.includes('expo-sharing'),
      'Must not import expo-sharing for public file export'
    );
    assert(
      !screenCode.includes('expo-file-system/downloadAsync'),
      'Must not download to public Downloads directory'
    );
    console.log('   ✓ Confirmed zero external public file download triggers');

    // Ensure in-app WebView rendering with nodownload
    assert(
      screenCode.includes('controlsList="nodownload noplaybackrate"'),
      'Video player must restrict raw download'
    );
    assert(
      screenCode.includes('watermark'),
      'Protected player must include floating DRM watermark'
    );
    console.log('   ✓ DRM watermark and nodownload protection verified');

    console.log('\n[6/6] Cleaning up test enrollment...');
    if (studentDbId) {
      await pool.query('DELETE FROM user_courses WHERE user_id = $1 AND course_id = $2', [
        studentDbId,
        Number(COURSE_ID),
      ]);
      console.log('   ✓ Test enrollment cleaned up');
    }

    console.log('\n' + '='.repeat(70));
    console.log('✓ ALL STUDENT READ-ONLY & SANDBOX SECURITY CHECKS PASSED!');
    console.log('='.repeat(70));
  } catch (err) {
    console.error('❌ Verification failed:', err);
    if (studentDbId) {
      await pool.query('DELETE FROM user_courses WHERE user_id = $1 AND course_id = $2', [
        studentDbId,
        Number(COURSE_ID),
      ]).catch(() => {});
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifyStudentAccess();
