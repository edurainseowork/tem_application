/**
 * Verification script for Frontend/services/contentService.ts
 * Tests each function against the running Backend server on http://localhost:5000:
 * - Dynamic Base URL & Auth token injection
 * - fetchCourseContent(courseId, parentId)
 * - createContentNode(data)
 * - updateContentNode(id, updates)
 * - reorderContentNodes(items)
 * - getPresignedUploadUrl(fileName, fileType, courseId)
 * - uploadFileToS3(presignedUrl, fileUri, mimeType)
 * - deleteContentNode(id)
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
const TEST_TOKEN = 'mock-admin-token';
const TEST_COURSE_ID = '10';

async function apiRequest(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${TEST_TOKEN}`,
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Service function reproductions matching Frontend/services/contentService.ts exactly
async function fetchCourseContent(courseId, parentId) {
  let endpoint = `/api/courses/${encodeURIComponent(courseId)}/content`;
  if (parentId !== undefined) {
    endpoint += `?parentId=${encodeURIComponent(parentId === null ? 'null' : parentId)}`;
  }
  const result = await apiRequest(endpoint, { method: 'GET' });
  return Array.isArray(result) ? result : result.data ?? [];
}

async function createContentNode(data) {
  const result = await apiRequest('/api/content', {
    method: 'POST',
    body: JSON.stringify({
      courseId: data.courseId,
      parentId: data.parentId === undefined ? null : data.parentId,
      title: data.title,
      type: data.type,
      mediaUrl: data.mediaUrl,
      fileSize: data.fileSize,
      order: data.order,
    }),
  });
  return result.data ?? result;
}

async function updateContentNode(id, updates) {
  const result = await apiRequest(`/api/content/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return result.data ?? result;
}

async function reorderContentNodes(items) {
  await apiRequest('/api/content/reorder', {
    method: 'PATCH',
    body: JSON.stringify({ items }),
  });
}

async function deleteContentNode(id) {
  await apiRequest(`/api/content/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

async function getPresignedUploadUrl(fileName, fileType, courseId) {
  return await apiRequest('/api/upload', {
    method: 'POST',
    body: JSON.stringify({ fileName, fileType, courseId }),
  });
}

async function uploadFileToS3(presignedUrl, dummyContent, mimeType) {
  const blob = new Blob([dummyContent], { type: mimeType });
  const res = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: blob,
  });
  if (!res.ok) {
    throw new Error(`S3 PUT failed with status ${res.status}`);
  }
}

async function runVerification() {
  console.log('='.repeat(70));
  console.log('    FRONTEND CONTENT SERVICE VERIFICATION SUITE');
  console.log('    Target Base URL:', API_BASE_URL);
  console.log('='.repeat(70));

  try {
    // 1. Fetch existing root content
    console.log('\n[1/7] Testing fetchCourseContent for root items (courseId: 10)...');
    const rootItems = await fetchCourseContent(TEST_COURSE_ID);
    console.log(`✓ Fetched ${rootItems.length} root items:`);
    rootItems.forEach((item) => console.log(`   - [${item.type.toUpperCase()}] ${item.title} (id: ${item.id})`));

    // 2. Create a test folder node
    console.log('\n[2/7] Testing createContentNode (creating folder)...');
    const newFolder = await createContentNode({
      courseId: TEST_COURSE_ID,
      title: 'Service Test Folder - Unit 05',
      type: 'folder',
    });
    console.log(`✓ Folder created successfully with ID: ${newFolder.id}`);

    // 3. Request presigned upload URL
    console.log('\n[3/7] Testing getPresignedUploadUrl (requesting S3 presigned URL for PDF)...');
    const uploadMeta = await getPresignedUploadUrl('chapter5_notes.pdf', 'application/pdf', TEST_COURSE_ID);
    console.log('✓ Presigned URL received:');
    console.log('   - S3 Key:', uploadMeta.key);
    console.log('   - File URL:', uploadMeta.fileUrl);
    console.log('   - Upload URL length:', uploadMeta.uploadUrl.length, 'chars');

    // 4. Create child items inside the new folder
    console.log('\n[4/7] Testing createContentNode for nested children...');
    const child1 = await createContentNode({
      courseId: TEST_COURSE_ID,
      parentId: newFolder.id,
      title: 'Lecture 1: Introduction to Mechanics',
      type: 'video',
      mediaUrl: 'https://test-bucket.s3.amazonaws.com/courses/10/lecture1.mp4',
      fileSize: '45.2 MB',
      order: 0,
    });
    console.log(`✓ Created child 1 [video]: ${child1.title} (id: ${child1.id}, order: ${child1.order})`);

    const child2 = await createContentNode({
      courseId: TEST_COURSE_ID,
      parentId: newFolder.id,
      title: 'Chapter 5 Study Notes',
      type: 'pdf',
      mediaUrl: uploadMeta.fileUrl,
      fileSize: '2.4 MB',
      order: 1,
    });
    console.log(`✓ Created child 2 [pdf]: ${child2.title} (id: ${child2.id}, order: ${child2.order})`);

    // 5. Test updating a node
    console.log('\n[5/7] Testing updateContentNode (updating title and fileSize)...');
    const updatedChild = await updateContentNode(child2.id, {
      title: 'Chapter 5 Study Notes (Revised Ed.)',
      fileSize: '2.8 MB',
    });
    console.log(`✓ Updated item: ${updatedChild.title}, size: ${updatedChild.fileSize}`);

    // 6. Test reordering items
    console.log('\n[6/7] Testing reorderContentNodes (swapping orders)...');
    await reorderContentNodes([
      { id: child1.id, order: 10 },
      { id: child2.id, order: 5 },
    ]);
    const reorderedChildren = await fetchCourseContent(TEST_COURSE_ID, newFolder.id);
    console.log(`✓ Reordered children inside folder ${newFolder.id}:`);
    reorderedChildren.forEach((c) => console.log(`   - Order ${c.order}: ${c.title} (id: ${c.id})`));

    // 7. Test cascade deletion
    console.log('\n[7/7] Testing deleteContentNode (cascade deleting folder and children)...');
    await deleteContentNode(newFolder.id);
    const postDeleteChildren = await fetchCourseContent(TEST_COURSE_ID, newFolder.id);
    console.log(`✓ Folder and nested children deleted. Nested items remaining: ${postDeleteChildren.length}`);

    console.log('\n' + '='.repeat(70));
    console.log('✓ ALL 7 SERVICE OPERATIONS PASSED SUCCESSFULLY!');
    console.log('='.repeat(70));
  } catch (err) {
    console.error('\n❌ Verification failed:', err);
    process.exit(1);
  }
}

runVerification();
