/* ==========================================================
   REELSBUNDLES BACKEND — OBSERVABILITY & DIAGNOSTIC SERVICE
   Zero-disruption, evidentiary diagnostic telemetry engine
   Supports User APIs, Admin APIs, UroPay, Google Drive,
   Database, Frontend, and Network error diagnosis.
========================================================== */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../../data");
const LOG_FILE = path.join(DATA_DIR, "diagnostic_logs.json");

// Retention limits
const MAX_MEMORY_RECORDS = 1000;
const MAX_DISK_RECORDS = 5000;

/* ==========================================================
   IN-MEMORY BUFFER & SSE SUBSCRIBERS
========================================================== */
let requestBuffer = [];
const sseClients = new Set();
let isPersisting = false;
let needsPersist = false;

/* Ensure data directory exists */
try {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
} catch (e) {
    console.warn("[Diagnostic Service] Failed to ensure data directory:", e.message);
}

/* Load persisted logs on startup */
function loadPersistedLogs() {
    try {
        if (fs.existsSync(LOG_FILE)) {
            const raw = fs.readFileSync(LOG_FILE, "utf8");
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                requestBuffer = parsed.slice(-MAX_MEMORY_RECORDS);
                console.log(`[Diagnostic Service] Loaded ${requestBuffer.length} diagnostic records from disk.`);
            }
        }
    } catch (err) {
        console.warn("[Diagnostic Service] Error loading persisted logs:", err.message);
        requestBuffer = [];
    }
}
loadPersistedLogs();

/* Save logs to disk with auto-retention (debounced) */
function schedulePersist() {
    if (isPersisting) {
        needsPersist = true;
        return;
    }

    isPersisting = true;
    setTimeout(() => {
        try {
            const recordsToSave = requestBuffer.slice(-MAX_DISK_RECORDS);
            fs.writeFileSync(LOG_FILE, JSON.stringify(recordsToSave, null, 2), "utf8");
        } catch (err) {
            console.warn("[Diagnostic Service] Failed to persist logs to disk:", err.message);
        } finally {
            isPersisting = false;
            if (needsPersist) {
                needsPersist = false;
                schedulePersist();
            }
        }
    }, 1500);
}

/* ==========================================================
   SECRET SANITIZATION
   Strictly redacts passwords, tokens, API keys, UroPay
   credentials, Google Drive private keys, card data, and secrets.
========================================================== */
const SENSITIVE_PATTERNS = [
    /password/i,
    /token/i,
    /secret/i,
    /key/i,
    /auth/i,
    /cookie/i,
    /credential/i,
    /signature/i,
    /uropay.*key/i,
    /uropay.*secret/i,
    /service.*account/i,
    /private.*key/i,
    /cvv/i,
    /card/i,
    /session/i
];

export function sanitizeString(val) {
    if (typeof val !== "string") return val;
    let sanitized = val;

    // Redact Bearer tokens
    sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]");

    // Redact JWT tokens
    sanitized = sanitized.replace(/eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*/g, "[REDACTED_JWT]");

    // Redact 32+ hex strings (hashes / private keys)
    sanitized = sanitized.replace(/\b[a-f0-9]{32,64}\b/gi, (match) => {
        // preserve UUIDs
        if (match.includes("-")) return match;
        return "[REDACTED_KEY]";
    });

    return sanitized;
}

export function sanitizeObject(obj, depth = 0) {
    if (depth > 5 || obj === null || obj === undefined) return obj;
    if (typeof obj === "string") return sanitizeString(obj);
    if (typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item, depth + 1));
    }

    const cleaned = {};
    for (const [k, v] of Object.entries(obj)) {
        const isSensitive = SENSITIVE_PATTERNS.some(p => p.test(k));
        if (isSensitive) {
            cleaned[k] = "[REDACTED]";
        } else if (typeof v === "object" && v !== null) {
            cleaned[k] = sanitizeObject(v, depth + 1);
        } else if (typeof v === "string") {
            cleaned[k] = sanitizeString(v);
        } else {
            cleaned[k] = v;
        }
    }
    return cleaned;
}

export function maskUserId(userId) {
    if (!userId) return "guest";
    const str = String(userId).trim();
    if (str.includes("@")) {
        const [local, domain] = str.split("@");
        const maskedLocal = local.length > 2 ? local[0] + "***" + local[local.length - 1] : "***";
        return `${maskedLocal}@${domain}`;
    }
    if (str.length > 6) {
        return str.slice(0, 3) + "***" + str.slice(-3);
    }
    return "***" + str.slice(-2);
}

/* ==========================================================
   REQUEST ID GENERATOR
   Format: RB-YYYYMMDD-HHMMSS-XXXX
========================================================== */
export function generateRequestId() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `RB-${yyyy}${mm}${dd}-${hh}${min}${ss}-${rand}`;
}

