/* ==========================================================
   REELSBUNDLES BACKEND — OBSERVABILITY & DIAGNOSTIC ROUTES
   Endpoints for Admin Diagnostic Monitor & Client Telemetry
========================================================== */

import express from "express";
import { adminAuth } from "../middleware/auth.middleware.js";
import {
    addSseClient,
    getSummary,
    getRequests,
    getRequestById,
    getEndpointHealth,
    getPageHealth,
    getActiveIncidents,
    clearDiagnosticLogs,
    getReportData,
    recordRequest,
    generateRequestId
} from "../services/diagnostic.service.js";

const router = express.Router();
export const clientMonitorRoutes = express.Router();

/* ==========================================================
   AUTHENTICATION WRAPPER FOR SSE & MONITOR APIs
   Allows token via Authorization header or ?token= for EventSource
========================================================== */
function monitorAdminAuth(req, res, next) {
    if (!req.headers.authorization && req.query?.token) {
        req.headers.authorization = `Bearer ${String(req.query.token).trim()}`;
    }
    return adminAuth(req, res, next);
}

/* ==========================================================
   1. REAL-TIME TELEMETRY SSE STREAM
   GET /api/admin/monitor/stream
========================================================== */
router.get("/stream", monitorAdminAuth, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable NGINX buffering if proxied
    res.flushHeaders?.();

    addSseClient(res);
});

/* ==========================================================
   2. SYSTEM SUMMARY & HEALTH SCORE
   GET /api/admin/monitor/summary
========================================================== */
router.get("/summary", monitorAdminAuth, (req, res) => {
    try {
        const summary = getSummary();
        return res.json({
            success: true,
            summary
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Failed to generate system diagnostic summary."
        });
    }
});

/* ==========================================================
   3. FILTERABLE / SEARCHABLE REQUESTS TABLE
   GET /api/admin/monitor/requests
========================================================== */
router.get("/requests", monitorAdminAuth, (req, res) => {
    try {
        const filter = {
            source: req.query.source,
            result: req.query.result,
            method: req.query.method,
            statusCode: req.query.statusCode,
            category: req.query.category,
            search: req.query.search,
            page: req.query.page,
            limit: req.query.limit
        };

        const data = getRequests(filter);
        return res.json({
            success: true,
            ...data
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch diagnostic request logs."
        });
    }
});

/* ==========================================================
   4. REQUEST TRACE & DETAIL INSPECTION
   GET /api/admin/monitor/requests/:requestId
========================================================== */
router.get("/requests/:requestId", monitorAdminAuth, (req, res) => {
    try {
        const entry = getRequestById(req.params.requestId);
        if (!entry) {
            return res.status(404).json({
                success: false,
                message: "Diagnostic record not found."
            });
        }
        return res.json({
            success: true,
            request: entry
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve request diagnostic record."
        });
    }
});

/* ==========================================================
   5. ENDPOINT HEALTH MATRIX
   GET /api/admin/monitor/endpoints
========================================================== */
router.get("/endpoints", monitorAdminAuth, (req, res) => {
    try {
        const endpoints = getEndpointHealth();
        return res.json({
            success: true,
            endpoints
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Failed to compile endpoint health statistics."
        });
    }
});

/* ==========================================================
   6. PAGE HEALTH MATRIX
   GET /api/admin/monitor/pages
========================================================== */
router.get("/pages", monitorAdminAuth, (req, res) => {
    try {
        const pages = getPageHealth();
        return res.json({
            success: true,
            pages
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Failed to compile page health statistics."
        });
    }
});

/* ==========================================================
   7. ACTIVE PROBLEMS / INCIDENTS VIEW
   GET /api/admin/monitor/incidents
========================================================== */
router.get("/incidents", monitorAdminAuth, (req, res) => {
    try {
        const incidents = getActiveIncidents();
        return res.json({
            success: true,
            incidents
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Failed to compile active incidents."
        });
    }
});

/* ==========================================================
   8. CLEAR MONITORING LOGS (RETENTION ACTION)
   POST /api/admin/monitor/clear
   Strictly clears diagnostic logs only; business data intact.
========================================================== */
router.post("/clear", monitorAdminAuth, (req, res) => {
    const result = clearDiagnosticLogs();
    return res.json(result);
});

