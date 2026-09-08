/* ==========================================================
   REELSBUNDLES BACKEND — MASTER TEST SUITE & PAGE TEST ROUTES
   Endpoints for Master One-Click Orchestration & Page Verification
   Mounted at: /api/admin/test
========================================================== */

import express from "express";
import { adminAuth } from "../middleware/auth.middleware.js";
import {
    runMasterTestSuite,
    getTestStatus,
    getTestRunsHistory,
    addTestSseClient
} from "../services/test-orchestrator.service.js";
import {
    USER_PAGES_REGISTRY,
    ADMIN_PAGES_REGISTRY,
    CORE_API_ENDPOINTS,
    verifyUserPage,
    verifyAdminPage,
    verifyAllUserPages,
    verifyAllAdminPages,
    verifyAllCoreEndpoints,
    runProductionDataAudit
} from "../services/user-page-test.service.js";

const router = express.Router();

/* Middleware supporting token in header or ?token= query parameter (for SSE EventSource) */
function testAuthWrapper(req, res, next) {
    if (!req.headers.authorization && req.query?.token) {
        req.headers.authorization = `Bearer ${String(req.query.token).trim()}`;
    }
    return adminAuth(req, res, next);
}

/* ==========================================================
   1. LIVE TEST TELEMETRY SSE STREAM
   GET /api/admin/test/stream
========================================================== */
router.get("/stream", testAuthWrapper, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    addTestSseClient(res);
});

/* ==========================================================
   2. ORCHESTRATOR STATUS
   GET /api/admin/test/status
========================================================== */
router.get("/status", testAuthWrapper, (req, res) => {
    return res.json({
        success: true,
        ...getTestStatus()
    });
});

/* ==========================================================
   3. RUN HISTORY
   GET /api/admin/test/history
========================================================== */
router.get("/history", testAuthWrapper, (req, res) => {
    return res.json({
        success: true,
        history: getTestRunsHistory()
    });
});

/* ==========================================================
   4. PAGES REGISTRY & LAST KNOWN STATUS
   GET /api/admin/test/pages
========================================================== */
router.get("/pages", testAuthWrapper, (req, res) => {
    return res.json({
        success: true,
        userPages: USER_PAGES_REGISTRY,
        adminPages: ADMIN_PAGES_REGISTRY,
        coreEndpoints: CORE_API_ENDPOINTS
    });
});

/* ==========================================================
   5. MASTER ONE-CLICK TEST SUITE ("🚀 Run All Tests")
   POST /api/admin/test/run-all
========================================================== */
router.post("/run-all", testAuthWrapper, async (req, res) => {
    try {
        const protocol = req.protocol || "http";
        const host = req.get("host") || "127.0.0.1:3000";
        const baseUrl = `${protocol}://${host}`;
        const adminToken = req.headers.authorization?.replace(/^Bearer\s+/i, "") || null;

        const report = await runMasterTestSuite({ baseUrl, adminToken });
        return res.json({
            success: true,
            report
        });
    } catch (err) {
        if (err.code === "ALREADY_RUNNING") {
            return res.status(409).json({
                success: false,
                message: "Test suite already running."
            });
        }
        return res.status(500).json({
            success: false,
            message: "Test suite failed to run: " + err.message
        });
    }
});

/* ==========================================================
   6. VERIFY SINGLE PAGE (USER OR ADMIN)
   POST /api/admin/test/page/:pageKey
========================================================== */
router.post("/page/:pageKey", testAuthWrapper, async (req, res) => {
    try {
        const pageKey = String(req.params.pageKey).trim();
        const protocol = req.protocol || "http";
        const host = req.get("host") || "127.0.0.1:3000";
        const baseUrl = `${protocol}://${host}`;
        const adminToken = req.headers.authorization?.replace(/^Bearer\s+/i, "") || null;

        const isUserPage = USER_PAGES_REGISTRY.some(p => p.id === pageKey);
        const isAdminPage = ADMIN_PAGES_REGISTRY.some(p => p.id === pageKey);

        let result = null;
        if (isUserPage) {
            result = await verifyUserPage(pageKey, { baseUrl, adminToken });
        } else if (isAdminPage) {
            result = await verifyAdminPage(pageKey, { baseUrl, adminToken });
        } else {
            return res.status(404).json({
                success: false,
                message: `Unknown page identifier: ${pageKey}`
            });
        }

        return res.json({
            success: true,
            result
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Page verification failed: " + err.message
        });
    }
});

/* ==========================================================
   7. VERIFY ALL USER PAGES
   POST /api/admin/test/user-pages/run-all
========================================================== */
router.post("/user-pages/run-all", testAuthWrapper, async (req, res) => {
    try {
        const protocol = req.protocol || "http";
        const host = req.get("host") || "127.0.0.1:3000";
        const baseUrl = `${protocol}://${host}`;
        const adminToken = req.headers.authorization?.replace(/^Bearer\s+/i, "") || null;

        const report = await verifyAllUserPages({ baseUrl, adminToken });
        return res.json({
            success: true,
            ...report
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "User pages verification failed: " + err.message
        });
    }
});

/* ==========================================================
   8. AUDIT REAL DATA / DUMMY DATA SCANNER
   POST /api/admin/test/audit/run
========================================================== */
router.post("/audit/run", testAuthWrapper, (req, res) => {
    try {
        const report = runProductionDataAudit();
        return res.json({
            success: true,
            audit: report,
            auditResult: report
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Audit execution failed: " + err.message
        });
    }
});

export default router;
