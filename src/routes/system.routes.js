import { Router } from "express";
import {
    getMaintenanceStatus,
    updateMaintenanceStatus,
    verifyMaintenancePin,
    getPublicStats
} from "../controllers/system.controller.js";

const router = Router();

// Public routes for maintenance telemetry & live system stats
router.get("/system/maintenance", getMaintenanceStatus);
router.get("/system/stats", getPublicStats);
router.post("/system/verify-pin", verifyMaintenancePin);

// Admin route to manage maintenance telemetry
router.put("/admin/system/maintenance", updateMaintenanceStatus);

export default router;
