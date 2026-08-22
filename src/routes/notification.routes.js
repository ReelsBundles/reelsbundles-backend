import express from "express";
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

// Admin routes
router.get("/admin/notifications", handleGetAdminNotifications);
router.post("/admin/notifications", handleCreateAdminNotification);
router.put("/admin/notifications/:id", handleUpdateAdminNotification);
router.delete("/admin/notifications/:id", handleDeleteAdminNotification);

export default router;
