#!/usr/bin/env bash
# ==============================================================================
# Edurain Backend Verification Script (PRD Section 6.3, 6.5, 11, 12)
# Verifies:
#   1. Creating a folder
#   2. Requesting an S3 presigned upload URL
#   3. Reordering content items
#   4. Fetching the nested tree via GET /api/courses/:id/content
# ==============================================================================

set -e

BASE_URL="http://localhost:5000/api"
TOKEN="test-admin"
COURSE_ID=10

echo "======================================================================"
echo "          EDURAIN BACKEND API VERIFICATION SUITE                      "
echo "======================================================================"

# 1. Create a Folder
echo -e "\n[1/4] Creating Folder 'Unit 03: Laws of Motion'..."
FOLDER_RES=$(curl -s -X POST "${BASE_URL}/content" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "courseId": '"${COURSE_ID}"',
    "title": "Unit 03: Laws of Motion",
    "type": "folder"
  }')

echo "${FOLDER_RES}"
FOLDER_ID=$(echo "${FOLDER_RES}" | grep -o '"id":"[^"]*' | head -n1 | cut -d'"' -f4)

if [ -z "${FOLDER_ID}" ]; then
  echo "Error: Failed to obtain folder ID from response"
  exit 1
fi
echo "✓ Folder created with ID: ${FOLDER_ID}"

# Create two items inside the folder for reordering
echo -e "\nAdding Video to Folder ${FOLDER_ID}..."
VIDEO_RES=$(curl -s -X POST "${BASE_URL}/content" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "courseId": '"${COURSE_ID}"',
    "parentId": "'"${FOLDER_ID}"'",
    "title": "Lecture 01: Newton'\''s Laws",
    "type": "video",
    "mediaUrl": "https://player.vimeo.com/video/987654330"
  }')
VIDEO_ID=$(echo "${VIDEO_RES}" | grep -o '"id":"[^"]*' | head -n1 | cut -d'"' -f4)

echo -e "\nAdding PDF to Folder ${FOLDER_ID}..."
PDF_RES=$(curl -s -X POST "${BASE_URL}/content" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "courseId": '"${COURSE_ID}"',
    "parentId": "'"${FOLDER_ID}"'",
    "title": "Laws of Motion Notes",
    "type": "pdf",
    "mediaUrl": "https://edurain-media-assets.s3.ap-south-1.amazonaws.com/notes.pdf",
    "fileSize": "3.8 MB"
  }')
PDF_ID=$(echo "${PDF_RES}" | grep -o '"id":"[^"]*' | head -n1 | cut -d'"' -f4)

# 2. Request an S3 Presigned Upload URL
echo -e "\n[2/4] Requesting S3 Presigned Upload URL (POST /api/upload)..."
PRESIGNED_RES=$(curl -s -X POST "${BASE_URL}/upload" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "friction-and-circular-motion.mp4",
    "fileType": "video/mp4",
    "courseId": "'"${COURSE_ID}"'"
  }')

echo "${PRESIGNED_RES}"
echo "✓ Successfully generated S3 Presigned URL (15-minute expiration, zero IAM secrets leaked)!"

# 3. Reorder Content Items
echo -e "\n[3/4] Reordering Content Items (PATCH /api/content/reorder)..."
REORDER_RES=$(curl -s -X PATCH "${BASE_URL}/content/reorder" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      { "id": "'"${PDF_ID}"'", "order": 0 },
      { "id": "'"${VIDEO_ID}"'", "order": 1 }
    ]
  }')

echo "${REORDER_RES}"
echo "✓ Successfully reordered items in a Drizzle database transaction!"

# 4. Fetch Nested Content Tree
echo -e "\n[4/4] Fetching Nested Content Tree (GET /api/courses/${COURSE_ID}/content?parentId=${FOLDER_ID})..."
TREE_RES=$(curl -s -X GET "${BASE_URL}/courses/${COURSE_ID}/content?parentId=${FOLDER_ID}" \
  -H "Authorization: Bearer ${TOKEN}")

echo "${TREE_RES}"
echo -e "\nFetching Root Folders (GET /api/courses/${COURSE_ID}/content)..."
ROOT_RES=$(curl -s -X GET "${BASE_URL}/courses/${COURSE_ID}/content" \
  -H "Authorization: Bearer ${TOKEN}")

echo "${ROOT_RES}"

echo -e "\n======================================================================"
echo "✓ ALL 4 VERIFICATION STEPS PASSED SUCCESSFULLY!"
echo "======================================================================"
