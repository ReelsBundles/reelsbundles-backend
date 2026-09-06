import express from "express";
import { adminAuth } from "../middleware/auth.middleware.js";
import {
    handleSyncUser,
    handleGetUserStatus,
    handleGetAdminUsers,
    handleDeleteAdminUser,
    handleToggleAdminUserStatus,
    handleDeleteAllAdminUsers
} from "../controllers/user-management.controller.js";

const router = express.Router();

// Public endpoints
router.post("/auth/sync-user", handleSyncUser);
router.post("/users/sync", handleSyncUser);
router.get("/user/status", handleGetUserStatus);

// Admin user management endpoints
router.get("/admin/users", adminAuth, handleGetAdminUsers);
router.delete("/admin/users/all", adminAuth, handleDeleteAllAdminUsers);
router.delete("/admin/users-all", adminAuth, handleDeleteAllAdminUsers);
router.delete("/admin/users/:userId", adminAuth, handleDeleteAdminUser);
router.put("/admin/users/:userId/toggle-status", adminAuth, handleToggleAdminUserStatus);

export default router;
