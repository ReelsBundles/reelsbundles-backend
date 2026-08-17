import { Router } from "express";
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
router.get("/admin/demo-videos", listAdminVideos);
router.post("/admin/demo-videos", addVideo);
router.put("/admin/demo-videos/:id/toggle", toggleVideo);
router.delete("/admin/demo-videos/:id", deleteVideo);

export default router;
