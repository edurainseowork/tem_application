/**
 * Test: CMS-Portal uploadService verification
 * Tests getUploadPresignedUrl against Backend /api/upload
 */

import assert from 'assert';

const API_BASE = 'http://localhost:5000/api';
const ADMIN_TOKEN = 'mock-admin-token';
const COURSE_ID = '10';

async function testUploadService() {
  console.log('='.repeat(60));
  console.log('       CMS-PORTAL UPLOAD SERVICE VERIFICATION');
  console.log('='.repeat(60));

  try {
    console.log('\n[1/3] Testing getUploadPresignedUrl for PDF...');
    const pdfRes = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ADMIN_TOKEN}`,
      },
      body: JSON.stringify({
        fileName: 'physics_ch1_notes.pdf',
        fileType: 'application/pdf',
        courseId: COURSE_ID,
      }),
    });

    assert.strictEqual(pdfRes.status, 200, `Expected 200, got ${pdfRes.status}`);
    const pdfData = await pdfRes.json();
    console.log('   ✓ Received presigned payload:', pdfData);
    assert(pdfData.uploadUrl.startsWith('http'), 'uploadUrl should be a valid URL');
    assert(pdfData.key.includes(`courses/${COURSE_ID}/`), 'key should contain course path');
    assert(pdfData.key.endsWith('.pdf'), 'key should have .pdf extension');
    assert(pdfData.fileUrl.includes('.amazonaws.com/'), 'fileUrl should point to S3 bucket');

    console.log('\n[2/3] Testing getUploadPresignedUrl for Video (video/mp4)...');
    const videoRes = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ADMIN_TOKEN}`,
      },
      body: JSON.stringify({
        fileName: 'lesson_01_kinematics.mp4',
        fileType: 'video/mp4',
        courseId: COURSE_ID,
      }),
    });

    assert.strictEqual(videoRes.status, 200, `Expected 200, got ${videoRes.status}`);
    const videoData = await videoRes.json();
    console.log('   ✓ Received presigned payload:', videoData);
    assert(videoData.uploadUrl.startsWith('http'), 'uploadUrl should be a valid URL');
    assert(videoData.key.includes(`courses/${COURSE_ID}/`), 'key should contain course path');
    assert(videoData.fileUrl.endsWith('.mp4'), 'fileUrl should have .mp4 extension');

    console.log('\n[3/3] Testing validation for disallowed file types (e.g., text/plain)...');
    const invalidRes = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ADMIN_TOKEN}`,
      },
      body: JSON.stringify({
        fileName: 'malicious.exe',
        fileType: 'application/x-msdownload',
        courseId: COURSE_ID,
      }),
    });

    assert.strictEqual(invalidRes.status, 400, 'Should reject disallowed file type with 400');
    console.log('   ✓ Successfully rejected invalid MIME type with 400 Bad Request');

    console.log('\n' + '='.repeat(60));
    console.log('✓ UPLOAD SERVICE API VERIFICATION PASSED SUCCESSFULLY!');
    console.log('='.repeat(60));
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

testUploadService();