/* ==========================================================
   EVIDENTIARY ERROR CLASSIFICATION
   Classifies errors strictly based on evidence: status codes,
   endpoints, and actual error messages. Never invents claims.
========================================================== */
export function classifyError(entry) {
    const status = entry.statusCode || 200;
    const endpoint = entry.endpoint || "";
    const message = (entry.errorMessage || "").toLowerCase();
    const errorStack = (entry.errorStack || "").toLowerCase();
    const errorCombined = `${message} ${errorStack}`;

    // 1. Client / Frontend Reported Error
    if (entry.source === "FRONTEND" || endpoint.includes("/api/monitor/client-error") || entry.isFrontendError) {
        return {
            category: "FRONTEND",
            code: "FRONTEND_JS_ERROR",
            rootCause: "FRONTEND → JavaScript exception",
            safeMessage: entry.errorMessage || "Frontend client-side JavaScript error."
        };
    }

    // 2. UroPay Webhook / Callback
    if (endpoint.includes("/webhook/uropay") || (endpoint.includes("/webhook") && errorCombined.includes("uropay")) || errorCombined.includes("webhook signature")) {
        return {
            category: "UROPAY_CALLBACK",
            code: "UROPAY_WEBHOOK_ERROR",
            rootCause: "UROPAY_CALLBACK → webhook signature or event processing failed",
            safeMessage: entry.errorMessage || "UroPay webhook callback validation failed."
        };
    }

    // 3. Payment Verification
    if ((endpoint.includes("/payment") && endpoint.includes("/verify")) || errorCombined.includes("payment verification")) {
        return {
            category: "PAYMENT_VERIFICATION",
            code: "PAYMENT_VERIFICATION_FAILED",
            rootCause: "PAYMENT_VERIFICATION → upstream order verification failed",
            safeMessage: entry.errorMessage || "Payment verification failed while checking order status with UroPay."
        };
    }

    // 4. UroPay Order & Upstream Gateway
    if (endpoint.includes("/api/payment") || errorCombined.includes("uropay") || errorCombined.includes("tenantorderref") || errorCombined.includes("uropai.in")) {
        if (status === 502 || status === 503 || errorCombined.includes("502") || errorCombined.includes("bad gateway") || errorCombined.includes("api.uropai.in")) {
            return {
                category: "UROPAY_UPSTREAM",
                code: "UROPAY_UPSTREAM_ERROR",
                rootCause: "UROPAY_UPSTREAM → upstream request failed",
                safeMessage: entry.errorMessage || "Upstream UroPay payment gateway returned an error."
            };
        }

        if (status === 504 || errorCombined.includes("timeout")) {
            return {
                category: "PAYMENT_TIMEOUT",
                code: "PAYMENT_TIMEOUT_ERROR",
                rootCause: "PAYMENT_TIMEOUT → gateway timed out",
                safeMessage: entry.errorMessage || "Payment gateway connection timed out."
            };
        }

        if (status === 400 || status === 422 || errorCombined.includes("validation") || errorCombined.includes("invalid plan") || errorCombined.includes("amount")) {
            return {
                category: "PAYMENT_VALIDATION",
                code: "PAYMENT_PAYLOAD_INVALID",
                rootCause: "PAYMENT_VALIDATION → invalid payment request data",
                safeMessage: entry.errorMessage || "Payment validation failed on submitted data."
            };
        }

        if (errorCombined.includes("credentials") || errorCombined.includes("api key") || errorCombined.includes("uropay_env")) {
            return {
                category: "UROPAY",
                code: "UROPAY_CONFIG_ERROR",
                rootCause: "UROPAY → credentials or environment unconfigured",
                safeMessage: "UroPay API credentials or environment configuration missing."
            };
        }

        return {
            category: "PAYMENT",
            code: "PAYMENT_ERROR",
            rootCause: "PAYMENT → payment order processing failure",
            safeMessage: entry.errorMessage || "Payment order processing encountered an error."
        };
    }

    // 5. Entitlement Specific Check
    if (errorCombined.includes("entitlement") || errorCombined.includes("no valid entitlement") || errorCombined.includes("purchase required") || errorCombined.includes("missing purchase entitlement")) {
        return {
            category: "ENTITLEMENT",
            code: "ENTITLEMENT_MISSING",
            rootCause: "ENTITLEMENT → user entitlement missing",
            safeMessage: "User has no verified entitlement or completed purchase for this bundle."
        };
    }

    // 6. Google Drive & Download
    if (endpoint.includes("/secure-download") || (endpoint.includes("/download") && !endpoint.includes("/admin")) || errorCombined.includes("drive") || errorCombined.includes("googleapis")) {
        if (errorCombined.includes("service account") || errorCombined.includes("drive") || errorCombined.includes("google")) {
            return {
                category: "GOOGLE DRIVE",
                code: "GOOGLE_DRIVE_ERROR",
                rootCause: "GOOGLE DRIVE → file access failed",
                safeMessage: entry.errorMessage || "Google Drive file retrieval or streaming failed."
            };
        }

        return {
            category: "DOWNLOAD",
            code: "DOWNLOAD_ERROR",
            rootCause: "DOWNLOAD → file stream or authorization failed",
            safeMessage: entry.errorMessage || "Download retrieval or token validation failed."
        };
    }

    // 7. Database (Firestore / Supabase)
    if (
        errorCombined.includes("firestore") ||
        errorCombined.includes("collection") ||
        errorCombined.includes("document") ||
        errorCombined.includes("snapshot") ||
        errorCombined.includes("database") ||
        errorCombined.includes("16 unauthenticated") ||
        (errorCombined.includes("unauthenticated") && (errorCombined.includes("oauth 2") || errorCombined.includes("developers.google.com") || errorCombined.includes("devconsole-project") || errorCombined.includes("grpc")))
    ) {
        let rc = "DATABASE → query failed";
        if (errorCombined.includes("connection") || errorCombined.includes("unavailable")) {
            rc = "DATABASE → connection failed";
        } else if (
            errorCombined.includes("16 unauthenticated") ||
            errorCombined.includes("oauth 2") ||
            errorCombined.includes("developers.google.com") ||
            errorCombined.includes("devconsole-project")
        ) {
            rc = "DATABASE → service account credentials invalid or expired";
        } else if (errorCombined.includes("permission") || errorCombined.includes("insufficient permissions")) {
            rc = "DATABASE → permission denied";
        } else if (errorCombined.includes("not found")) {
            rc = "DATABASE → document missing";
        }

        return {
            category: "DATABASE",
            code: "DATABASE_ERROR",
            rootCause: rc,
            safeMessage: entry.errorMessage || "Database operation failed."
        };
    }

    // 8. Routing / Not Found
    if (status === 404) {
        return {
            category: "ROUTING",
            code: "ENDPOINT_NOT_FOUND",
            rootCause: "ROUTING → endpoint not found",
            safeMessage: `Requested API endpoint '${entry.endpoint}' does not exist on this server.`
        };
    }

    // 9. Rate Limit
    if (status === 429) {
        return {
            category: "RATE LIMIT",
            code: "RATE_LIMIT_EXCEEDED",
            rootCause: "RATE LIMIT → too many requests",
            safeMessage: "Too many requests submitted. Rate limit exceeded."
        };
    }

    // 10. Authentication (401)
    if (
        status === 401 ||
        (
            (errorCombined.includes("unauthenticated") || errorCombined.includes("invalid token") || errorCombined.includes("token expired") || errorCombined.includes("authentication required")) &&
            !errorCombined.includes("oauth 2") &&
            !errorCombined.includes("developers.google.com") &&
            !errorCombined.includes("devconsole-project") &&
            !errorCombined.includes("16 unauthenticated")
        )
    ) {
        let rc = "AUTH → invalid session";
        if (errorCombined.includes("token expired")) rc = "AUTH → token expired";
        else if (errorCombined.includes("missing") || errorCombined.includes("header missing")) rc = "AUTH → missing token";

        return {
            category: "AUTHENTICATION",
            code: "AUTH_UNAUTHORIZED",
            rootCause: rc,
            safeMessage: entry.errorMessage || "Authentication required or credentials expired."
        };
    }

    // 11. Authorization (403)
    if (status === 403 || errorCombined.includes("suspended") || errorCombined.includes("permission denied") || errorCombined.includes("access denied") || errorCombined.includes("forbidden")) {
        let rc = "AUTHORIZATION → permission denied";
        if (errorCombined.includes("suspended") || errorCombined.includes("locked")) rc = "AUTHORIZATION → account suspended";
        else if (endpoint.startsWith("/api/admin")) rc = "AUTHORIZATION → admin permission denied";

        return {
            category: "AUTHORIZATION",
            code: "AUTH_FORBIDDEN",
            rootCause: rc,
            safeMessage: entry.errorMessage || "Access forbidden. User lacks required permissions."
        };
    }

    // 12. Request Validation (400, 422)
    if (status === 400 || status === 422 || errorCombined.includes("entity.parse.failed") || errorCombined.includes("validation")) {
        return {
            category: "VALIDATION",
            code: "VALIDATION_FAILED",
            rootCause: "VALIDATION → invalid request payload",
            safeMessage: entry.errorMessage || "Request payload failed validation requirements."
        };
    }

    // 13. Network / Timeout / Gateway errors (504, 502, 503)
    if (status === 504 || errorCombined.includes("timeout") || errorCombined.includes("etimedout") || errorCombined.includes("econnaborted")) {
        return {
            category: "TIMEOUT",
            code: "GATEWAY_TIMEOUT",
            rootCause: "TIMEOUT → connection timed out",
            safeMessage: "Request or upstream service operation timed out."
        };
    }

    if (status === 502 || status === 503 || errorCombined.includes("bad gateway") || errorCombined.includes("service unavailable")) {
        return {
            category: "UPSTREAM",
            code: "UPSTREAM_UNAVAILABLE",
            rootCause: "UPSTREAM → external service unavailable",
            safeMessage: "Upstream gateway or external service returned an unavailable status."
        };
    }

    if (errorCombined.includes("failed to fetch") || errorCombined.includes("networkerror") || errorCombined.includes("econnrefused")) {
        return {
            category: "NETWORK",
            code: "NETWORK_FAILURE",
            rootCause: "NETWORK → connection refused or unreachable",
            safeMessage: "Network connection failure or target service unreachable."
        };
    }

    // 14. Generic Backend 500
    if (status >= 500) {
        return {
            category: "BACKEND",
            code: "INTERNAL_SERVER_ERROR",
            rootCause: "BACKEND → unhandled exception",
            safeMessage: entry.errorMessage || "Unhandled backend server exception."
        };
    }

    return {
        category: "UNKNOWN",
        code: "UNKNOWN_ERROR",
        rootCause: "UNKNOWN / NEEDS INVESTIGATION",
        safeMessage: entry.errorMessage || "Unclassified failure occurred."
    };
}

