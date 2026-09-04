import { Router } from "express";
import {
    getMaintenanceStatus,
    updateMaintenanceStatus,
    verifyMaintenancePin,
    getPublicStats
} from "../controllers/system.controller.js";
import {
    handleGetPublicAlerts,
    handleGetAdminAlerts,
    handleCreateAdminAlert,
    handleUpdateAdminAlert,
    handleDeleteAdminAlert
} from "../controllers/alert.controller.js";
import { adminAuth } from "../middleware/auth.middleware.js";

const router = Router();

// Public routes for maintenance telemetry & live system stats
router.get("/system/maintenance", getMaintenanceStatus);
router.get("/system/stats", getPublicStats);
router.post("/system/verify-pin", verifyMaintenancePin);

// Public route for active Important Alerts
router.get("/system/important-alerts", handleGetPublicAlerts);

// Admin route to manage maintenance telemetry
router.put("/admin/system/maintenance", adminAuth, updateMaintenanceStatus);

// Admin routes to manage Important Alerts
router.get("/admin/system/important-alerts", adminAuth, handleGetAdminAlerts);
router.post("/admin/system/important-alerts", adminAuth, handleCreateAdminAlert);
router.put("/admin/system/important-alerts/:id", adminAuth, handleUpdateAdminAlert);
router.delete("/admin/system/important-alerts/:id", adminAuth, handleDeleteAdminAlert);

export default router;
