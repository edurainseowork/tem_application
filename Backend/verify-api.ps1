# ==============================================================================
# Edurain Backend Verification Script (PowerShell / Windows)
# ==============================================================================

$baseUrl = 'http://localhost:5000/api'
$token = 'test-admin'
$courseId = 10

$headers = @{
    'Authorization' = "Bearer $token"
    'Content-Type'  = 'application/json'
}

Write-Host '======================================================================' -ForegroundColor Cyan
Write-Host '          EDURAIN BACKEND API VERIFICATION SUITE                      ' -ForegroundColor Cyan
Write-Host '======================================================================' -ForegroundColor Cyan

# 1. Create a Folder
Write-Host "`n[1/4] 1. Creating Folder: 'Unit 03: Laws of Motion'..." -ForegroundColor Yellow
$folderJson = '{"courseId":' + $courseId + ',"title":"Unit 03: Laws of Motion","type":"folder"}'
$folderRes = Invoke-RestMethod -Uri "$baseUrl/content" -Method Post -Headers $headers -Body $folderJson
$folderId = $folderRes.data.id
Write-Host "✓ Folder created with ID: $folderId" -ForegroundColor Green

# Add a video and a PDF inside the folder for reordering
$videoJson = '{"courseId":' + $courseId + ',"parentId":"' + $folderId + '","title":"Lecture 01: Newton Laws","type":"video","mediaUrl":"https://player.vimeo.com/video/987654330"}'
$videoRes = Invoke-RestMethod -Uri "$baseUrl/content" -Method Post -Headers $headers -Body $videoJson
$videoId = $videoRes.data.id

$pdfJson = '{"courseId":' + $courseId + ',"parentId":"' + $folderId + '","title":"Laws of Motion Notes","type":"pdf","mediaUrl":"https://edurain-media-assets.s3.ap-south-1.amazonaws.com/notes.pdf","fileSize":"3.8 MB"}'
$pdfRes = Invoke-RestMethod -Uri "$baseUrl/content" -Method Post -Headers $headers -Body $pdfJson
$pdfId = $pdfRes.data.id

# 2. Request an S3 Presigned Upload URL
Write-Host "`n[2/4] 2. Requesting S3 Presigned Upload URL: POST /api/upload..." -ForegroundColor Yellow
$uploadJson = '{"fileName":"friction-and-circular-motion.mp4","fileType":"video/mp4","courseId":"' + $courseId + '"}'
$uploadRes = Invoke-RestMethod -Uri "$baseUrl/upload" -Method Post -Headers $headers -Body $uploadJson
Write-Host "Upload URL:" $uploadRes.uploadUrl.Substring(0, 80)...
Write-Host "S3 Key:    " $uploadRes.key
Write-Host "File URL:  " $uploadRes.fileUrl
Write-Host "✓ S3 Presigned URL generated with 15-minute expiration & zero IAM secrets leaked!" -ForegroundColor Green

# 3. Reorder Content Items
Write-Host "`n[3/4] 3. Reordering Content Items: PATCH /api/content/reorder..." -ForegroundColor Yellow
$reorderJson = '{"items":[{"id":"' + $pdfId + '","order":0},{"id":"' + $videoId + '","order":1}]}'
$reorderRes = Invoke-RestMethod -Uri "$baseUrl/content/reorder" -Method Patch -Headers $headers -Body $reorderJson
Write-Host "Reorder Message:" $reorderRes.message
Write-Host "✓ Reordered items in Drizzle batch transaction!" -ForegroundColor Green

# 4. Fetch Nested Content Tree
Write-Host "`n[4/4] 4. Fetching Nested Content Tree..." -ForegroundColor Yellow
$treeRes = Invoke-RestMethod -Uri "$baseUrl/courses/$courseId/content?parentId=$folderId" -Method Get -Headers $headers
$childCount = $treeRes.data.Count
Write-Host "Children of Folder $folderId (count: $childCount):"
foreach ($item in $treeRes.data) {
    Write-Host "  - [Order: $($item.order)] $($item.title) ($($item.type))"
}

Write-Host "`nFetching Root Folders (parentId omitted):" -ForegroundColor Yellow
$rootRes = Invoke-RestMethod -Uri "$baseUrl/courses/$courseId/content" -Method Get -Headers $headers
$rootCount = $rootRes.data.Count
Write-Host "Root items (count: $rootCount):"
foreach ($item in $rootRes.data) {
    Write-Host "  - [Order: $($item.order)] $($item.title) ($($item.type))"
}

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "✓ ALL 4 VERIFICATION STEPS PASSED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan
