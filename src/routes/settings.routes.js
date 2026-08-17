import express from "express";
import {
    getPublicProtectionSettings,
    updateAdminProtectionSettings
} from "../controllers/settings.controller.js";
import { verifyAdminToken } from "../middlewares/admin.middleware.js";

const router = express.Router();

router.get("/protection", getPublicProtectionSettings);
router.post("/admin/protection", verifyAdminToken, updateAdminProtectionSettings);

export default router;
