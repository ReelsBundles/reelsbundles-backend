import express from "express";

import {
    cashfreeWebhook
} from "../controllers/webhook.controller.js";

const router = express.Router();

/**
 * Cashfree Webhook
 *
 * POST /api/webhook/cashfree
 */

router.post(

    "/cashfree",

    cashfreeWebhook

);

export default router;