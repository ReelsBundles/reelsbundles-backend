import express from "express";
import {
    handleSyncUser,
    handleGetAdminUsers,
    handleDeleteAdminUser,
    handleToggleAdminUserStatus
} from "../controllers/user-management.controller.js";

const router = express.Router();

// Public sync user endpoint called on login/signup
router.post("/auth/sync-user", handleSyncUser);
router.post("/users/sync", handleSyncUser);

// Admin user management endpoints
router.get("/admin/users", handleGetAdminUsers);
router.delete("/admin/users/:userId", handleDeleteAdminUser);
router.put("/admin/users/:userId/toggle-status", handleToggleAdminUserStatus);

export default router;
