import express from 'express';
import crypto from 'crypto';

const router = express.Router();

const getBunnyConfig = () => {
    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID || '775402';
    const apiKey = process.env.BUNNY_STREAM_API_KEY;
    const cdnHostname = process.env.BUNNY_STREAM_CDN_HOSTNAME || 'vz-0167fe79-908.b-cdn.net';
    return { libraryId, apiKey, cdnHostname };
};

/**
 * POST /videos/initiate-upload
 * Creates a video entry in Bunny Stream and returns TUS resumable upload credentials
 */
router.post('/videos/initiate-upload', async (req, res) => {
    try {
        const { title, description, fileSize } = req.body || {};
        const { libraryId, apiKey, cdnHostname } = getBunnyConfig();

        if (!apiKey) {
            return res.status(500).json({ error: 'BUNNY_STREAM_API_KEY is not configured in backend environment' });
        }

        // 1. Create video object in Bunny Stream
        const createRes = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
            method: 'POST',
            headers: {
                'AccessKey': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                title: title || 'Untitled Lecture',
            }),
        });

        const videoData = await createRes.json().catch(() => ({}));

        if (!createRes.ok || !videoData.guid) {
            console.error('Bunny Create Video Error:', videoData);
            return res.status(createRes.status || 500).json({
                error: videoData?.Message || 'Failed to create video object in Bunny Stream',
            });
        }

        const videoId = videoData.guid;

        // 2. Generate TUS upload authentication signature (valid for 24 hours)
        const expire = Math.floor(Date.now() / 1000) + 86400;
        const signature = crypto
            .createHash('sha256')
            .update(`${libraryId}${apiKey}${expire}${videoId}`)
            .digest('hex');

        const playerUrl = `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`;
        const directUrl = `https://${cdnHostname}/${videoId}/playlist.m3u8`;

        return res.status(200).json({
            success: true,
            provider: 'bunny',
            uploadEndpoint: 'https://video.bunnycdn.com/tusupload',
            videoId,
            libraryId,
            signature,
            expire,
            playerUrl,
            directUrl,
            // Backwards compatibility field so any legacy consumer reading uploadLink still gets endpoint
            uploadLink: 'https://video.bunnycdn.com/tusupload',
        });
    } catch (error) {
        console.error('Bunny Init Error:', error.message);
        return res.status(500).json({
            error: error.message || 'Failed to initialize Bunny Stream upload',
        });
    }
});

/**
 * DELETE /videos/:videoId
 * Safely deletes a video from Bunny Stream when course content is removed
 */
router.delete('/videos/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        const { libraryId, apiKey } = getBunnyConfig();

        if (!apiKey || !videoId) {
            return res.status(400).json({ error: 'Missing parameters or configuration' });
        }

        const delRes = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`, {
            method: 'DELETE',
            headers: {
                'AccessKey': apiKey,
            },
        });

        if (!delRes.ok) {
            const err = await delRes.text().catch(() => '');
            console.error('Failed to delete video from Bunny:', err);
            return res.status(delRes.status).json({ error: 'Failed to delete video from Bunny' });
        }

        return res.status(200).json({ success: true, message: 'Video deleted from Bunny Stream' });
    } catch (error) {
        console.error('Bunny Delete Error:', error.message);
        return res.status(500).json({ error: error.message });
    }
});

export default router;
