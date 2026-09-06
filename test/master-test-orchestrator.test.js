import assert from "assert";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import {
    runMasterTestSuite,
    getTestStatus,
    getTestRunsHistory
} from "../src/services/test-orchestrator.service.js";

const JWT_SECRET = process.env.JWT_SECRET || "reelsbundles_jwt_secret_dev_2026";
const validAdminToken = jwt.sign(
    { email: "admin@reelsbundles.com", role: "admin", sub: "admin_master_orchestrator_id" },
    JWT_SECRET,
    { expiresIn: "2h" }
);

async function runMasterOrchestratorTestSuite() {
    console.log("==========================================================");
    console.log("🧪 STARTING MASTER TEST ORCHESTRATOR VERIFICATION");
    console.log("==========================================================");

    let passCount = 0;
    let failCount = 0;

    async function asyncTest(desc, fn) {
        try {
            await fn();
            console.log(`  ✅ PASS: ${desc}`);
            passCount++;
        } catch (err) {
            console.error(`  ❌ FAIL: ${desc}`);
            console.error(`     Error: ${err.message}`);
            failCount++;
        }
    }

    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        // --- TEST 1: Initial Status Check ---
        await asyncTest("1.1 Initial status reports isRunning = false", () => {
            const status = getTestStatus();
            assert.strictEqual(status.isRunning, false, "Orchestrator should not be running initially");
        });

        // --- TEST 2: Run Master Test Suite (Phases A through J) ---
        let report = null;
        await asyncTest("2.1 Execute runMasterTestSuite() across Phases A through J", async () => {
            report = await runMasterTestSuite({ baseUrl, adminToken: validAdminToken });
            assert.ok(report, "Master report should not be null");
            assert.ok(report.runId, "runId missing");
            assert.ok(report.summary, "summary missing");
            assert.ok(report.suites && report.suites.length === 10, `Expected 10 phases (A-J), got ${report.suites.length}`);
            assert.ok(report.summary.totalTests > 50, `Expected > 50 total tests, got ${report.summary.totalTests}`);
            assert.strictEqual(report.summary.failedTests, 0, `Expected 0 failed tests, got ${report.summary.failedTests}`);
            assert.ok(report.summary.notVerifiedTests >= 1, "Expected at least 1 safe NOT VERIFIED test (live payment charge)");
            assert.strictEqual(report.overallStatus, "PASS WITH NOT VERIFIED");
        });

        // --- TEST 3: Verification of Phase Contents ---
        await asyncTest("3.1 Phase A contains all 22 core API endpoints", () => {
            const phaseA = report.suites.find(s => s.phaseKey === "PHASE_A");
            assert.ok(phaseA, "Phase A missing");
            assert.strictEqual(phaseA.total, 22, `Expected 22 core endpoints in Phase A, got ${phaseA.total}`);
            assert.strictEqual(phaseA.status, "PASS");
        });

        await asyncTest("3.2 Phase C contains all 14 Admin pages", () => {
            const phaseC = report.suites.find(s => s.phaseKey === "PHASE_C");
            assert.ok(phaseC, "Phase C missing");
            assert.strictEqual(phaseC.total, 14, `Expected 14 admin pages, got ${phaseC.total}`);
            assert.strictEqual(phaseC.status, "PASS");
        });

        await asyncTest("3.3 Phase D contains all 18 User pages", () => {
            const phaseD = report.suites.find(s => s.phaseKey === "PHASE_D");
            assert.ok(phaseD, "Phase D missing");
            assert.strictEqual(phaseD.total, 18, `Expected 18 user pages, got ${phaseD.total}`);
            assert.strictEqual(phaseD.status, "PASS");
        });

        await asyncTest("3.4 Phase F verifies safe UroPay without real customer charge", () => {
            const phaseF = report.suites.find(s => s.phaseKey === "PHASE_F");
            assert.ok(phaseF, "Phase F missing");
            const notVerified = phaseF.results.find(r => r.status === "NOT VERIFIED");
            assert.ok(notVerified, "Safe NOT VERIFIED result missing from Phase F");
            assert.ok(notVerified.detail.includes("Live customer billing safely skipped"));
        });

        await asyncTest("3.5 Phase I verifies existing 9 Diagnostic Test Events", () => {
            const phaseI = report.suites.find(s => s.phaseKey === "PHASE_I");
            assert.ok(phaseI, "Phase I missing");
            assert.strictEqual(phaseI.total, 9, `Expected 9 diagnostic events, got ${phaseI.total}`);
            assert.strictEqual(phaseI.status, "PASS");
            const types = phaseI.results.map(r => r.type);
            assert.ok(types.includes("uropay"));
            assert.ok(types.includes("uropay_verify"));
            assert.ok(types.includes("uropay_webhook"));
            assert.ok(types.includes("database"));
            assert.ok(types.includes("drive"));
            assert.ok(types.includes("entitlement"));
            assert.ok(types.includes("auth"));
            assert.ok(types.includes("frontend"));
            assert.ok(types.includes("pass"));
        });

        // --- TEST 4: Safe History & No Secrets Leaked ---
        await asyncTest("4.1 Test run record is saved to history without secret leakage", () => {
            const history = getTestRunsHistory();
            assert.ok(history.length > 0, "History should contain at least 1 run");
            const latest = history[0];
            assert.strictEqual(latest.runId, report.runId);
            const serialized = JSON.stringify(latest);
            assert.ok(!serialized.includes(JWT_SECRET), "JWT_SECRET found in test history!");
            assert.ok(!serialized.includes("APP_SECRET"), "APP_SECRET found in test history!");
            assert.ok(!serialized.includes("service_account"), "Service account found in test history!");
        });

        // --- TEST 5: API Endpoints ---
        await asyncTest("5.1 GET /api/admin/test/status returns runner status", async () => {
            const res = await fetch(`${baseUrl}/api/admin/test/status`, {
                headers: { Authorization: `Bearer ${validAdminToken}` }
            });
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.isRunning, false);
            assert.ok(data.lastRun);
        });

        await asyncTest("5.2 GET /api/admin/test/history returns recent run records", async () => {
            const res = await fetch(`${baseUrl}/api/admin/test/history`, {
                headers: { Authorization: `Bearer ${validAdminToken}` }
            });
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(Array.isArray(data.history));
            assert.ok(data.history.length > 0);
        });

    } finally {
        await new Promise((resolve) => server.close(resolve));
    }

    console.log("==========================================================");
    console.log(`📊 MASTER TEST ORCHESTRATOR SUITE: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("==========================================================");

    if (failCount > 0) {
        throw new Error(`${failCount} master test orchestrator test(s) failed`);
    }
}

runMasterOrchestratorTestSuite().catch((err) => {
    console.error("FATAL MASTER SUITE FAILURE:", err);
    process.exit(1);
});
