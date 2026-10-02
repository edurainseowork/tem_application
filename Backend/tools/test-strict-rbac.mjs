/**
 * Test Suite: Strict RBAC Verification (Section 5 & 12)
 * Verifies that:
 * 1. POST /api/content
 * 2. PATCH /api/content/:id
 * 3. PATCH /api/content/reorder
 * 4. DELETE /api/content/:id
 * 5. POST /api/upload
 * 
 * Strictly reject requests from non-admin/student tokens with 403 Forbidden,
 * and permit authorized requests from admin and faculty tokens.
 */

import assert from 'assert';

const API_BASE = 'http://localhost:5000/api';
const STUDENT_TOKEN = 'test-student';
const FACULTY_TOKEN = 'test-faculty';
const ADMIN_TOKEN = 'mock-admin-token';
const COURSE_ID = '10';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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

async function runRbacTests() {
  console.log('='.repeat(70));
  console.log('       BACKEND STRICT RBAC VERIFICATION SUITE');
  console.log('='.repeat(70));

  let createdTestFolderId = null;

  try {
    // 0. Verify GET /api/auth/me for student, faculty, and admin
    console.log('\n[0/6] Verifying GET /api/auth/me role resolution...');
    const studentMe = await request('/auth/me', {
      headers: { Authorization: `Bearer ${STUDENT_TOKEN}` },
    });
    console.log(`   ✓ Student token resolved role: '${studentMe.data.user?.role}' (status: ${studentMe.status})`);
    assert.strictEqual(studentMe.status, 200);
    assert.strictEqual(studentMe.data.user?.role, 'student');
    assert.strictEqual(studentMe.data.user?.isAdminOrFaculty, false);

    const facultyMe = await request('/auth/me', {
      headers: { Authorization: `Bearer ${FACULTY_TOKEN}` },
    });
    console.log(`   ✓ Faculty token resolved role: '${facultyMe.data.user?.role}' (status: ${facultyMe.status})`);
    assert.strictEqual(facultyMe.status, 200);
    assert.strictEqual(facultyMe.data.user?.role, 'faculty');
    assert.strictEqual(facultyMe.data.user?.isAdminOrFaculty, true);

    const adminMe = await request('/auth/me', {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    console.log(`   ✓ Admin token resolved role: '${adminMe.data.user?.role}' (status: ${adminMe.status})`);
    assert.strictEqual(adminMe.status, 200);
    assert.strictEqual(adminMe.data.user?.role, 'admin');
    assert.strictEqual(adminMe.data.user?.isAdminOrFaculty, true);

    // 1. POST /api/content
    console.log('\n[1/6] Testing POST /api/content strict RBAC rejection...');
    const studentPost = await request('/content', {
      method: 'POST',
      headers: { Authorization: `Bearer ${STUDENT_TOKEN}` },
      body: JSON.stringify({
        courseId: COURSE_ID,
        title: 'Malicious Student Folder',
        type: 'folder',
      }),
    });
    console.log(`   ✓ Student POST /api/content rejected with status ${studentPost.status}:`, studentPost.data);
    assert.strictEqual(studentPost.status, 403, 'Student should receive 403 Forbidden');

    // Verify Admin allowed
    const adminPost = await request('/content', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({
        courseId: COURSE_ID,
        title: 'RBAC Test Folder by Admin',
        type: 'folder',
      }),
    });
    console.log(`   ✓ Admin POST /api/content accepted with status ${adminPost.status}`);
    assert.strictEqual(adminPost.status, 201, 'Admin should receive 201 Created');
    createdTestFolderId = adminPost.data.data.id;

    // 2. PATCH /api/content/:id
    console.log('\n[2/6] Testing PATCH /api/content/:id strict RBAC rejection...');
    const studentPatch = await request(`/content/${createdTestFolderId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${STUDENT_TOKEN}` },
      body: JSON.stringify({ title: 'Hacked by Student' }),
    });
    console.log(`   ✓ Student PATCH /api/content/:id rejected with status ${studentPatch.status}:`, studentPatch.data);
    assert.strictEqual(studentPatch.status, 403, 'Student should receive 403 Forbidden');

    // Faculty allowed to update
    const facultyPatch = await request(`/content/${createdTestFolderId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${FACULTY_TOKEN}` },
      body: JSON.stringify({ title: 'RBAC Test Folder (Updated by Faculty)' }),
    });
    console.log(`   ✓ Faculty PATCH /api/content/:id accepted with status ${facultyPatch.status}`);
    assert.strictEqual(facultyPatch.status, 200, 'Faculty should receive 200 OK');

    // 3. PATCH /api/content/reorder
    console.log('\n[3/6] Testing PATCH /api/content/reorder strict RBAC rejection...');
    const studentReorder = await request('/content/reorder', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${STUDENT_TOKEN}` },
      body: JSON.stringify({ items: [{ id: createdTestFolderId, order: 99 }] }),
    });
    console.log(`   ✓ Student PATCH /api/content/reorder rejected with status ${studentReorder.status}:`, studentReorder.data);
    assert.strictEqual(studentReorder.status, 403, 'Student should receive 403 Forbidden');

    const facultyReorder = await request('/content/reorder', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${FACULTY_TOKEN}` },
      body: JSON.stringify({ items: [{ id: createdTestFolderId, order: 0 }] }),
    });
    console.log(`   ✓ Faculty PATCH /api/content/reorder accepted with status ${facultyReorder.status}`);
    assert.strictEqual(facultyReorder.status, 200, 'Faculty should receive 200 OK');

    // 4. POST /api/upload
    console.log('\n[4/6] Testing POST /api/upload strict RBAC rejection...');
    const studentUpload = await request('/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${STUDENT_TOKEN}` },
      body: JSON.stringify({
        fileName: 'student_test.pdf',
        fileType: 'application/pdf',
        courseId: COURSE_ID,
      }),
    });
    console.log(`   ✓ Student POST /api/upload rejected with status ${studentUpload.status}:`, studentUpload.data);
    assert.strictEqual(studentUpload.status, 403, 'Student should receive 403 Forbidden');

    const adminUpload = await request('/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({
        fileName: 'admin_test.pdf',
        fileType: 'application/pdf',
        courseId: COURSE_ID,
      }),
    });
    console.log(`   ✓ Admin POST /api/upload accepted with status ${adminUpload.status}`);
    assert.strictEqual(adminUpload.status, 200, 'Admin should receive 200 OK');

    // 5. DELETE /api/content/:id
    console.log('\n[5/6] Testing DELETE /api/content/:id strict RBAC rejection...');
    const studentDelete = await request(`/content/${createdTestFolderId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${STUDENT_TOKEN}` },
    });
    console.log(`   ✓ Student DELETE /api/content/:id rejected with status ${studentDelete.status}:`, studentDelete.data);
    assert.strictEqual(studentDelete.status, 403, 'Student should receive 403 Forbidden');

    const facultyDelete = await request(`/content/${createdTestFolderId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${FACULTY_TOKEN}` },
    });
    console.log(`   ✓ Faculty DELETE /api/content/:id accepted with status ${facultyDelete.status}`);
    assert.strictEqual(facultyDelete.status, 200, 'Faculty should receive 200 OK');

    console.log('\n[6/6] Finalizing assertions...');
    console.log('\n' + '='.repeat(70));
    console.log('✓ ALL STRICT RBAC ACCESS CONTROL TESTS PASSED SUCCESSFULLY!');
    console.log('='.repeat(70));
  } catch (err) {
    console.error('\n❌ Strict RBAC verification failed:', err);
    if (createdTestFolderId) {
      await request(`/content/${createdTestFolderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      }).catch(() => {});
    }
    process.exit(1);
  }
}

runRbacTests();
