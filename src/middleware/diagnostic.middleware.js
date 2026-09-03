/* ==========================================================
   REELSBUNDLES BACKEND — OBSERVABILITY & DIAGNOSTIC MIDDLEWARE
   Non-intrusive, zero-overhead Express request/response interceptor
   Monitors all User and Admin APIs. Excludes ONLY monitoring endpoints.
========================================================== */

import { performance } from "perf_hooks";
import {
    generateRequestId,
    recordRequest,
    sanitizeString
} from "../services/diagnostic.service.js";

/* Helper to deduce friendly page name from Referer or Route */
function deducePageName(req) {
    // 1. Explicit client page header
    const clientPage = req.headers["x-rb-page"];
    if (clientPage && typeof clientPage === "string") {
        return sanitizeString(clientPage.trim().slice(0, 50));
    }

    // 2. Referer analysis
    const referer = req.headers["referer"] || "";
    if (referer) {
        try {
            const urlObj = new URL(referer);
            const p = urlObj.pathname.toLowerCase();
            if (p.includes("admin/orders")) return "Admin Orders";
            if (p.includes("admin/users")) return "Admin Users";
            if (p.includes("admin/bundles")) return "Admin Bundles";
            if (p.includes("admin/coupons")) return "Admin Coupons";
            if (p.includes("admin/reviews")) return "Admin Feedback";
            if (p.includes("admin/notifications")) return "Admin Notifications";
            if (p.includes("admin/maintenance")) return "Admin Maintenance";
            if (p.includes("admin/demo-videos")) return "Admin Demo Videos";
            if (p.includes("admin/download")) return "Admin Downloads";
            if (p.includes("admin/storage")) return "Admin Storage";
            if (p.includes("admin/dashboard")) return "Admin Dashboard";
            if (p.includes("admin")) return "Admin Panel";

            if (p.includes("payment")) return "Payment";
            if (p.includes("success")) return "Success";
            if (p.includes("failed")) return "Failed";
            if (p.includes("download")) return "Download";
            if (p.includes("dashboard")) return "Dashboard";
            if (p.includes("login")) return "Login";
            if (p.includes("signup")) return "Signup";
            if (p.includes("contact")) return "Contact";
            if (p.includes("demo")) return "Demo";
            if (p === "/" || p.includes("index")) return "Landing";
        } catch (e) {}
    }

    // 3. Fallback from API route
    const path = (req.originalUrl || req.url || "").toLowerCase();
    if (path.startsWith("/api/admin/orders")) return "Admin Orders";
    if (path.startsWith("/api/admin/users")) return "Admin Users";
    if (path.startsWith("/api/admin/bundles")) return "Admin Bundles";
    if (path.startsWith("/api/admin/coupons")) return "Admin Coupons";
    if (path.startsWith("/api/admin/reviews")) return "Admin Feedback";
    if (path.startsWith("/api/admin/notifications")) return "Admin Notifications";
    if (path.startsWith("/api/admin/maintenance")) return "Admin Maintenance";
    if (path.startsWith("/api/admin/demo-videos")) return "Admin Demo Videos";
    if (path.startsWith("/api/admin/downloads")) return "Admin Downloads";
    if (path.startsWith("/api/admin/storage")) return "Admin Storage";
    if (path.startsWith("/api/admin/dashboard")) return "Admin Dashboard";
    if (path.startsWith("/api/admin")) return "Admin Panel";

    if (path.startsWith("/api/payment")) return "Payment";
    if (path.startsWith("/api/webhook")) return "Webhook";
    if (path.startsWith("/api/secure-download") || path.startsWith("/api/download")) return "Download";
    if (path.startsWith("/api/user/bundles")) return "Dashboard";
    if (path.startsWith("/api/user")) return "User Dashboard";
    if (path.startsWith("/api/auth")) return "Login";
    if (path.startsWith("/api/contact")) return "Contact";

    return req.originalUrl?.startsWith("/api/admin") ? "Admin Panel" : "User Portal";
}

/* Helper to deduce source */
function deduceSource(req) {
    if (req.headers["x-rb-source"]) {
        const s = String(req.headers["x-rb-source"]).toUpperCase().trim();
        if (["USER", "ADMIN", "PUBLIC", "SYSTEM", "FRONTEND"].includes(s)) return s;
    }

    const path = (req.originalUrl || "").toLowerCase();
    if (path.startsWith("/api/admin")) return "ADMIN";
    if (path.startsWith("/api/webhook")) return "SYSTEM";
    if (path.startsWith("/api/user") || path.startsWith("/api/payment") || path.startsWith("/api/secure-download") || req.user) return "USER";
    if (path.startsWith("/api/auth")) return "PUBLIC";

    return "PUBLIC";
}