/* ==========================================================
   FAILURE CHAIN BUILDER
   Generates a stepped breadcrumb chain showing exact path.
========================================================== */
export function buildFailureChain(entry, classification) {
    const page = entry.page || (entry.source === "ADMIN" ? "Admin Panel" : "User App");
    const chain = [`${page}`];

    // Endpoint step
    chain.push(`${entry.method || "GET"} ${entry.endpoint || "/"}`);

    // Dependency step
    if (classification.category.startsWith("UROPAY") || classification.category.startsWith("PAYMENT")) {
        chain.push("UroPay Payment Gateway (api.uropai.in)");
        if (classification.category === "UROPAY_CALLBACK") {
            chain.push("Webhook Signature Verification");
        } else if (classification.category === "PAYMENT_VERIFICATION") {
            chain.push("Order Status Verification");
        }
    } else if (classification.category === "GOOGLE DRIVE") {
        chain.push("Google Drive API");
        chain.push("File Access Stream");
    } else if (classification.category === "DOWNLOAD") {
        chain.push("Secure Download Service");
    } else if (classification.category === "ENTITLEMENT") {
        chain.push("Entitlement Verification");
    } else if (classification.category === "DATABASE") {
        chain.push("Firestore Database Query");
    } else if (classification.category === "AUTHENTICATION") {
        chain.push("Firebase Auth Token Verifier");
    } else if (classification.category === "FRONTEND") {
        chain.push("Browser Client Execution");
    } else {
        chain.push("Backend Controller");
    }

    // Final outcome
    chain.push(classification.rootCause);
    chain.push(`HTTP ${entry.statusCode || 500} Response`);

    return chain;
}

