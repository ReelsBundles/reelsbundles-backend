import {
    getAllVideos,
    getActiveVideos,
    addVideo as addVideoService,
    toggleVideo as toggleVideoService,
    deleteVideo as deleteVideoService
} from '../services/demo-video-storage.service.js';

export const getPublicDemoVideos = async (req, res) => {
    try {
        const videos = getActiveVideos();
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
        const videos = getAllVideos();
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
        const newVideo = addVideoService(req.body);
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
        const updated = toggleVideoService(req.params.id);
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
        deleteVideoService(req.params.id);
        return res.json({
            success: true,
            message: "Demo video removed."
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
