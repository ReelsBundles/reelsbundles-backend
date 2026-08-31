import express from "express";
import {
    uropayWebhook,
    cashfreeWebhook
} from "../controllers/webhook.controller.js";

const router = express.Router();

/* ==========================================================
   UROPAY WEBHOOK: POST /api/webhook/uropay
========================================================== */
router.post("/uropay", uropayWebhook);

/* ==========================================================
   CASHFREE COMPATIBILITY ALIAS: POST /api/webhook/cashfree
========================================================== */
router.post("/cashfree", cashfreeWebhook);

export default router;