/* ==========================================================
   RECORD REQUEST TELEMETRY
   Zero-disruption wrapper that captures every request.
========================================================== */
export function recordRequest(payload) {
    try {
        const sc = Number(payload.statusCode || payload.status_code || 200);
        const isPass = sc < 400 && payload.result !== "FAIL";
        const now = new Date();

        let classification = null;
        let failureChain = null;

        if (!isPass || payload.isFrontendError) {
            classification = classifyError(payload);
            failureChain = buildFailureChain(payload, classification);
        }

        const safeEntry = {
            id: payload.requestId || payload.id || generateRequestId(),
            request_id: payload.requestId || payload.id || generateRequestId(),
            correlation_id: payload.correlationId || `corr_${Date.now()}`,
            timestamp: payload.timestamp || now.toISOString(),
            time_formatted: now.toTimeString().split(" ")[0],
            source: payload.source || "PUBLIC", // USER | ADMIN | PUBLIC | SYSTEM | FRONTEND
            page: payload.page || (payload.source === "ADMIN" ? "Admin Dashboard" : "User Portal"),
            method: (payload.method || "GET").toUpperCase(),
            endpoint: payload.endpoint || "/",
            path: sanitizeString(payload.path || payload.endpoint || "/"),
            status_code: sc,
            result: isPass ? "PASS" : "FAIL",
            duration_ms: Math.max(0, Math.round(payload.durationMs || payload.duration_ms || 0)),
            error_category: classification ? classification.category : null,
            error_code: classification ? classification.code : null,
            safe_error_message: classification ? sanitizeString(classification.safeMessage) : null,
            safe_root_cause: classification ? classification.rootCause : null,
            failure_chain: failureChain,
            backend_route: payload.backendRoute || payload.endpoint || "/",
            controller: payload.controller || null,
            database_op: payload.databaseOp || null,
            external_service: classification ? (
                classification.category.includes("UROPAY") ? "UroPay" :
                classification.category.includes("GOOGLE") ? "Google Drive" :
                classification.category.includes("DATABASE") ? "Firestore" :
                classification.category.includes("AUTH") ? "Firebase Auth" : null
            ) : null,
            user_id_masked: maskUserId(payload.userId),
            user_role: payload.userRole || "guest",
            user_agent: sanitizeString(payload.userAgent || ""),
            referer: sanitizeString(payload.referer || ""),
            timeline: Array.isArray(payload.timeline) ? payload.timeline : [
                { time: now.toTimeString().split(" ")[0], step: "Request processed" }
            ],
            client_error: payload.clientError ? sanitizeObject(payload.clientError) : null
        };

        // Append to circular memory buffer
        requestBuffer.push(safeEntry);
        if (requestBuffer.length > MAX_MEMORY_RECORDS) {
            requestBuffer.shift();
        }

        // Schedule async disk persist
        schedulePersist();

        // Broadcast to live SSE subscribers
        broadcastSseEvent("request", safeEntry);

        if (!isPass) {
            broadcastSseEvent("alert", {
                id: safeEntry.id,
                time: safeEntry.time_formatted,
                source: safeEntry.source,
                method: safeEntry.method,
                endpoint: safeEntry.endpoint,
                statusCode: safeEntry.status_code,
                category: safeEntry.error_category,
                durationMs: safeEntry.duration_ms,
                message: safeEntry.safe_error_message,
                rootCause: safeEntry.safe_root_cause
            });
        }

        return safeEntry;
    } catch (err) {
        console.warn("[Diagnostic Service] Failed to record request safely:", err.message);
        return null;
    }
}

/* ==========================================================
   SSE REAL-TIME STREAMING
========================================================== */
export function addSseClient(res) {
    sseClients.add(res);
    // Send initial handshake ping
    try {
        res.write(`event: connected\ndata: ${JSON.stringify({ live: true, timestamp: Date.now() })}\n\n`);
    } catch (e) {}

    res.on("close", () => {
        sseClients.delete(res);
    });
}

export function broadcastSseEvent(eventType, data) {
    if (sseClients.size === 0) return;
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
        try {
            client.write(payload);
        } catch (err) {
            sseClients.delete(client);
        }
    }
}

// 15-second keepalive heartbeat
const sseHeartbeatTimer = setInterval(() => {
    if (sseClients.size > 0) {
        broadcastSseEvent("ping", { time: Date.now() });
    }
}, 15000);
if (sseHeartbeatTimer && typeof sseHeartbeatTimer.unref === "function") {
    sseHeartbeatTimer.unref();
}

/* ==========================================================
   TELEMETRY QUERIES & AGGREGATIONS
========================================================== */
export function getRequests(filter = {}) {
    let list = [...requestBuffer];

    // Source filter
    if (filter.source && filter.source !== "ALL") {
        list = list.filter(r => r.source === filter.source);
    }

    // Result filter
    if (filter.result && filter.result !== "ALL") {
        list = list.filter(r => r.result === filter.result);
    }

    // Method filter
    if (filter.method && filter.method !== "ALL") {
        list = list.filter(r => r.method === filter.method.toUpperCase());
    }

    // Status code family (2xx, 3xx, 4xx, 5xx)
    if (filter.statusCode && filter.statusCode !== "ALL") {
        const family = parseInt(filter.statusCode[0], 10);
        if (!isNaN(family)) {
            list = list.filter(r => Math.floor(r.status_code / 100) === family);
        }
    }

    // Category filter
    if (filter.category && filter.category !== "ALL") {
        list = list.filter(r => r.error_category === filter.category);
    }

    // Search query
    if (filter.search) {
        const q = String(filter.search).toLowerCase().trim();
        list = list.filter(r => 
            (r.endpoint && r.endpoint.toLowerCase().includes(q)) ||
            (r.request_id && r.request_id.toLowerCase().includes(q)) ||
            (r.page && r.page.toLowerCase().includes(q)) ||
            (r.safe_error_message && r.safe_error_message.toLowerCase().includes(q)) ||
            (r.error_category && r.error_category.toLowerCase().includes(q)) ||
            (r.status_code && String(r.status_code).includes(q))
        );
    }

    // Newest first
    list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const total = list.length;
    const limit = Math.min(Math.max(Number(filter.limit) || 100, 1), 500);
    const page = Math.max(Number(filter.page) || 1, 1);
    const offset = (page - 1) * limit;

    const items = list.slice(offset, offset + limit);

    return {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        items
    };
}

