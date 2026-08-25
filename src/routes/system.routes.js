import { Router } from "express";
import {
    getMaintenanceStatus,
    updateMaintenanceStatus
} from "../controllers/system.controller.js";

const router = Router();

// Public route to check maintenance telemetry
router.get("/system/maintenance", getMaintenanceStatus);

// Admin route to manage maintenance telemetry
router.put("/admin/system/maintenance", updateMaintenanceStatus);

export default router;