/* ==========================================================
   8B. REPORT DATA EXPORT ENDPOINT
   GET /api/admin/monitor/report-data
   Returns aggregated, filtered telemetry for PDF and Excel reports.
========================================================== */
router.get("/report-data", monitorAdminAuth, (req, res) => {
    try {
        const report = getReportData({
            reportType: req.query.reportType,
            dateRange: req.query.dateRange,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            source: req.query.source,
            result: req.query.result,
            method: req.query.method,
            statusCode: req.query.statusCode,
            category: req.query.category,
            page: req.query.page,
            endpoint: req.query.endpoint,
            requestId: req.query.requestId,
            search: req.query.search
        });
        return res.json(report);
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Report generation failed: " + err.message
        });
    }
});

/* ==========================================================
   9. SIMULATE DIAGNOSTIC TEST EVENT
   POST /api/admin/monitor/test-event
   Allows testing the live diagnostic engine safely in dev/staging.
========================================================== */
router.post("/test-event", monitorAdminAuth, (req, res) => {
    try {
        const type = String(req.body.type || "uropay").toLowerCase();
        const now = new Date();
        const testId = generateRequestId();

        let testEntry = null;

        switch (type) {
            case "database":
                testEntry = {
                    requestId: testId,
                    source: "ADMIN",
                    page: "Admin Orders",
                    method: "GET",
                    endpoint: "/api/admin/orders",
                    statusCode: 500,
                    durationMs: 341,
                    errorMessage: "Database query failed while loading admin orders: Firestore collection('payments') unreachable.",
                    errorStack: "Error: Firestore connection timed out\n    at order.service.js:45:12"
                };
                break;

            case "uropay":
            case "payment":
                testEntry = {
                    requestId: testId,
                    source: "USER",
                    page: "Payment",
                    method: "POST",
                    endpoint: "/api/payment/create-order",
                    statusCode: 502,
                    durationMs: 421,
                    errorMessage: "UroPay API request failed: upstream service returned HTTP 502 Bad Gateway.",
                    errorStack: "AxiosError: Request failed with status code 502\n    at createUroPayOrder (uropay.service.js:180:15)"
                };
                break;

            case "uropay_verify":
                testEntry = {
                    requestId: testId,
                    source: "USER",
                    page: "Success",
                    method: "GET",
                    endpoint: "/api/payment/verify/RB_TEST_1234",
                    statusCode: 500,
                    durationMs: 290,
                    errorMessage: "Payment verification failed while checking order status with UroPay: order not confirmed.",
                    errorStack: "Error: UroPay order verification failed\n    at verifyOrder (payment.controller.js:365:10)"
                };
                break;

            case "uropay_webhook":
                testEntry = {
                    requestId: testId,
                    source: "SYSTEM",
                    page: "Webhook",
                    method: "POST",
                    endpoint: "/api/webhook/uropay",
                    statusCode: 400,
                    durationMs: 58,
                    errorMessage: "Invalid webhook signature: HMAC-SHA256 header validation mismatch.",
                    errorStack: "Error: Webhook signature invalid\n    at uropayWebhook (webhook.controller.js:14:20)"
                };
                break;

            case "drive":
            case "download":
                testEntry = {
                    requestId: testId,
                    source: "USER",
                    page: "Download",
                    method: "GET",
                    endpoint: "/api/user/bundles/basic/download",
                    statusCode: 500,
                    durationMs: 512,
                    errorMessage: "Google Drive file retrieval failed: service account permission denied or file not found.",
                    errorStack: "Error: Google Drive API Error (404 Not Found)\n    at getDriveFileInfo (google-drive-stream.service.js:25:9)"
                };
                break;

            case "entitlement":
                testEntry = {
                    requestId: testId,
                    source: "USER",
                    page: "Download",
                    method: "GET",
                    endpoint: "/api/user/bundles/premium/download",
                    statusCode: 403,
                    durationMs: 74,
                    errorMessage: "User has no valid entitlement or verified payment for bundle: premium.",
                    errorStack: "Error: Missing purchase entitlement\n    at userBundleRoutes (user-bundle.routes.js:40:15)"
                };
                break;

            case "auth":
                testEntry = {
                    requestId: testId,
                    source: "USER",
                    page: "Dashboard",
                    method: "GET",
                    endpoint: "/api/user/bundles",
                    statusCode: 401,
                    durationMs: 45,
                    errorMessage: "Authentication required: Firebase ID token expired or signature invalid.",
                    errorStack: "FirebaseAuthError: Firebase ID token has expired\n    at firebaseUserAuth (auth.middleware.js:98:20)"
                };
                break;

            case "js":
            case "frontend":
                testEntry = {
                    requestId: testId,
                    source: "FRONTEND",
                    page: "Dashboard",
                    method: "EVENT",
                    endpoint: "/client/error",
                    statusCode: 0,
                    durationMs: 0,
                    isFrontendError: true,
                    errorMessage: "TypeError: Cannot read properties of undefined (reading 'status')",
                    errorStack: "TypeError: Cannot read properties of undefined (reading 'status')\n    at user-dashboard.js:142:17",
                    clientError: {
                        file: "user-dashboard.js",
                        line: 142,
                        column: 17,
                        message: "Cannot read properties of undefined (reading 'status')"
                    }
                };
                break;

            case "pass":
            default:
                testEntry = {
                    requestId: testId,
                    source: "USER",
                    page: "Dashboard",
                    method: "GET",
                    endpoint: "/api/user/bundles",
                    statusCode: 200,
                    durationMs: 89,
                    errorMessage: null
                };
                break;
        }

        const recorded = recordRequest(testEntry);

        return res.json({
            success: true,
            message: `Diagnostic test event '${type}' simulated successfully.`,
            event: recorded
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Failed to simulate test event: " + err.message
        });
    }
});