export function getRequestById(requestId) {
    if (!requestId) return null;
    return requestBuffer.find(r => r.request_id === requestId || r.id === requestId) || null;
}

/* ==========================================================
   SYSTEM HEALTH SCORE & SUMMARY
========================================================== */
export function getSummary() {
    const totalRequests = requestBuffer.length;
    let passCount = 0;
    let failCount = 0;
    let count4xx = 0;
    let count5xx = 0;
    let frontendErrors = 0;
    let databaseErrors = 0;
    let paymentErrors = 0;
    let totalDuration = 0;

    let userRequests = 0;
    let userPass = 0;
    let adminRequests = 0;
    let adminPass = 0;
    let paymentRequests = 0;
    let paymentPass = 0;
    let downloadRequests = 0;
    let downloadPass = 0;

    for (const r of requestBuffer) {
        totalDuration += (r.duration_ms || 0);

        if (r.result === "PASS") {
            passCount++;
        } else {
            failCount++;
            if (r.status_code >= 400 && r.status_code < 500) count4xx++;
            if (r.status_code >= 500) count5xx++;
        }

        if (r.source === "FRONTEND" || r.error_category === "FRONTEND") frontendErrors++;
        if (r.error_category === "DATABASE") databaseErrors++;
        if (r.error_category && (r.error_category.includes("PAYMENT") || r.error_category.includes("UROPAY"))) paymentErrors++;

        // Breakdown categories
        if (r.source === "USER") {
            userRequests++;
            if (r.result === "PASS") userPass++;
        }
        if (r.source === "ADMIN") {
            adminRequests++;
            if (r.result === "PASS") adminPass++;
        }
        if (r.endpoint && (r.endpoint.includes("/payment") || r.endpoint.includes("/webhook"))) {
            paymentRequests++;
            if (r.result === "PASS") paymentPass++;
        }
        if (r.endpoint && (r.endpoint.includes("/download") || r.endpoint.includes("/secure-download"))) {
            downloadRequests++;
            if (r.result === "PASS") downloadPass++;
        }
    }

    const avgDuration = totalRequests > 0 ? Math.round(totalDuration / totalRequests) : 0;

    // Sub-Scores (0 to 100%)
    const userHealth = userRequests > 0 ? Math.round((userPass / userRequests) * 100) : 100;
    const adminHealth = adminRequests > 0 ? Math.round((adminPass / adminRequests) * 100) : 100;
    const paymentHealth = paymentRequests > 0 ? Math.round((paymentPass / paymentRequests) * 100) : 100;
    const downloadHealth = downloadRequests > 0 ? Math.round((downloadPass / downloadRequests) * 100) : 100;
    const databaseHealth = Math.max(0, 100 - (databaseErrors * 10));
    const frontendHealth = Math.max(0, 100 - (frontendErrors * 5));

    // Weighted Overall Formula
    // 25% User + 20% Admin + 20% Payment + 15% Download + 10% DB + 10% Frontend
    const overallScore = Math.round(
        (userHealth * 0.25) +
        (adminHealth * 0.20) +
        (paymentHealth * 0.20) +
        (downloadHealth * 0.15) +
        (databaseHealth * 0.10) +
        (frontendHealth * 0.10)
    );

    const incidents = getActiveIncidents();

    return {
        totalRequests,
        pass: passCount,
        fail: failCount,
        count4xx,
        count5xx,
        frontendErrors,
        databaseErrors,
        paymentErrors,
        avgDurationMs: avgDuration,
        activeSseClients: sseClients.size,
        health: {
            overall: overallScore,
            userApi: userHealth,
            adminApi: adminHealth,
            payment: paymentHealth,
            download: downloadHealth,
            database: databaseHealth,
            frontend: frontendHealth,
            formula: "Overall = 25% User + 20% Admin + 20% Payment + 15% Download + 10% Database + 10% Frontend"
        },
        activeIncidentsCount: incidents.length
    };
}

/* ==========================================================
   ACTIVE INCIDENTS AGGREGATOR
   Identifies actively occurring problem clusters from the last
   30 minutes.
========================================================== */
export function getActiveIncidents() {
    const cutoff = Date.now() - (30 * 60 * 1000); // 30 minutes
    const recentFails = requestBuffer.filter(r => 
        r.result === "FAIL" && new Date(r.timestamp).getTime() > cutoff
    );

    const clusters = new Map();
    for (const r of recentFails) {
        const key = `${r.endpoint || "general"}::${r.error_category || "UNKNOWN"}::${r.status_code || 500}`;
        if (!clusters.has(key)) {
            clusters.set(key, {
                endpoint: r.endpoint,
                category: r.error_category || "UNKNOWN",
                statusCode: r.status_code,
                source: r.source,
                rootCause: r.safe_root_cause || "Needs investigation",
                firstSeen: r.timestamp,
                lastSeen: r.timestamp,
                count: 0,
                sampleRequestId: r.request_id,
                sampleMessage: r.safe_error_message
            });
        }
        const item = clusters.get(key);
        item.count++;
        item.lastSeen = r.timestamp;
    }

    const incidents = Array.from(clusters.values()).map(item => {
        // Classify Severity
        let severity = "LOW";
        if (item.statusCode >= 500 && (item.category.includes("PAYMENT") || item.category.includes("UROPAY") || item.category === "DATABASE")) {
            severity = "CRITICAL";
        } else if (item.count >= 5 || (item.source === "ADMIN" && item.statusCode >= 500)) {
            severity = "HIGH";
        } else if (item.count >= 2 || item.statusCode >= 500) {
            severity = "MEDIUM";
        }
        return {
            ...item,
            severity
        };
    });

    // Sort by severity (CRITICAL > HIGH > MEDIUM > LOW) then count
    const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    incidents.sort((a, b) => {
        const diff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
        return diff !== 0 ? diff : b.count - a.count;
    });

    return incidents;
}

