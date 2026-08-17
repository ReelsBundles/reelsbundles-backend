import express from "express";
import {
    getPublicProtectionSettings,
    updateAdminProtectionSettings
} from "../controllers/protection.controller.js";
import { verifyAdminToken } from "../middlewares/admin.middleware.js";

const router = express.Router();

router.get("/status", getPublicProtectionSettings);
router.get("/protection/status", getPublicProtectionSettings);
router.post("/update", verifyAdminToken, updateAdminProtectionSettings);
router.post("/admin/update", verifyAdminToken, updateAdminProtectionSettings);

export default router;
