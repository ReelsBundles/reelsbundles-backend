import { Router } from "express";
import {
    getMaintenanceStatus,
    updateMaintenanceStatus,
    verifyMaintenancePin
} from "../controllers/system.controller.js";

const router = Router();

// Public route to check maintenance telemetry
router.get("/system/maintenance", getMaintenanceStatus);
router.post("/system/verify-pin", verifyMaintenancePin);

// Admin route to manage maintenance telemetry
router.put("/admin/system/maintenance", updateMaintenanceStatus);

export default router;
