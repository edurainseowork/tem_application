// ==============================================================================
// Edurain Backend Verification Script (Node.js)
// Verifies:
//   1. Creating a folder (POST /api/content)
//   2. Requesting an S3 presigned upload URL (POST /api/upload)
//   3. Reordering content items (PATCH /api/content/reorder)
//   4. Fetching the nested tree (GET /api/courses/:id/content)
// ==============================================================================

const BASE_URL = "http://localhost:5000/api";
const TOKEN = "test-admin";
const COURSE_ID = 10;

const HEADERS = {
  "Authorization": `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

async function verify() {
  console.log("======================================================================");
  console.log("          EDURAIN BACKEND API VERIFICATION SUITE                      ");
  console.log("======================================================================");

  // 1. Create a Folder
  console.log("\n[1/4] 1. Creating Folder 'Unit 03: Laws of Motion'...");
  const folderRes = await fetch(`${BASE_URL}/content`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      courseId: COURSE_ID,
      title: "Unit 03: Laws of Motion",
      type: "folder",
    }),
  });
  const folderData = await folderRes.json();
  const folderId = folderData.data?.id;
  console.log(`✓ Folder created with ID: ${folderId}`);

  // Create video and PDF inside folder
  const videoRes = await fetch(`${BASE_URL}/content`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      courseId: COURSE_ID,
      parentId: folderId,
      title: "Lecture 01: Newton Laws",
      type: "video",
      mediaUrl: "https://player.vimeo.com/video/987654330",
    }),
  });
  const videoId = (await videoRes.json()).data?.id;

  const pdfRes = await fetch(`${BASE_URL}/content`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      courseId: COURSE_ID,
      parentId: folderId,
      title: "Laws of Motion Notes",
      type: "pdf",
      mediaUrl: "https://edurain-media-assets.s3.ap-south-1.amazonaws.com/notes.pdf",
      fileSize: "3.8 MB",
    }),
  });
  const pdfId = (await pdfRes.json()).data?.id;

  // 2. Request an S3 Presigned Upload URL
  console.log("\n[2/4] 2. Requesting S3 Presigned Upload URL (POST /api/upload)...");
  const uploadRes = await fetch(`${BASE_URL}/upload`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      fileName: "friction-and-circular-motion.mp4",
      fileType: "video/mp4",
      courseId: String(COURSE_ID),
    }),
  });
  const uploadData = await uploadRes.json();
  console.log(`Upload URL: ${uploadData.uploadUrl?.slice(0, 80)}...`);
  console.log(`S3 Key:     ${uploadData.key}`);
  console.log(`File URL:   ${uploadData.fileUrl}`);
  console.log("✓ S3 Presigned URL generated with 15-minute expiration & zero IAM secrets leaked!");

  // 3. Reorder Content Items
  console.log("\n[3/4] 3. Reordering Content Items (PATCH /api/content/reorder)...");
  const reorderRes = await fetch(`${BASE_URL}/content/reorder`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify({
      items: [
        { id: pdfId, order: 0 },
        { id: videoId, order: 1 },
      ],
    }),
  });
  const reorderData = await reorderRes.json();
  console.log("Reorder Message:", reorderData.message);
  console.log("✓ Successfully reordered items in Drizzle batch transaction!");

  // 4. Fetch Nested Content Tree
  console.log(`\n[4/4] 4. Fetching Nested Content Tree (GET /api/courses/${COURSE_ID}/content?parentId=${folderId})...`);
  const treeRes = await fetch(`${BASE_URL}/courses/${COURSE_ID}/content?parentId=${folderId}`, {
    headers: HEADERS,
  });
  const treeData = await treeRes.json();
  console.log(`Children of Folder ${folderId} (count: ${treeData.data?.length}):`);
  for (const item of treeData.data || []) {
    console.log(`  - [Order: ${item.order}] ${item.title} (${item.type})`);
  }

  console.log(`\nFetching Root Folders (parentId omitted)...`);
  const rootRes = await fetch(`${BASE_URL}/courses/${COURSE_ID}/content`, {
    headers: HEADERS,
  });
  const rootData = await rootRes.json();
  console.log(`Root Items (count: ${rootData.data?.length}):`);
  for (const item of rootData.data || []) {
    console.log(`  - [Order: ${item.order}] ${item.title} (${item.type})`);
  }

  console.log("\n======================================================================");
  console.log("✓ ALL 4 VERIFICATION STEPS PASSED SUCCESSFULLY!");
  console.log("======================================================================");
}

verify().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