/* ==========================================================
   10. PUBLIC CLIENT TELEMETRY RECEIVER
   POST /api/monitor/client-error
   Ingests frontend JavaScript exceptions and network errors.
========================================================== */
const clientErrorTimestamps = new Map();

clientMonitorRoutes.post("/client-error", (req, res) => {
    try {
        const body = req.body || {};
        const ip = req.ip || req.headers["x-forwarded-for"] || "client";
        const errorMsg = String(body.message || body.errorMessage || "Unknown client error").slice(0, 300);

        // Rate-limiting / deduplication: max 1 per signature per 10s per IP
        const signature = `${ip}::${errorMsg.slice(0, 50)}::${body.file || ""}`;
        const lastSeen = clientErrorTimestamps.get(signature) || 0;
        const now = Date.now();

        if (now - lastSeen < 10000) {
            return res.status(200).json({ success: true, debounced: true });
        }
        clientErrorTimestamps.set(signature, now);

        if (clientErrorTimestamps.size > 2000) {
            const first = clientErrorTimestamps.keys().next().value;
            clientErrorTimestamps.delete(first);
        }

        const requestId = body.requestId || generateRequestId();
        const correlationId = body.correlationId || `corr_${now}`;

        recordRequest({
            requestId,
            correlationId,
            timestamp: new Date().toISOString(),
            source: "FRONTEND",
            page: body.page || "User Page",
            method: "EVENT",
            endpoint: body.endpoint || body.file || "/client-error",
            path: body.url || body.file || "/client-error",
            statusCode: body.networkStatus || 0,
            durationMs: body.durationMs || 0,
            errorMessage: errorMsg,
            errorStack: String(body.stack || "").slice(0, 1000),
            userId: body.userId || null,
            userRole: body.userRole || "client",
            userAgent: req.headers["user-agent"],
            referer: req.headers["referer"],
            isFrontendError: true,
            clientError: {
                file: body.file || "unknown",
                line: body.line || body.lineno || 0,
                column: body.column || body.colno || 0,
                message: errorMsg,
                networkError: Boolean(body.isNetworkError)
            }
        });

        return res.status(200).json({ success: true });
    } catch (err) {
        // Never fail on client reporting
        return res.status(200).json({ success: true });
    }
});

export default router;
