/**
 * End-to-end verification test for CourseContentManager endpoints
 */

import assert from 'assert';

const API_BASE = 'http://localhost:5000/api';
const ADMIN_TOKEN = 'mock-admin-token';
const COURSE_ID = '10';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ADMIN_TOKEN}`,
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

async function runCourseContentTests() {
  console.log('='.repeat(70));
  console.log('   CMS COURSE CONTENT MANAGER ENDPOINT INTEGRATION VERIFICATION');
  console.log('='.repeat(70));

  let folderId = null;
  let pdfId = null;

  try {
    // 1. Fetch Root Content
    console.log('\n[1/6] Fetching root content for course 10...');
    const rootRes = await request(`/courses/${COURSE_ID}/content?parentId=null`);
    assert.strictEqual(rootRes.status, 200);
    assert.strictEqual(rootRes.data.success, true);
    console.log(`   ✓ Found ${rootRes.data.data.length} root items`);

    // 2. Create Folder
    console.log('\n[2/6] Creating a new folder (POST /api/content)...');
    const folderRes = await request('/content', {
      method: 'POST',
      body: JSON.stringify({
        courseId: COURSE_ID,
        parentId: null,
        title: 'Classplus UI Test Folder',
        type: 'folder',
      }),
    });
    assert.strictEqual(folderRes.status, 201);
    assert.strictEqual(folderRes.data.success, true);
    folderId = folderRes.data.data.id;
    console.log(`   ✓ Folder created with ID: ${folderId}`);

    // 3. Create PDF inside folder
    console.log('\n[3/6] Creating a PDF node inside folder (POST /api/content)...');
    const pdfRes = await request('/content', {
      method: 'POST',
      body: JSON.stringify({
        courseId: COURSE_ID,
        parentId: folderId,
        title: 'Thermodynamics Lecture Notes',
        type: 'pdf',
        mediaUrl: 'https://edurain-media-assets.s3.ap-south-1.amazonaws.com/courses/10/thermo.pdf',
        fileSize: '3.4 MB',
      }),
    });
    assert.strictEqual(pdfRes.status, 201);
    assert.strictEqual(pdfRes.data.success, true);
    pdfId = pdfRes.data.data.id;
    console.log(`   ✓ PDF created with ID: ${pdfId}`);

    // 4. Fetch Nested Folder Content
    console.log(`\n[4/6] Fetching contents of folder ${folderId}...`);
    const childRes = await request(`/courses/${COURSE_ID}/content?parentId=${folderId}`);
    assert.strictEqual(childRes.status, 200);
    assert.strictEqual(childRes.data.data.length, 1);
    assert.strictEqual(childRes.data.data[0].id, pdfId);
    console.log(`   ✓ Nested content verified: "${childRes.data.data[0].title}"`);

    // 5. Rename Item (PATCH /api/content/:id)
    console.log(`\n[5/6] Renaming PDF item (PATCH /api/content/${pdfId})...`);
    const renameRes = await request(`/content/${pdfId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: 'Thermodynamics Lecture Notes (Revision v2)',
      }),
    });
    assert.strictEqual(renameRes.status, 200);
    assert.strictEqual(renameRes.data.data.title, 'Thermodynamics Lecture Notes (Revision v2)');
    console.log('   ✓ Renamed title successfully verified');

    // 6. Cascade Delete Folder (DELETE /api/content/:id)
    console.log(`\n[6/6] Cascade deleting folder ${folderId} (DELETE /api/content/${folderId})...`);
    const deleteRes = await request(`/content/${folderId}`, {
      method: 'DELETE',
    });
    assert.strictEqual(deleteRes.status, 200);
    assert.strictEqual(deleteRes.data.success, true);
    assert.strictEqual(deleteRes.data.deletedCount, 2, 'Should cascade delete folder and nested PDF');
    console.log(`   ✓ Cascade delete verified: ${deleteRes.data.deletedCount} items deleted`);

    console.log('\n' + '='.repeat(70));
    console.log('✓ ALL COURSE CONTENT MANAGER INTEGRATION TESTS PASSED!');
    console.log('='.repeat(70));
  } catch (err) {
    console.error('❌ Test failed:', err);
    if (folderId) {
      await request(`/content/${folderId}`, { method: 'DELETE' }).catch(() => {});
    }
    process.exit(1);
  }
}

runCourseContentTests();