/* ==========================================================
   ENDPOINT HEALTH AGGREGATOR
========================================================== */
export function getEndpointHealth() {
    const stats = new Map();

    for (const r of requestBuffer) {
        const ep = r.endpoint || "/";
        if (!stats.has(ep)) {
            stats.set(ep, {
                endpoint: ep,
                source: r.source,
                requests: 0,
                pass: 0,
                fail: 0,
                count4xx: 0,
                count5xx: 0,
                latencies: []
            });
        }
        const item = stats.get(ep);
        item.requests++;
        if (r.result === "PASS") {
            item.pass++;
        } else {
            item.fail++;
            if (r.status_code >= 400 && r.status_code < 500) item.count4xx++;
            if (r.status_code >= 500) item.count5xx++;
        }
        if (r.duration_ms) item.latencies.push(r.duration_ms);
    }

    const results = Array.from(stats.values()).map(item => {
        const errorRate = item.requests > 0 ? ((item.fail / item.requests) * 100).toFixed(1) : "0.0";
        const avgDuration = item.latencies.length > 0 
            ? Math.round(item.latencies.reduce((a, b) => a + b, 0) / item.latencies.length) 
            : 0;

        // P95 calculation
        item.latencies.sort((a, b) => a - b);
        const p95Idx = Math.floor(item.latencies.length * 0.95);
        const p95 = item.latencies[p95Idx] || avgDuration;

        return {
            endpoint: item.endpoint,
            source: item.source,
            requests: item.requests,
            pass: item.pass,
            fail: item.fail,
            count4xx: item.count4xx,
            count5xx: item.count5xx,
            errorRate: parseFloat(errorRate),
            avgDurationMs: avgDuration,
            p95DurationMs: p95
        };
    });

    // Sort by failure count descending, then total requests
    results.sort((a, b) => b.fail - a.fail || b.requests - a.requests);
    return results;
}

/* ==========================================================
   PAGE HEALTH AGGREGATOR
========================================================== */
export function getPageHealth() {
    const pages = new Map();

    for (const r of requestBuffer) {
        const pageName = r.page || "Landing";
        if (!pages.has(pageName)) {
            pages.set(pageName, {
                page: pageName,
                totalRequests: 0,
                apiFailures: 0,
                frontendErrors: 0
            });
        }
        const item = pages.get(pageName);
        item.totalRequests++;
        if (r.result === "FAIL") item.apiFailures++;
        if (r.source === "FRONTEND" || r.error_category === "FRONTEND") item.frontendErrors++;
    }

    const results = Array.from(pages.values()).map(item => {
        let status = "HEALTHY";
        if (item.apiFailures >= 5 || item.frontendErrors >= 3) {
            status = "CRITICAL";
        } else if (item.apiFailures > 0 || item.frontendErrors > 0) {
            status = "DEGRADED";
        }
        return {
            ...item,
            status
        };
    });

    results.sort((a, b) => (b.apiFailures + b.frontendErrors) - (a.apiFailures + a.frontendErrors));
    return results;
}

