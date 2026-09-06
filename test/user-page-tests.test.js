import assert from "assert";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import {
    USER_PAGES_REGISTRY,
    ADMIN_PAGES_REGISTRY,
    CORE_API_ENDPOINTS,
    verifyUserPage,
    verifyAdminPage,
    runProductionDataAudit
} from "../src/services/user-page-test.service.js";

const JWT_SECRET = process.env.JWT_SECRET || "reelsbundles_jwt_secret_dev_2026";
const validAdminToken = jwt.sign(
    { email: "admin@reelsbundles.com", role: "admin", sub: "admin_test_user_page_id" },
    JWT_SECRET,
    { expiresIn: "2h" }
);

async function runUserPageTestSuite() {
    console.log("==========================================================");
    console.log("🧪 STARTING USER & ADMIN PAGE TEST SUITE VERIFICATION");
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
        // --- TEST 1: Page Registry Discovery ---
        await asyncTest("1.1 User Page Registry contains exactly 18 discovered User pages", () => {
            assert.strictEqual(USER_PAGES_REGISTRY.length, 18, `Expected 18 user pages, got ${USER_PAGES_REGISTRY.length}`);
            const ids = USER_PAGES_REGISTRY.map(p => p.id);
            assert.ok(ids.includes("landing"), "Landing page missing");
            assert.ok(ids.includes("login"), "Login page missing");
            assert.ok(ids.includes("register"), "Register page missing");
            assert.ok(ids.includes("dashboard"), "Dashboard page missing");
            assert.ok(ids.includes("checkout"), "Checkout page missing");
            assert.ok(ids.includes("payment-success"), "Payment success page missing");
            assert.ok(ids.includes("payment-failed"), "Payment failed page missing");
            assert.ok(ids.includes("downloads-drive"), "Drive downloads page missing");
            assert.ok(ids.includes("downloads-mega"), "MEGA downloads page missing");
            assert.ok(ids.includes("maintenance"), "Maintenance page missing");
            assert.ok(ids.includes("feedback"), "Feedback widget missing");
        });

        await asyncTest("1.2 Admin Page Registry contains exactly 14 discovered Admin pages", () => {
            assert.strictEqual(ADMIN_PAGES_REGISTRY.length, 14, `Expected 14 admin pages, got ${ADMIN_PAGES_REGISTRY.length}`);
            const ids = ADMIN_PAGES_REGISTRY.map(p => p.id);
            assert.ok(ids.includes("admin-dashboard"), "Admin dashboard missing");
            assert.ok(ids.includes("admin-monitor"), "Live monitor missing");
            assert.ok(ids.includes("admin-orders"), "Admin orders missing");
            assert.ok(ids.includes("admin-reviews"), "Admin reviews missing");
            assert.ok(ids.includes("admin-maintenance"), "Admin maintenance missing");
        });

        await asyncTest("1.3 Core API Registry contains all 22 active routes", () => {
            assert.strictEqual(CORE_API_ENDPOINTS.length, 22, `Expected 22 core endpoints, got ${CORE_API_ENDPOINTS.length}`);
        });

        // --- TEST 2: Programmatic User Page Verification (16-Point Matrix) ---
        await asyncTest("2.1 Verify Landing Page (index.html) passes 16-point matrix", async () => {
            const result = await verifyUserPage("landing", { baseUrl, adminToken: validAdminToken });
            assert.strictEqual(result.status, "PASS", `Expected PASS, got ${result.status}: ${JSON.stringify(result.failure)}`);
            assert.strictEqual(result.category, "USER_PAGE");
            assert.ok(result.checks.length >= 10, "Expected at least 10 verification checks");
            assert.ok(result.checks.every(c => c.passed), "One or more checks failed on landing page");
        });

        await asyncTest("2.2 Verify Login Page passes assets and form verification", async () => {
            const result = await verifyUserPage("login", { baseUrl, adminToken: validAdminToken });
            assert.strictEqual(result.status, "PASS", `Expected PASS, got ${result.status}: ${JSON.stringify(result.failure)}`);
        });

        await asyncTest("2.3 Verify User Dashboard passes auth requirements", async () => {
            const result = await verifyUserPage("dashboard", { baseUrl, adminToken: validAdminToken });
            assert.strictEqual(result.status, "PASS", `Expected PASS, got ${result.status}: ${JSON.stringify(result.failure)}`);
        });

        await asyncTest("2.4 Verify Checkout Page passes coupon and payment contract checks", async () => {
            const result = await verifyUserPage("checkout", { baseUrl, adminToken: validAdminToken });
            assert.strictEqual(result.status, "PASS", `Expected PASS, got ${result.status}: ${JSON.stringify(result.failure)}`);
        });

        await asyncTest("2.5 Verify Secure Downloads (Google Drive + MEGA) passes contract checks", async () => {
            const driveRes = await verifyUserPage("downloads-drive", { baseUrl, adminToken: validAdminToken });
            assert.strictEqual(driveRes.status, "PASS");
            const megaRes = await verifyUserPage("downloads-mega", { baseUrl, adminToken: validAdminToken });
            assert.strictEqual(megaRes.status, "PASS");
        });

        // --- TEST 3: Programmatic Admin Page Verification ---
        await asyncTest("3.1 Verify Admin Live Monitor passes assets & telemetry verification", async () => {
            const result = await verifyAdminPage("admin-monitor", { baseUrl, adminToken: validAdminToken });
            assert.strictEqual(result.status, "PASS", `Expected PASS, got ${result.status}`);
        });

        await asyncTest("3.2 Verify Admin Dashboard passes KPI contract verification", async () => {
            const result = await verifyAdminPage("admin-dashboard", { baseUrl, adminToken: validAdminToken });
            assert.strictEqual(result.status, "PASS", `Expected PASS, got ${result.status}`);
        });

        // --- TEST 4: Real-Data Rule Audit ---
        await asyncTest("4.1 Real-Data Audit reports zero dummy data across all production files", () => {
            const audit = runProductionDataAudit();
            assert.strictEqual(audit.passed, true, `Found dummy data violations: ${JSON.stringify(audit.findings)}`);
            assert.strictEqual(audit.findingsCount, 0);
        });

        // --- TEST 5: Admin Testing Routes ---
        await asyncTest("5.1 GET /api/admin/test/pages returns registries for admin", async () => {
            const res = await fetch(`${baseUrl}/api/admin/test/pages`, {
                headers: { Authorization: `Bearer ${validAdminToken}` }
            });
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.userPages.length, 18);
            assert.strictEqual(data.adminPages.length, 14);
        });

        await asyncTest("5.2 POST /api/admin/test/page/landing executes single page verification", async () => {
            const res = await fetch(`${baseUrl}/api/admin/test/page/landing`, {
                method: "POST",
                headers: { Authorization: `Bearer ${validAdminToken}` }
            });
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.result.id, "landing");
            assert.strictEqual(data.result.status, "PASS");
        });

        await asyncTest("5.3 Unauthorized access to /api/admin/test/pages is blocked (401)", async () => {
            const res = await fetch(`${baseUrl}/api/admin/test/pages`);
            assert.strictEqual(res.status, 401);
        });

    } finally {
        await new Promise((resolve) => server.close(resolve));
    }

    console.log("==========================================================");
    console.log(`📊 USER & ADMIN PAGE TEST SUITE: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("==========================================================");

    if (failCount > 0) {
        throw new Error(`${failCount} user page test(s) failed`);
    }
}

runUserPageTestSuite().catch((err) => {
    console.error("FATAL SUITE FAILURE:", err);
    process.exit(1);
});
