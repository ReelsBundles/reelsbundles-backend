import { Router } from "express";
import { adminAuth } from "../middleware/auth.middleware.js";
import {
    getPublicDemoVideos,
    listAdminVideos,
    addVideo,
    toggleVideo,
    deleteVideo
} from "../controllers/demo-video.controller.js";

const router = Router();

// Public endpoint for demo.html
router.get("/demo/videos", getPublicDemoVideos);

// Admin endpoints
router.get("/admin/demo-videos", adminAuth, listAdminVideos);
router.post("/admin/demo-videos", adminAuth, addVideo);
router.put("/admin/demo-videos/:id/toggle", adminAuth, toggleVideo);
router.delete("/admin/demo-videos/:id", adminAuth, deleteVideo);

export default router;