/* ==========================================================
   REPORT DATA GENERATOR
   Generates comprehensive, filtered telemetry datasets for
   USER, ADMIN, and ALL reports with multi-level aggregations.
========================================================== */
export function getReportData(options = {}) {
    const reportType = (options.reportType || "ALL").toUpperCase();
    const now = new Date();
    let startMs = 0;
    let endMs = Infinity;

    // 1. Date Range Filtering
    const dateRange = options.dateRange || "7d";
    let rangeLabel = "Last 7 Days";

    if (dateRange === "today") {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        startMs = d.getTime();
        rangeLabel = "Today (" + d.toISOString().slice(0, 10) + ")";
    } else if (dateRange === "yesterday") {
        const dStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const dEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        startMs = dStart.getTime();
        endMs = dEnd.getTime();
        rangeLabel = "Yesterday (" + dStart.toISOString().slice(0, 10) + ")";
    } else if (dateRange === "7d") {
        startMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
        rangeLabel = "Last 7 Days";
    } else if (dateRange === "30d") {
        startMs = now.getTime() - 30 * 24 * 60 * 60 * 1000;
        rangeLabel = "Last 30 Days";
    } else if (dateRange === "custom" || options.startDate || options.endDate) {
        if (options.startDate) {
            const s = new Date(options.startDate);
            startMs = isNaN(s.getTime()) ? 0 : s.getTime();
        }
        if (options.endDate) {
            const e = new Date(options.endDate);
            if (!isNaN(e.getTime())) {
                if (String(options.endDate).length <= 10) {
                    e.setHours(23, 59, 59, 999);
                }
                endMs = e.getTime();
            }
        }
        const sLabel = options.startDate ? options.startDate.slice(0, 10) : "Beginning";
        const eLabel = options.endDate ? options.endDate.slice(0, 10) : "Now";
        rangeLabel = `${sLabel} to ${eLabel}`;
    }

    // 2. Filter records
    let list = requestBuffer.filter(r => {
        const rTime = new Date(r.timestamp).getTime();
        if (rTime < startMs || rTime > endMs) return false;

        // Report Type (USER vs ADMIN vs ALL)
        if (reportType === "USER") {
            if (r.source !== "USER" && r.source !== "PUBLIC") return false;
        } else if (reportType === "ADMIN") {
            if (r.source !== "ADMIN") return false;
        }

        // Additional optional source filter
        if (options.source && options.source !== "ALL" && r.source !== options.source) {
            return false;
        }

        // Result filter
        if (options.result && options.result !== "ALL" && r.result !== options.result) {
            return false;
        }

        // Method filter
        if (options.method && options.method !== "ALL" && r.method !== options.method.toUpperCase()) {
            return false;
        }

        // Status code family (2xx, 3xx, 4xx, 5xx)
        if (options.statusCode && options.statusCode !== "ALL") {
            const family = parseInt(options.statusCode[0], 10);
            if (!isNaN(family) && Math.floor(r.status_code / 100) !== family) {
                return false;
            }
        }

        // Category filter
        if (options.category && options.category !== "ALL" && r.error_category !== options.category) {
            return false;
        }

        // Page filter
        if (options.page && !String(r.page || "").toLowerCase().includes(options.page.toLowerCase())) {
            return false;
        }

        // Endpoint filter
        if (options.endpoint && !String(r.endpoint || "").toLowerCase().includes(options.endpoint.toLowerCase())) {
            return false;
        }

        // Request ID filter
        if (options.requestId && !String(r.request_id || "").toLowerCase().includes(options.requestId.toLowerCase())) {
            return false;
        }

        // Search query
        if (options.search) {
            const q = String(options.search).toLowerCase().trim();
            const match = (
                (r.endpoint && r.endpoint.toLowerCase().includes(q)) ||
                (r.request_id && r.request_id.toLowerCase().includes(q)) ||
                (r.page && r.page.toLowerCase().includes(q)) ||
                (r.safe_error_message && r.safe_error_message.toLowerCase().includes(q)) ||
                (r.safe_root_cause && r.safe_root_cause.toLowerCase().includes(q)) ||
                (r.error_category && r.error_category.toLowerCase().includes(q)) ||
                (r.status_code && String(r.status_code).includes(q))
            );
            if (!match) return false;
        }

        return true;
    });

    // Sort newest first
    list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // 3. Compute Summary Statistics
    const totalRequests = list.length;
    let pass = 0;
    let fail = 0;
    let count4xx = 0;
    let count5xx = 0;
    let totalDuration = 0;
    let userRequests = 0;
    let adminRequests = 0;

    let userPass = 0;
    let userTotal = 0;
    let adminPass = 0;
    let adminTotal = 0;
    let paymentPass = 0;
    let paymentTotal = 0;
    let downloadPass = 0;
    let downloadTotal = 0;
    let databasePass = 0;
    let databaseTotal = 0;

    for (const r of list) {
        if (r.result === "PASS") pass++;
        else fail++;

        if (r.status_code >= 400 && r.status_code < 500) count4xx++;
        if (r.status_code >= 500) count5xx++;
        totalDuration += (r.duration_ms || 0);

        if (r.source === "USER" || r.source === "PUBLIC") {
            userRequests++;
            userTotal++;
            if (r.result === "PASS") userPass++;
        } else if (r.source === "ADMIN") {
            adminRequests++;
            adminTotal++;
            if (r.result === "PASS") adminPass++;
        }

        if (r.endpoint && (r.endpoint.includes("/payment") || r.endpoint.includes("/webhook"))) {
            paymentTotal++;
            if (r.result === "PASS") paymentPass++;
        }
        if (r.endpoint && (r.endpoint.includes("/download") || r.endpoint.includes("/secure-download"))) {
            downloadTotal++;
            if (r.result === "PASS") downloadPass++;
        }
        if (r.error_category === "DATABASE") {
            databaseTotal++;
        }
    }

    const errorRate = totalRequests > 0 ? parseFloat(((fail / totalRequests) * 100).toFixed(1)) : 0.0;
    const avgDurationMs = totalRequests > 0 ? Math.round(totalDuration / totalRequests) : 0;

    const userApiHealth = userTotal > 0 ? Math.round((userPass / userTotal) * 100) : 100;
    const adminApiHealth = adminTotal > 0 ? Math.round((adminPass / adminTotal) * 100) : 100;
    const paymentHealth = paymentTotal > 0 ? Math.round((paymentPass / paymentTotal) * 100) : 100;
    const downloadHealth = downloadTotal > 0 ? Math.round((downloadPass / downloadTotal) * 100) : 100;
    const databaseHealth = databaseTotal > 0 ? Math.max(0, 100 - (databaseTotal * 10)) : 100;

    const overallHealth = Math.round(
        (userApiHealth * 0.25) +
        (adminApiHealth * 0.20) +
        (paymentHealth * 0.20) +
        (downloadHealth * 0.15) +
        (databaseHealth * 0.10) +
        (100 * 0.10)
    );

    // 4. Detailed Request Log
    const requests = list.map(r => ({
        timestamp: r.timestamp,
        timeFormatted: r.time_formatted || new Date(r.timestamp).toLocaleTimeString(),
        source: r.source || "PUBLIC",
        page: r.page || "Landing",
        method: r.method || "GET",
        endpoint: r.endpoint || "/",
        statusCode: r.status_code || 200,
        result: r.result || "PASS",
        durationMs: r.duration_ms || 0,
        errorCategory: r.error_category || (r.result === "FAIL" ? "ERROR" : ""),
        errorCode: r.error_code || (r.result === "FAIL" ? "HTTP_" + r.status_code : "OK"),
        safeErrorMessage: r.safe_error_message || "",
        safeRootCause: r.safe_root_cause || "",
        requestId: r.request_id || r.id || ""
    }));

    // 5. Endpoint Health Aggregation
    const epMap = new Map();
    for (const r of list) {
        const ep = r.endpoint || "/";
        if (!epMap.has(ep)) {
            epMap.set(ep, {
                endpoint: ep,
                source: r.source,
                requests: 0,
                passed: 0,
                failed: 0,
                count4xx: 0,
                count5xx: 0,
                latencies: []
            });
        }
        const item = epMap.get(ep);
        item.requests++;
        if (r.result === "PASS") item.passed++;
        else {
            item.failed++;
            if (r.status_code >= 400 && r.status_code < 500) item.count4xx++;
            if (r.status_code >= 500) item.count5xx++;
        }
        if (r.duration_ms) item.latencies.push(r.duration_ms);
    }

    const endpointHealth = Array.from(epMap.values()).map(item => {
        const epErrorRate = item.requests > 0 ? parseFloat(((item.failed / item.requests) * 100).toFixed(1)) : 0.0;
        const avg = item.latencies.length > 0 ? Math.round(item.latencies.reduce((a, b) => a + b, 0) / item.latencies.length) : 0;
        item.latencies.sort((a, b) => a - b);
        const p95 = item.latencies[Math.floor(item.latencies.length * 0.95)] || avg;

        return {
            endpoint: item.endpoint,
            source: item.source,
            requests: item.requests,
            passed: item.passed,
            failed: item.failed,
            count4xx: item.count4xx,
            count5xx: item.count5xx,
            errorRate: epErrorRate,
            avgResponse: avg,
            p95Response: p95
        };
    });
    endpointHealth.sort((a, b) => b.failed - a.failed || b.requests - a.requests);

    // 6. Error Summary Aggregation
    const catMap = new Map();
    let totalErrors = 0;
    for (const r of list) {
        if (r.result === "FAIL") {
            totalErrors++;
            const cat = r.error_category || "UNKNOWN";
            if (!catMap.has(cat)) {
                catMap.set(cat, {
                    category: cat,
                    count: 0,
                    endpoints: new Set(),
                    latest: r.timestamp
                });
            }
            const cItem = catMap.get(cat);
            cItem.count++;
            if (r.endpoint) cItem.endpoints.add(r.endpoint);
            if (new Date(r.timestamp) > new Date(cItem.latest)) {
                cItem.latest = r.timestamp;
            }
        }
    }

    const errorSummary = Array.from(catMap.values()).map(c => ({
        category: c.category,
        count: c.count,
        percentage: totalErrors > 0 ? parseFloat(((c.count / totalErrors) * 100).toFixed(1)) : 0.0,
        affectedEndpoints: Array.from(c.endpoints).slice(0, 5).join(", "),
        latestOccurrence: c.latest
    }));
    errorSummary.sort((a, b) => b.count - a.count);

    // 7. Page Health Aggregation
    const pgMap = new Map();
    for (const r of list) {
        const pg = r.page || "Landing";
        if (!pgMap.has(pg)) {
            pgMap.set(pg, {
                page: pg,
                source: r.source,
                requests: 0,
                passed: 0,
                failed: 0,
                latencies: []
            });
        }
        const pItem = pgMap.get(pg);
        pItem.requests++;
        if (r.result === "PASS") pItem.passed++;
        else pItem.failed++;
        if (r.duration_ms) pItem.latencies.push(r.duration_ms);
    }

    const pageHealth = Array.from(pgMap.values()).map(p => {
        const pgErrorRate = p.requests > 0 ? parseFloat(((p.failed / p.requests) * 100).toFixed(1)) : 0.0;
        const avg = p.latencies.length > 0 ? Math.round(p.latencies.reduce((a, b) => a + b, 0) / p.latencies.length) : 0;
        return {
            page: p.page,
            source: p.source,
            requests: p.requests,
            passed: p.passed,
            failed: p.failed,
            errorRate: pgErrorRate,
            avgResponse: avg
        };
    });
    pageHealth.sort((a, b) => b.failed - a.failed || b.requests - a.requests);

    // 8. Incidents Table
    const incidents = [];
    for (const r of list) {
        if (r.result === "FAIL") {
            let severity = "LOW";
            if (r.status_code >= 500 || r.error_category?.includes("UROPAY") || r.error_category === "DATABASE") {
                severity = "CRITICAL";
            } else if (r.error_category === "AUTHENTICATION" || r.error_category === "ENTITLEMENT") {
                severity = "HIGH";
            } else if (r.status_code >= 400) {
                severity = "MEDIUM";
            }

            incidents.push({
                timestamp: r.timestamp,
                source: r.source || "PUBLIC",
                page: r.page || "Landing",
                endpoint: r.endpoint || "/",
                statusCode: r.status_code || 500,
                category: r.error_category || "ERROR",
                safeError: r.safe_error_message || "Operation failed",
                rootCause: r.safe_root_cause || "UNKNOWN / NEEDS INVESTIGATION",
                requestId: r.request_id || r.id || "",
                severity
            });
        }
    }
    // Sort critical first
    const sevOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    incidents.sort((a, b) => (sevOrder[b.severity] || 0) - (sevOrder[a.severity] || 0));

    return {
        success: true,
        reportType,
        dateRange: rangeLabel,
        generatedAt: new Date().toISOString(),
        environment: "PRODUCTION",
        summary: {
            totalRequests,
            pass,
            fail,
            count4xx,
            count5xx,
            errorRate,
            avgDurationMs,
            userRequests,
            adminRequests,
            overallHealth,
            userApiHealth,
            adminApiHealth,
            paymentHealth,
            downloadHealth,
            databaseHealth
        },
        requests,
        endpointHealth,
        errorSummary,
        pageHealth,
        incidents
    };
}

/* ==========================================================
   LOG MAINTENANCE & RETENTION CLEAR
   Strictly wipes ONLY diagnostic logs. NEVER affects users,
   orders, bundles, payments, or downloads.
========================================================== */
export function clearDiagnosticLogs() {
    try {
        requestBuffer = [];
        if (fs.existsSync(LOG_FILE)) {
            fs.writeFileSync(LOG_FILE, "[]", "utf8");
        }
        broadcastSseEvent("cleared", { timestamp: Date.now() });
        return { success: true, message: "Monitoring logs cleared successfully." };
    } catch (err) {
        console.warn("[Diagnostic Service] Failed to clear logs:", err.message);
        return { success: false, message: err.message };
    }
}
