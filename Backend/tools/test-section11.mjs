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

async function run() {
  console.log("=== Testing Course Content Endpoints (PRD Section 11) ===");

  // -------------------------------------------------------------
  // Test 1: POST /api/content with and without order
  // -------------------------------------------------------------
  console.log("\n1. Testing POST /api/content (with automatic MAX(order) + 1 assignment)...");

  // 1.1 Create root Folder A with no order supplied -> should get 0 (or MAX + 1)
  const folderARes = await fetch(`${BASE_URL}/content`, {
    method: "POST",
    headers: ADMIN_HEADER,
    body: JSON.stringify({
      courseId: 9,
      title: "Folder A - Section 11",
      type: "folder",
      // order omitted!
    }),
  });
  console.log("Create Folder A status:", folderARes.status);
  const folderAData = await folderARes.json();
  const folderA = folderAData.data;
  console.log(`Created Folder A: id=${folderA.id}, order=${folderA.order}`);
  if (typeof folderA.order !== "number") throw new Error("Order was not assigned");

  // 1.2 Create root Folder B with no order supplied -> should get Folder A's order + 1
  const folderBRes = await fetch(`${BASE_URL}/content`, {
    method: "POST",
    headers: ADMIN_HEADER,
    body: JSON.stringify({
      courseId: 9,
      title: "Folder B - Section 11",
      type: "folder",
      // order omitted!
    }),
  });
  const folderBData = await folderBRes.json();
  const folderB = folderBData.data;
  console.log(`Created Folder B: id=${folderB.id}, order=${folderB.order}`);
  if (folderB.order !== folderA.order + 1) {
    throw new Error(`Expected Folder B order (${folderA.order + 1}), got ${folderB.order}`);
  }
  console.log("✓ Automatic MAX(order) + 1 assignment for root level verified!");

  // 1.3 Create items inside Folder A with no order supplied
  const videoInARes = await fetch(`${BASE_URL}/content`, {
    method: "POST",
    headers: ADMIN_HEADER,
    body: JSON.stringify({
      courseId: 9,
      parentId: folderA.id,
      title: "Video 1 inside Folder A",
      type: "video",
      mediaUrl: "https://player.vimeo.com/video/987654321",
    }),
  });
  const videoInA = (await videoInARes.json()).data;
  console.log(`Created Video in Folder A: id=${videoInA.id}, order=${videoInA.order}`);

  const pdfInARes = await fetch(`${BASE_URL}/content`, {
    method: "POST",
    headers: ADMIN_HEADER,
    body: JSON.stringify({
      courseId: 9,
      parentId: folderA.id,
      title: "PDF 1 inside Folder A",
      type: "pdf",
      mediaUrl: "https://bucket.s3.amazonaws.com/notes.pdf",
      fileSize: "2.4 MB",
    }),
  });
  const pdfInA = (await pdfInARes.json()).data;
  console.log(`Created PDF in Folder A: id=${pdfInA.id}, order=${pdfInA.order}`);
  if (pdfInA.order !== videoInA.order + 1) {
    throw new Error(`Expected PDF order (${videoInA.order + 1}), got ${pdfInA.order}`);
  }
  console.log("✓ Automatic MAX(order) + 1 assignment inside parent folder verified!");

  // 1.4 Create nested subfolder inside Folder A (subfolder level)
  const subfolderRes = await fetch(`${BASE_URL}/content`, {
    method: "POST",
    headers: ADMIN_HEADER,
    body: JSON.stringify({
      courseId: 9,
      parentId: folderA.id,
      title: "Subfolder A.1",
      type: "folder",
    }),
  });
  const subfolder = (await subfolderRes.json()).data;

  // Create child file inside Subfolder A.1
  const subFileRes = await fetch(`${BASE_URL}/content`, {
    method: "POST",
    headers: ADMIN_HEADER,
    body: JSON.stringify({
      courseId: 9,
      parentId: subfolder.id,
      title: "Deep Note inside Subfolder A.1",
      type: "note",
      mediaUrl: "/uploads/deep-note.pdf",
    }),
  });
  const subFile = (await subFileRes.json()).data;
  console.log(`Created Subfolder A.1 (${subfolder.id}) and child file (${subFile.id})`);

  // -------------------------------------------------------------
  // Test 2: GET /api/courses/:id/content
  // -------------------------------------------------------------
  console.log("\n2. Testing GET /api/courses/:id/content hierarchy...");

  // 2.1 parentId omitted -> returns root items only
  const rootContentRes = await fetch(`${BASE_URL}/courses/9/content`, { headers: ADMIN_HEADER });
  const rootContent = (await rootContentRes.json()).data;
  console.log("Root content items count:", rootContent.length);
  const rootIds = rootContent.map((i) => i.id);
  if (!rootIds.includes(folderA.id) || !rootIds.includes(folderB.id)) {
    throw new Error("Root content missing Folder A or Folder B");
  }
  if (rootIds.includes(videoInA.id) || rootIds.includes(pdfInA.id) || rootIds.includes(subFile.id)) {
    throw new Error("Root content must not contain nested child items!");
  }
  console.log("✓ Root content correctly returns only root items when parentId is omitted!");

  // 2.2 parentId="null" -> returns root items only
  const rootNullRes = await fetch(`${BASE_URL}/courses/9/content?parentId=null`, { headers: ADMIN_HEADER });
  const rootNullContent = (await rootNullRes.json()).data;
  if (rootNullContent.length !== rootContent.length) {
    throw new Error("parentId=null did not return same count as omitted");
  }
  console.log("✓ parentId='null' correctly returns root items!");

  // 2.3 parentId=<folderA.id> -> returns contents inside Folder A sorted ascending by order
  const folderAContentRes = await fetch(`${BASE_URL}/courses/9/content?parentId=${folderA.id}`, { headers: ADMIN_HEADER });
  const folderAContent = (await folderAContentRes.json()).data;
  console.log("Folder A children count:", folderAContent.length);
  const folderAChildIds = folderAContent.map((i) => i.id);
  if (!folderAChildIds.includes(videoInA.id) || !folderAChildIds.includes(pdfInA.id) || !folderAChildIds.includes(subfolder.id)) {
    throw new Error("Folder A content missing direct child items!");
  }
  if (folderAChildIds.includes(subFile.id)) {
    throw new Error("Folder A must not contain subfolder grandchildren directly!");
  }
  // Verify order sorting
  const orders = folderAContent.map((i) => i.order);
  for (let i = 1; i < orders.length; i++) {
    if (orders[i] < orders[i - 1]) throw new Error("Folder A items not sorted ascending by order!");
  }
  console.log("✓ Folder A contents correctly returned and sorted ascending by order!");

  // -------------------------------------------------------------
  // Test 3: PATCH /api/content/:id
  // -------------------------------------------------------------
  console.log("\n3. Testing PATCH /api/content/:id...");
  const patchRes = await fetch(`${BASE_URL}/content/${videoInA.id}`, {
    method: "PATCH",
    headers: ADMIN_HEADER,
    body: JSON.stringify({
      title: "Updated Video Title",
      mediaUrl: "https://player.vimeo.com/video/111222333",
      fileSize: "500 MB",
    }),
  });
  console.log("PATCH status:", patchRes.status);
  const patchedItem = (await patchRes.json()).data;
  console.log("Patched item:", {
    title: patchedItem.title,
    mediaUrl: patchedItem.mediaUrl,
    fileSize: patchedItem.fileSize,
  });
  if (
    patchedItem.title !== "Updated Video Title" ||
    patchedItem.mediaUrl !== "https://player.vimeo.com/video/111222333" ||
    patchedItem.fileSize !== "500 MB"
  ) {
    throw new Error("PATCH /api/content/:id did not update requested fields");
  }
  console.log("✓ PATCH /api/content/:id updated title, mediaUrl, and fileSize successfully!");

  // -------------------------------------------------------------
  // Test 4: PATCH /api/content/reorder
  // -------------------------------------------------------------
  console.log("\n4. Testing PATCH /api/content/reorder (Drizzle transaction)...");
  const reorderRes = await fetch(`${BASE_URL}/content/reorder`, {
    method: "PATCH",
    headers: ADMIN_HEADER,
    body: JSON.stringify({
      items: [
        { id: videoInA.id, order: 10 },
        { id: pdfInA.id, order: 5 },
      ],
    }),
  });
  console.log("Reorder status:", reorderRes.status);
  const reorderData = await reorderRes.json();
  console.log("Reorder response:", reorderData);

  // Verify reordered sequence
  const verifyReorderRes = await fetch(`${BASE_URL}/courses/9/content?parentId=${folderA.id}`, { headers: ADMIN_HEADER });
  const verifyItems = (await verifyReorderRes.json()).data;
  const reorderedPdf = verifyItems.find((i) => i.id === pdfInA.id);
  const reorderedVideo = verifyItems.find((i) => i.id === videoInA.id);
  console.log(`Reordered PDF order: ${reorderedPdf.order}, Video order: ${reorderedVideo.order}`);
  if (reorderedPdf.order !== 5 || reorderedVideo.order !== 10) {
    throw new Error("Batch reorder failed to update orders in transaction");
  }
  console.log("✓ Batch reorder updated order column transactionally!");

  // -------------------------------------------------------------
  // Test 5: DELETE /api/content/:id (Recursive Cascade Delete)
  // -------------------------------------------------------------
  console.log("\n5. Testing DELETE /api/content/:id (Cascade delete folder and all descendants)...");
  // Delete Folder A (which contains videoInA, pdfInA, subfolder, and subFile!)
  const deleteRes = await fetch(`${BASE_URL}/content/${folderA.id}`, {
    method: "DELETE",
    headers: ADMIN_HEADER,
  });
  console.log("DELETE status:", deleteRes.status);
  const deleteData = await deleteRes.json();
  console.log("Deleted count:", deleteData.deletedCount, "Deleted IDs:", deleteData.deletedIds);

  if (
    !deleteData.deletedIds.includes(folderA.id) ||
    !deleteData.deletedIds.includes(videoInA.id) ||
    !deleteData.deletedIds.includes(pdfInA.id) ||
    !deleteData.deletedIds.includes(subfolder.id) ||
    !deleteData.deletedIds.includes(subFile.id)
  ) {
    throw new Error("Cascade delete missed one or more nested descendant items!");
  }
  console.log("✓ Recursive cascade delete successfully removed folder and all descendants!");

  // Clean up Folder B
  await fetch(`${BASE_URL}/content/${folderB.id}`, { method: "DELETE", headers: ADMIN_HEADER });
  console.log("Cleaned up Folder B.");

  console.log("\n=== ALL SECTION 11 TESTS PASSED SUCCESSFULLY! ===");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
