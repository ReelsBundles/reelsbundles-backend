import express from "express";
import {
    getPublicProtectionSettings,
    updateAdminProtectionSettings
} from "../controllers/protection.controller.js";

const router = express.Router();

router.get("/", getPublicProtectionSettings);
router.get("/status", getPublicProtectionSettings);
router.get("/protection", getPublicProtectionSettings);
router.get("/protection/status", getPublicProtectionSettings);
router.get("/settings/protection", getPublicProtectionSettings);

router.post("/", updateAdminProtectionSettings);
router.post("/update", updateAdminProtectionSettings);
router.post("/protection", updateAdminProtectionSettings);
router.post("/protection/update", updateAdminProtectionSettings);
router.post("/admin/protection", updateAdminProtectionSettings);
router.post("/admin/protection/update", updateAdminProtectionSettings);

export default router;
