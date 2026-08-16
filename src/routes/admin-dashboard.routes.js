import express from "express";
import { dashboard } from "../controllers/admin-dashboard.controller.js";
import { adminAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", adminAuth, dashboard);

export default router;