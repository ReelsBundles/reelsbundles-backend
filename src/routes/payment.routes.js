import { Router } from "express";

import {
    createOrder,
    verifyOrder
} from "../controllers/payment.controller.js";

import {
    firebaseUserAuth
} from "../middleware/auth.middleware.js";

import {
    getUroPayDiagnostics,
    runUroPayMinimalTestOrder
} from "../services/uropay.service.js";

const router = Router();

/* ==========================================================
   PAYMENT HEALTH
========================================================== */
router.get(
    "/health",
    (req, res) => {
        return res.json({
            success: true,
            service: "payment"
        });
    }
);

/* ==========================================================
   SAFE UROPAY DIAGNOSTICS ENDPOINT
========================================================== */
router.get(
    "/uropay-diag",
    async (req, res) => {
        try {
            const diag = await getUroPayDiagnostics();
            const testRun = await runUroPayMinimalTestOrder();
            return res.json({
                success: true,
                diagnostics: diag,
                minimalTestOrderRun: testRun
            });
        } catch (err) {
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
);

/* ==========================================================
   CREATE ORDER
   LOGIN REQUIRED
========================================================== */
router.get(
    "/create-order",
    (req, res) => {
        return res.status(200).json({
            success: true,
            message: "Payment order creation endpoint active. Use HTTP POST with authentication to create payment orders.",
            methodRequired: "POST"
        });
    }
);

router.post(
    "/create-order",
    firebaseUserAuth,
    createOrder
);

/* ==========================================================
   VERIFY ORDER
   LOGIN REQUIRED
========================================================== */
router.get(
    "/verify-order",
    (req, res) => {
        return res.status(200).json({
            success: true,
            message: "Payment verification endpoint active. Use HTTP POST with authentication to verify payment orders.",
            methodRequired: "POST"
        });
    }
);

router.get(
    "/verify/:orderId",
    firebaseUserAuth,
    verifyOrder
);

export default router;