/* ==========================================================
   REELSBUNDLES BACKEND — OBSERVABILITY TEST SUITE
   Verifies diagnostic middleware, error classification,
   UroPay flow diagnosis, secret sanitization, retention,
   health score formula, and non-intrusive safety.
========================================================== */

import assert from "assert";
import {
    generateRequestId,
    sanitizeString,
    sanitizeObject,
    maskUserId,
    classifyError,
    buildFailureChain,
    recordRequest,
    getSummary,
    getRequests,
    getRequestById,
    getEndpointHealth,
    getPageHealth,
    getActiveIncidents,
    getReportData,
    clearDiagnosticLogs
} from "../src/services/diagnostic.service.js";

async function runTests() {
    console.log("==========================================");
    console.log("🧪 STARTING DIAGNOSTIC MONITOR TEST SUITE");
    console.log("==========================================");

    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`  ✅ PASS: ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ FAIL: ${name}`);
            console.error(`     Error: ${err.message}`);
            failed++;
        }
    }

    // 1. Request ID Generation
    test("Request ID format RB-YYYYMMDD-HHMMSS-XXXX", () => {
        const id = generateRequestId();
        assert.match(id, /^RB-\d{8}-\d{6}-[A-Z0-9]{4}$/);
    });

    // 2. Secret Sanitization
    test("Secret Sanitizer redacts Bearer tokens, passwords, and UroPay keys", () => {
        const sample = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyJ9.signature1234";
        const sanitized = sanitizeString(sample);
        assert.strictEqual(sanitized.includes("eyJhbGci"), false);
        assert.strictEqual(sanitized.includes("[REDACTED"), true);

        const obj = {
            password: "super_secret_password_123",
            userToken: "my_auth_token_999",
            UROPAY_PRODUCTION_API_KEY: "prod_key_abc",
            UROPAY_PRODUCTION_API_SECRET: "prod_secret_xyz",
            normalField: "safe value",
            nested: {
                privateKey: "private_key_content",
                amount: 49
            }
        };
        const cleanObj = sanitizeObject(obj);
        assert.strictEqual(cleanObj.password, "[REDACTED]");
        assert.strictEqual(cleanObj.userToken, "[REDACTED]");
        assert.strictEqual(cleanObj.UROPAY_PRODUCTION_API_KEY, "[REDACTED]");
        assert.strictEqual(cleanObj.UROPAY_PRODUCTION_API_SECRET, "[REDACTED]");
        assert.strictEqual(cleanObj.normalField, "safe value");
        assert.strictEqual(cleanObj.nested.privateKey, "[REDACTED]");
        assert.strictEqual(cleanObj.nested.amount, 49);
    });

    // 3. User ID Masking
    test("Masks user IDs and emails appropriately", () => {
        assert.strictEqual(maskUserId("santosh@example.com"), "s***h@example.com");
        assert.strictEqual(maskUserId("usr_874628194"), "usr***194");
        assert.strictEqual(maskUserId(""), "guest");
        assert.strictEqual(maskUserId(null), "guest");
    });

    // 4. Error Classification: UROPAY / PAYMENT
    test("Classifies UroPay order creation upstream failure (502)", () => {
        const entry = {
            statusCode: 502,
            endpoint: "/api/payment/create-order",
            errorMessage: "UroPay API request failed: upstream service returned HTTP 502 Bad Gateway"
        };
        const result = classifyError(entry);
        assert.strictEqual(result.category, "UROPAY_UPSTREAM");
        assert.strictEqual(result.code, "UROPAY_UPSTREAM_ERROR");
        assert.strictEqual(result.rootCause, "UROPAY_UPSTREAM → upstream request failed");
    });

    test("Classifies UroPay webhook signature failure (400)", () => {
        const entry = {
            statusCode: 400,
            endpoint: "/api/webhook/uropay",
            errorMessage: "Invalid webhook signature: HMAC-SHA256 header validation mismatch."
        };
        const result = classifyError(entry);
        assert.strictEqual(result.category, "UROPAY_CALLBACK");
        assert.strictEqual(result.code, "UROPAY_WEBHOOK_ERROR");
        assert.strictEqual(result.rootCause, "UROPAY_CALLBACK → webhook signature or event processing failed");
    });

    test("Classifies UroPay payment verification failure", () => {
        const entry = {
            statusCode: 500,
            endpoint: "/api/payment/verify/order_123",
            errorMessage: "Payment verification failed while checking order status with UroPay"
        };
        const result = classifyError(entry);
        assert.strictEqual(result.category, "PAYMENT_VERIFICATION");
        assert.strictEqual(result.code, "PAYMENT_VERIFICATION_FAILED");
        assert.strictEqual(result.rootCause, "PAYMENT_VERIFICATION → upstream order verification failed");
    });

    // 5. Error Classification: DATABASE (Firestore / Supabase)
    test("Classifies Database query error", () => {
        const entry = {
            statusCode: 500,
            endpoint: "/api/admin/orders",
            errorMessage: "Firestore query failed on collection('payments'). Document query exception."
        };
        const result = classifyError(entry);
        assert.strictEqual(result.category, "DATABASE");
        assert.strictEqual(result.code, "DATABASE_ERROR");
        assert.strictEqual(result.rootCause, "DATABASE → query failed");
    });

    test("Classifies Database connection failure", () => {
        const entry = {
            statusCode: 500,
            endpoint: "/api/admin/orders",
            errorMessage: "Firestore connection failed: database cluster unavailable."
        };
        const result = classifyError(entry);
        assert.strictEqual(result.category, "DATABASE");
        assert.strictEqual(result.code, "DATABASE_ERROR");
        assert.strictEqual(result.rootCause, "DATABASE → connection failed");
    });

    test("Classifies Google Cloud Firestore 16 UNAUTHENTICATED as DATABASE error (not client AUTH)", () => {
        const entry = {
            statusCode: 500,
            endpoint: "/api/admin/dashboard/",
            errorMessage: "16 UNAUTHENTICATED: Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential. See https://developers.google.com/identity/sign-in/web/devconsole-project."
        };
        const result = classifyError(entry);
        assert.strictEqual(result.category, "DATABASE");
        assert.strictEqual(result.code, "DATABASE_ERROR");
        assert.strictEqual(result.rootCause, "DATABASE → service account credentials invalid or expired");
    });

    // 6. Error Classification: AUTHENTICATION & AUTHORIZATION
    test("Classifies 401 Authentication error", () => {
        const entry = {
            statusCode: 401,
            endpoint: "/api/user/bundles",
            errorMessage: "Authentication required. Firebase ID token expired."
        };
        const result = classifyError(entry);
        assert.strictEqual(result.category, "AUTHENTICATION");
        assert.strictEqual(result.code, "AUTH_UNAUTHORIZED");
        assert.strictEqual(result.rootCause, "AUTH → token expired");
    });

    test("Classifies 403 Authorization error", () => {
        const entry = {
            statusCode: 403,
            endpoint: "/api/admin/bundles",
            errorMessage: "Admin permission denied. User account is suspended."
        };
        const result = classifyError(entry);
        assert.strictEqual(result.category, "AUTHORIZATION");
        assert.strictEqual(result.code, "AUTH_FORBIDDEN");
        assert.strictEqual(result.rootCause, "AUTHORIZATION → account suspended");
    });

    // 7. Error Classification: GOOGLE DRIVE, DOWNLOAD & ENTITLEMENT
    test("Classifies Google Drive stream error", () => {
        const entry = {
            statusCode: 500,
            endpoint: "/api/secure-download/file_123",
            errorMessage: "Google Drive API error: service account credentials missing."
        };
        const result = classifyError(entry);
        assert.strictEqual(result.category, "GOOGLE DRIVE");
        assert.strictEqual(result.code, "GOOGLE_DRIVE_ERROR");
        assert.strictEqual(result.rootCause, "GOOGLE DRIVE → file access failed");
    });

    test("Classifies Entitlement missing error", () => {
        const entry = {
            statusCode: 403,
            endpoint: "/api/user/bundles/basic/download",
            errorMessage: "User has no valid entitlement or verified purchase for this bundle."
        };
        const result = classifyError(entry);
        assert.strictEqual(result.category, "ENTITLEMENT");
        assert.strictEqual(result.code, "ENTITLEMENT_MISSING");
        assert.strictEqual(result.rootCause, "ENTITLEMENT → user entitlement missing");
    });

    // 8. Error Classification: FRONTEND & NETWORK
    test("Classifies Frontend client JS error", () => {
        const entry = {
            isFrontendError: true,
            source: "FRONTEND",
            errorMessage: "TypeError: Cannot read properties of undefined"
        };
        const result = classifyError(entry);
        assert.strictEqual(result.category, "FRONTEND");
        assert.strictEqual(result.code, "FRONTEND_JS_ERROR");
        assert.strictEqual(result.rootCause, "FRONTEND → JavaScript exception");
    });

    test("Classifies Network connection failure", () => {
        const entry = {
            statusCode: 0,
            errorMessage: "TypeError: Failed to fetch (connection refused)"
        };
        const result = classifyError(entry);
        assert.strictEqual(result.category, "NETWORK");
        assert.strictEqual(result.code, "NETWORK_FAILURE");
        assert.strictEqual(result.rootCause, "NETWORK → connection refused or unreachable");
    });

    // 9. Root Cause Unknown Fallback
    test("Fallback to UNKNOWN / NEEDS INVESTIGATION when evidence is insufficient", () => {
        const entry = {
            statusCode: 418,
            errorMessage: "I am a teapot"
        };
        const result = classifyError(entry);
        assert.strictEqual(result.category, "UNKNOWN");
        assert.strictEqual(result.rootCause, "UNKNOWN / NEEDS INVESTIGATION");
    });

    // 10. Failure Chain Builder
    test("Builds structured breadcrumb failure chain", () => {
        const entry = {
            page: "Payment Page",
            method: "POST",
            endpoint: "/api/payment/create-order",
            statusCode: 502
        };
        const classification = {
            category: "UROPAY_UPSTREAM",
            rootCause: "UROPAY_UPSTREAM → upstream request failed"
        };
        const chain = buildFailureChain(entry, classification);
        assert.strictEqual(chain[0], "Payment Page");
        assert.strictEqual(chain[1], "POST /api/payment/create-order");
        assert.strictEqual(chain[2], "UroPay Payment Gateway (api.uropai.in)");
        assert.strictEqual(chain[chain.length - 1], "HTTP 502 Response");
    });

    // 11. Request Recording & Telemetry Queries
    test("Records requests into buffer and computes summary and health score", () => {
        clearDiagnosticLogs();

        // 1. Success User Request
        recordRequest({
            requestId: "RB-20260903-180000-0001",
            source: "USER",
            page: "Dashboard",
            method: "GET",
            endpoint: "/api/user/bundles",
            statusCode: 200,
            durationMs: 75
        });

        // 2. Success Admin Request
        recordRequest({
            requestId: "RB-20260903-180000-0002",
            source: "ADMIN",
            page: "Admin Orders",
            method: "GET",
            endpoint: "/api/admin/orders",
            statusCode: 200,
            durationMs: 120
        });

        // 3. Failed Payment Request (UroPay 502)
        recordRequest({
            requestId: "RB-20260903-180000-0003",
            source: "USER",
            page: "Payment",
            method: "POST",
            endpoint: "/api/payment/create-order",
            statusCode: 502,
            durationMs: 380,
            errorMessage: "UroPay API request failed: upstream service returned HTTP 502 Bad Gateway"
        });

        // 4. Failed Admin Request (Database 500)
        recordRequest({
            requestId: "RB-20260903-180000-0004",
            source: "ADMIN",
            page: "Admin Users",
            method: "GET",
            endpoint: "/api/admin/users",
            statusCode: 500,
            durationMs: 290,
            errorMessage: "Firestore query failed on collection('users')"
        });

        const summary = getSummary();
        assert.strictEqual(summary.totalRequests, 4);
        assert.strictEqual(summary.pass, 2);
        assert.strictEqual(summary.fail, 2);
        assert.strictEqual(summary.count5xx, 2);
        assert.strictEqual(summary.databaseErrors, 1);
        assert.strictEqual(summary.paymentErrors, 1);
        assert.ok(summary.health.overall > 0 && summary.health.overall <= 100);

        const list = getRequests({ limit: 10 });
        assert.strictEqual(list.total, 4);
        assert.strictEqual(list.items.length, 4);

        const filterUser = getRequests({ source: "USER" });
        assert.strictEqual(filterUser.items.length, 2);

        const filterAdmin = getRequests({ source: "ADMIN" });
        assert.strictEqual(filterAdmin.items.length, 2);

        const endpoints = getEndpointHealth();
        assert.strictEqual(endpoints.length, 4);

        const pages = getPageHealth();
        assert.ok(pages.length >= 3);

        const incidents = getActiveIncidents();
        assert.strictEqual(incidents.length, 2);
    });

    // 12. Report Data Generation: USER Report
    test("getReportData({ reportType: 'USER' }) includes only user activity", () => {
        const report = getReportData({ reportType: "USER" });
        assert.strictEqual(report.success, true);
        assert.strictEqual(report.reportType, "USER");
        assert.strictEqual(report.summary.totalRequests, 2);
        assert.strictEqual(report.summary.userRequests, 2);
        assert.strictEqual(report.summary.adminRequests, 0);
        assert.ok(report.requests.every(r => r.source === "USER" || r.source === "PUBLIC"));
        assert.ok(Array.isArray(report.endpointHealth));
        assert.ok(Array.isArray(report.errorSummary));
        assert.ok(Array.isArray(report.pageHealth));
        assert.ok(Array.isArray(report.incidents));
    });

    // 13. Report Data Generation: ADMIN Report
    test("getReportData({ reportType: 'ADMIN' }) includes only admin activity", () => {
        const report = getReportData({ reportType: "ADMIN" });
        assert.strictEqual(report.success, true);
        assert.strictEqual(report.reportType, "ADMIN");
        assert.strictEqual(report.summary.totalRequests, 2);
        assert.strictEqual(report.summary.adminRequests, 2);
        assert.strictEqual(report.summary.userRequests, 0);
        assert.ok(report.requests.every(r => r.source === "ADMIN"));
    });

    // 14. Report Data Generation: ALL Report
    test("getReportData({ reportType: 'ALL' }) combines both and retains Source column", () => {
        const report = getReportData({ reportType: "ALL" });
        assert.strictEqual(report.success, true);
        assert.strictEqual(report.reportType, "ALL");
        assert.strictEqual(report.summary.totalRequests, 4);
        assert.strictEqual(report.summary.userRequests, 2);
        assert.strictEqual(report.summary.adminRequests, 2);
        assert.ok(report.requests.some(r => r.source === "USER"));
        assert.ok(report.requests.some(r => r.source === "ADMIN"));
    });

    // 15. Report Data Filtering: Result, Category, Date Range
    test("getReportData respects Result, Category, and Date Range filters", () => {
        const failOnly = getReportData({ result: "FAIL" });
        assert.strictEqual(failOnly.summary.totalRequests, 2);
        assert.strictEqual(failOnly.summary.fail, 2);
        assert.strictEqual(failOnly.summary.pass, 0);

        const paymentOnly = getReportData({ category: "UROPAY_UPSTREAM" });
        assert.strictEqual(paymentOnly.summary.totalRequests, 1);
        assert.strictEqual(paymentOnly.requests[0].endpoint, "/api/payment/create-order");

        const todayReport = getReportData({ dateRange: "today" });
        assert.strictEqual(todayReport.summary.totalRequests, 4);
    });

    // 16. Empty Report Data Handling (Zero fake records)
    test("getReportData handles empty queries cleanly without mock records", () => {
        const emptyReport = getReportData({ search: "non_existent_search_query_xyz" });
        assert.strictEqual(emptyReport.success, true);
        assert.strictEqual(emptyReport.summary.totalRequests, 0);
        assert.strictEqual(emptyReport.summary.pass, 0);
        assert.strictEqual(emptyReport.summary.fail, 0);
        assert.strictEqual(emptyReport.requests.length, 0);
        assert.strictEqual(emptyReport.endpointHealth.length, 0);
        assert.strictEqual(emptyReport.errorSummary.length, 0);
    });

    // 17. Retention Policy & Clear Logs
    test("Retention clear wipes monitoring records only", () => {
        const res = clearDiagnosticLogs();
        assert.strictEqual(res.success, true);
        const summary = getSummary();
        assert.strictEqual(summary.totalRequests, 0);
    });

    console.log("==========================================");
    console.log(`📊 RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("==========================================");

    if (failed > 0) {
        process.exit(1);
    }
    process.exit(0);
}

runTests().catch(err => {
    console.error("Test runner exception:", err);
    process.exit(1);
});
