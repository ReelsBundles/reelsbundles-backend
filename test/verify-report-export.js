/* ==========================================================
   PRODUCTION REPORT EXPORT VERIFICATION TEST
   Verifies data integrity, structure, calculations, and
   worksheets for USER, ADMIN, and ALL reports.
========================================================== */

import assert from "assert";
import {
    recordRequest,
    getReportData,
    clearDiagnosticLogs,
    generateRequestId
} from "../src/services/diagnostic.service.js";

async function verifyReports() {
    console.log("==========================================");
    console.log("🧪 VERIFYING PRODUCTION REPORT EXPORT");
    console.log("==========================================");

    // 1. Reset logs
    clearDiagnosticLogs();

    // 2. Inject realistic telemetry records:
    // a) User normal purchase request
    recordRequest({
        id: generateRequestId(),
        method: "GET",
        endpoint: "/api/user/bundles",
        status_code: 200,
        result: "PASS",
        duration_ms: 68,
        source: "USER",
        page: "Dashboard",
        timestamp: new Date().toISOString()
    });

    // b) User payment failure (UroPay upstream 502)
    recordRequest({
        id: generateRequestId(),
        method: "POST",
        endpoint: "/api/payment/create-order",
        status_code: 502,
        result: "FAIL",
        duration_ms: 540,
        source: "USER",
        page: "Payment",
        statusCode: 502,
        errorMessage: "UroPay upstream gateway returned 502 Bad Gateway",
        timestamp: new Date().toISOString()
    });

    // c) Admin normal orders query
    recordRequest({
        id: generateRequestId(),
        method: "GET",
        endpoint: "/api/admin/orders",
        status_code: 200,
        result: "PASS",
        duration_ms: 112,
        source: "ADMIN",
        page: "Orders",
        timestamp: new Date().toISOString()
    });

    // d) Admin database error on reviews
    recordRequest({
        id: generateRequestId(),
        method: "DELETE",
        endpoint: "/api/admin/reviews/rev_123",
        statusCode: 500,
        durationMs: 380,
        source: "ADMIN",
        page: "Reviews",
        errorMessage: "Firestore database query failed",
        timestamp: new Date().toISOString()
    });

    // 3. Test USER Report
    console.log("Testing USER report generation...");
    const userRep = getReportData({ reportType: "USER" });
    assert.strictEqual(userRep.success, true);
    assert.strictEqual(userRep.reportType, "USER");
    assert.strictEqual(userRep.summary.totalRequests, 2);
    assert.strictEqual(userRep.summary.userRequests, 2);
    assert.strictEqual(userRep.summary.adminRequests, 0);
    assert.strictEqual(userRep.summary.pass, 1);
    assert.strictEqual(userRep.summary.fail, 1);
    assert.strictEqual(userRep.summary.count5xx, 1);
    assert.strictEqual(userRep.summary.errorRate, 50.0);
    assert.ok(userRep.requests.every(r => r.source === "USER" || r.source === "PUBLIC"));
    assert.strictEqual(userRep.errorSummary.length, 1);
    assert.strictEqual(userRep.errorSummary[0].category, "UROPAY_UPSTREAM");
    assert.strictEqual(userRep.incidents.length, 1);
    assert.strictEqual(userRep.incidents[0].severity, "CRITICAL");
    console.log("  ✅ USER report verified (2 records, 1 pass, 1 fail, 1 incident)");

    // 4. Test ADMIN Report
    console.log("Testing ADMIN report generation...");
    const adminRep = getReportData({ reportType: "ADMIN" });
    assert.strictEqual(adminRep.success, true);
    assert.strictEqual(adminRep.reportType, "ADMIN");
    assert.strictEqual(adminRep.summary.totalRequests, 2);
    assert.strictEqual(adminRep.summary.adminRequests, 2);
    assert.strictEqual(adminRep.summary.userRequests, 0);
    assert.strictEqual(adminRep.summary.pass, 1);
    assert.strictEqual(adminRep.summary.fail, 1);
    assert.strictEqual(adminRep.summary.count5xx, 1);
    assert.ok(adminRep.requests.every(r => r.source === "ADMIN"));
    assert.strictEqual(adminRep.errorSummary.length, 1);
    assert.strictEqual(adminRep.errorSummary[0].category, "DATABASE");
    assert.strictEqual(adminRep.incidents.length, 1);
    assert.strictEqual(adminRep.incidents[0].severity, "CRITICAL");
    console.log("  ✅ ADMIN report verified (2 records, 1 pass, 1 fail, 1 incident)");

    // 5. Test ALL Report
    console.log("Testing ALL report generation...");
    const allRep = getReportData({ reportType: "ALL" });
    assert.strictEqual(allRep.success, true);
    assert.strictEqual(allRep.reportType, "ALL");
    assert.strictEqual(allRep.summary.totalRequests, 4);
    assert.strictEqual(allRep.summary.userRequests, 2);
    assert.strictEqual(allRep.summary.adminRequests, 2);
    assert.strictEqual(allRep.summary.pass, 2);
    assert.strictEqual(allRep.summary.fail, 2);
    assert.strictEqual(allRep.summary.count5xx, 2);
    assert.strictEqual(allRep.endpointHealth.length, 4);
    assert.strictEqual(allRep.errorSummary.length, 2);
    assert.strictEqual(allRep.pageHealth.length, 4);
    assert.strictEqual(allRep.incidents.length, 2);
    console.log("  ✅ ALL report verified (4 records, 2 pass, 2 fail, 2 incidents, all 6 worksheets ready)");

    // 6. Test Multi-criteria filtering
    console.log("Testing filters (FAIL only)...");
    const failRep = getReportData({ result: "FAIL" });
    assert.strictEqual(failRep.summary.totalRequests, 2);
    assert.strictEqual(failRep.summary.pass, 0);
    assert.strictEqual(failRep.summary.fail, 2);
    console.log("  ✅ FAIL filter verified");

    console.log("Testing filters (UROPAY category)...");
    const uroRep = getReportData({ category: "UROPAY_UPSTREAM" });
    assert.strictEqual(uroRep.summary.totalRequests, 1);
    assert.strictEqual(uroRep.requests[0].endpoint, "/api/payment/create-order");
    console.log("  ✅ Category filter verified");

    // 7. Test Empty dataset handling
    console.log("Testing empty dataset handling...");
    const emptyRep = getReportData({ dateRange: "custom", startDate: "2020-01-01", endDate: "2020-01-02" });
    assert.strictEqual(emptyRep.success, true);
    assert.strictEqual(emptyRep.summary.totalRequests, 0);
    assert.strictEqual(emptyRep.summary.pass, 0);
    assert.strictEqual(emptyRep.summary.fail, 0);
    assert.strictEqual(emptyRep.requests.length, 0);
    assert.strictEqual(emptyRep.endpointHealth.length, 0);
    assert.strictEqual(emptyRep.errorSummary.length, 0);
    assert.strictEqual(emptyRep.incidents.length, 0);
    console.log("  ✅ Empty query handled safely (zero fake rows)");

    // 8. Cleanup
    clearDiagnosticLogs();

    console.log("==========================================");
    console.log("🎉 ALL PRODUCTION REPORT EXPORT CHECKS PASSED!");
    console.log("==========================================");
}

verifyReports().catch(err => {
    console.error("Verification failed:", err);
    process.exit(1);
});
