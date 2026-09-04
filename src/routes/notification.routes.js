import express from "express";
import { adminAuth } from "../middleware/auth.middleware.js";
import {
    handleGetPublicNotifications,
    handleGetAdminNotifications,
    handleCreateAdminNotification,
    handleUpdateAdminNotification,
    handleDeleteAdminNotification
} from "../controllers/notification.controller.js";

const router = express.Router();

// Public routes
router.get("/notifications", handleGetPublicNotifications);

// Admin routes (Protected by Admin Auth)
router.get("/admin/notifications", adminAuth, handleGetAdminNotifications);
router.post("/admin/notifications", adminAuth, handleCreateAdminNotification);
router.put("/admin/notifications/:id", adminAuth, handleUpdateAdminNotification);
router.delete("/admin/notifications/:id", adminAuth, handleDeleteAdminNotification);

export default router;
