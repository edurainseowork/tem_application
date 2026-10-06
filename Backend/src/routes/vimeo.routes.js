import express from 'express';
import axios from 'axios';

const router = express.Router();

router.post('/videos/initiate-upload', async (req, res) => {
    try {
        const { title, description, fileSize } = req.body;

        if (!fileSize) {
            return res.status(400).json({ error: 'fileSize (in bytes) is required' });
        }

        const response = await axios.post(
            'https://api.vimeo.com/me/videos',
            {
                upload: {
                    approach: 'tus',
                    size: fileSize,
                },
                name: title || 'Untitled Lecture',
                description: description || '',
                privacy: {
                    view: 'unlisted',
                    embed: 'whitelist',
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.VIMEO_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/vnd.vimeo.*+json;version=3.4',
                },
            }
        );

        const uploadLink = response.data.upload.upload_link;
        const uri = response.data.uri;
        const vimeoVideoId = uri.split('/').pop();

        return res.status(200).json({
            success: true,
            uploadLink,
            vimeoVideoId,
        });
    } catch (error) {
        console.error('Vimeo Init Error:', error.response?.data || error.message);
        return res.status(500).json({
            error: error.response?.data?.error || 'Failed to initialize Vimeo upload',
        });
    }
});

export default router;