export function diagnosticMiddleware(req, res, next) {
    const rawUrl = req.originalUrl || req.url || "";

    // EXCLUDE ONLY MONITORING ENDPOINTS
    if (
        rawUrl.startsWith("/api/admin/monitor") ||
        rawUrl.startsWith("/api/monitor/client-error")
    ) {
        return next();
    }

    const startTime = performance.now();
    const requestId = req.headers["x-request-id"] || generateRequestId();
    const correlationId = req.headers["x-correlation-id"] || `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Set correlation headers on outgoing response
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("X-Correlation-Id", correlationId);

    // Attach diagnostic tracker to req
    req.diagnostic = {
        requestId,
        correlationId,
        startTime,
        capturedError: null,
        capturedMessage: null,
        errorCategory: null,
        rootCause: null,
        failureChain: null,
        timeline: [
            { time: new Date().toTimeString().split(" ")[0], step: "Request received" }
        ],
        addTimeline(step, detail = "") {
            const now = new Date();
            const timeStr = `${now.toTimeString().split(" ")[0]}.${String(now.getMilliseconds()).padStart(3, "0")}`;
            this.timeline.push({
                time: timeStr,
                step: detail ? `${step} (${detail})` : step
            });
        },
        setError(err, category = null, rootCause = null, chain = null) {
            this.capturedError = err;
            if (category) this.errorCategory = category;
            if (rootCause) this.rootCause = rootCause;
            if (chain) this.failureChain = chain;
        }
    };

    // Intercept res.json to safely capture error message if status >= 400
    const originalJson = res.json;
    res.json = function(body) {
        try {
            if (res.statusCode >= 400 && body && typeof body === "object") {
                req.diagnostic.capturedMessage = body.message || body.error || body.reason || null;
            }
        } catch (e) {}
        return originalJson.apply(this, arguments);
    };

    // Intercept res.send
    const originalSend = res.send;
    res.send = function(body) {
        try {
            if (res.statusCode >= 400 && !req.diagnostic.capturedMessage) {
                if (typeof body === "string") {
                    try {
                        const parsed = JSON.parse(body);
                        req.diagnostic.capturedMessage = parsed.message || parsed.error || body.slice(0, 150);
                    } catch (e) {
                        req.diagnostic.capturedMessage = body.slice(0, 150);
                    }
                }
            }
        } catch (e) {}
        return originalSend.apply(this, arguments);
    };

    // When response completes, record telemetry
    res.on("finish", () => {
        try {
            const durationMs = performance.now() - startTime;
            const source = deduceSource(req);
            const page = deducePageName(req);

            // Clean path without query string for endpoint identifier
            const endpoint = (req.baseUrl || "") + (req.path || rawUrl.split("?")[0]);

            let errMessage = req.diagnostic.capturedMessage;
            let errStack = null;

            if (req.diagnostic.capturedError) {
                const errObj = req.diagnostic.capturedError;
                errMessage = errMessage || errObj.message || String(errObj);
                errStack = errObj.stack || null;
            }

            // User info
            const userId = req.user?.uid || req.user?.id || req.admin?.id || req.admin?.email || null;
            const userRole = req.admin ? "admin" : (req.user ? "user" : "guest");

            req.diagnostic.addTimeline("Response sent", `HTTP ${res.statusCode}`);

            recordRequest({
                requestId,
                correlationId,
                timestamp: new Date().toISOString(),
                source,
                page,
                method: req.method,
                endpoint,
                path: rawUrl,
                statusCode: res.statusCode,
                durationMs,
                errorMessage: errMessage,
                errorStack: errStack,
                userId,
                userRole,
                userAgent: req.headers["user-agent"],
                referer: req.headers["referer"],
                timeline: req.diagnostic.timeline,
                backendRoute: endpoint,
                isFrontendError: false
            });
        } catch (err) {
            // NEVER let telemetry recording break anything
            console.warn("[Diagnostic Middleware] Safely caught error in finish listener:", err.message);
        }
    });

    next();
}
