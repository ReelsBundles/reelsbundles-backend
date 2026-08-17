import {
    fetchVideosAsync,
    getActiveVideosAsync,
    addVideo as addVideoService,
    toggleVideo as toggleVideoService,
    deleteVideo as deleteVideoService
} from '../services/demo-video-storage.service.js';

export const getPublicDemoVideos = async (req, res) => {
    try {
        const videos = await getActiveVideosAsync();
        return res.json({
            success: true,
            videos
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch demo videos."
        });
    }
};

export const listAdminVideos = async (req, res) => {
    try {
        const videos = await fetchVideosAsync();
        return res.json({
            success: true,
            videos
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const addVideo = async (req, res) => {
    try {
        const newVideo = await addVideoService(req.body);
        return res.json({
            success: true,
            message: "Demo video added successfully!",
            video: newVideo
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

export const toggleVideo = async (req, res) => {
    try {
        const updated = await toggleVideoService(req.params.id);
        return res.json({
            success: true,
            message: `Video is now ${updated.active ? 'Active' : 'Inactive'}`,
            video: updated
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

export const deleteVideo = async (req, res) => {
    try {
        await deleteVideoService(req.params.id);
        return res.json({
            success: true,
            message: "Demo video deleted successfully."
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
