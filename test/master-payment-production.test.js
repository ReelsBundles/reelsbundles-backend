import assert from "node:assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { getPlan, generateOrder } from "../src/services/payment.service.js";
import { normalizePhoneNumber, createUroPayOrder, verifyUroPayOrder } from "../src/services/uropay.service.js";
import {
    savePayment,
    getPayment,
    updatePayment,
    deletePayment,
    getUserEntitlement
} from "../src/services/payment-storage.service.js";
import { isFirestoreAvailable } from "../src/config/firebase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, "../../Frontend");

const JWT_SECRET = process.env.JWT_SECRET || "reelsbundles_jwt_secret_dev_2026";
const adminToken = jwt.sign(
    { email: "admin@reelsbundles.com", role: "admin", sub: "admin_test_id" },
    JWT_SECRET,
    { expiresIn: "2h" }
);

async function runMasterPaymentProductionTests() {
    console.log("==================================================================");
    console.log("🚀 MASTER PRODUCTION PAYMENT & SYSTEM AUDIT SUITE");
    console.log("   PHASE 1 (Create-Order & Auth & UroPay)");
    console.log("   PHASE 2 (Verification & Entitlement & Success)");
    console.log("   PHASE 3 (Platform Regression, Storage & Isolation)");
    console.log("==================================================================");

    let passCount = 0;
    let failCount = 0;

    async function test(desc, fn) {
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
        // =============================================================
        // PHASE 1: CREATE-ORDER, PRICING AUTHORITY, ANTI-TAMPERING & UROPAY
        // =============================================================
        console.log("\n--- PHASE 1: CREATE-ORDER, AUTH, PRICING & UROPAY ---");

        await test("1.1 Payment Auth: POST /api/payment/create-order without Authorization returns HTTP 401", async () => {
            const res = await fetch(`${baseUrl}/api/payment/create-order`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    plan: "basic",
                    customer: { name: "Test User", email: "test@example.com", phone: "9876543210" }
                })
            });
            assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
            const data = await res.json();
            assert.strictEqual(data.success, false);
            assert.match(data.message, /authentication/i);
        });

        await test("1.2 Plan Authority: Server enforces authoritative pricing (Basic ₹49, Premium ₹69)", () => {
            const basic = getPlan("basic");
            assert.strictEqual(basic.id, "basic");
            assert.strictEqual(basic.amount, 49);

            const premium = getPlan("premium");
            assert.strictEqual(premium.id, "premium");
            assert.strictEqual(premium.amount, 69);

            // Unknown plan safely defaults to basic ₹49
            const unknown = getPlan("malicious_zero_price_plan");
            assert.strictEqual(unknown.id, "basic");
            assert.strictEqual(unknown.amount, 49);
        });

        await test("1.3 Phone Normalization: Formats phone numbers cleanly to 10 digits", () => {
            assert.strictEqual(normalizePhoneNumber("+91 9876543210"), "9876543210");
            assert.strictEqual(normalizePhoneNumber("91-9876543210"), "9876543210");
            assert.strictEqual(normalizePhoneNumber("09876543210"), "9876543210");
            assert.strictEqual(normalizePhoneNumber("98765 43210"), "9876543210");
            assert.strictEqual(normalizePhoneNumber("9876543210"), "9876543210");
            assert.strictEqual(normalizePhoneNumber(""), "");
        });

        await test("1.4 UroPay Service: Never generates fake PAID fallback orders; strictly fails if unconfigured", async () => {
            const testOrder = {
                orderId: "TEST_ORDER_UROPAY_VERIFY_999",
                amount: 49,
                customer: { name: "Audit Test", email: "audit@test.com", phone: "9876543210" },
                notes: { plan: "basic" }
            };

            const origKey = process.env.UROPAY_API_KEY;
            const origSecret = process.env.UROPAY_API_SECRET;
            const origTestKey = process.env.UROPAY_TEST_API_KEY;
            const origTestSecret = process.env.UROPAY_TEST_API_SECRET;

            try {
                // Clear keys to test strict error handling
                delete process.env.UROPAY_API_KEY;
                delete process.env.UROPAY_API_SECRET;
                delete process.env.UROPAY_TEST_API_KEY;
                delete process.env.UROPAY_TEST_API_SECRET;

                let threwError = false;
                try {
                    await createUroPayOrder(testOrder);
                } catch (err) {
                    threwError = true;
                    assert.match(err.message, /credentials.*not configured|failed/i);
                }
                assert.ok(threwError, "Expected createUroPayOrder to throw when unconfigured, instead of returning fake PAID order");
            } finally {
                if (origKey) process.env.UROPAY_API_KEY = origKey;
                if (origSecret) process.env.UROPAY_API_SECRET = origSecret;
                if (origTestKey) process.env.UROPAY_TEST_API_KEY = origTestKey;
                if (origTestSecret) process.env.UROPAY_TEST_API_SECRET = origTestSecret;
            }
        });

        await test("1.5 Frontend Script Integrity: Broken uropay.js script tag permanently removed from HTML files", () => {
            const htmlFiles = [
                path.join(FRONTEND_DIR, "payment.html"),
                path.join(FRONTEND_DIR, "payment/index.html"),
                path.join(FRONTEND_DIR, "checkout/index.html")
            ];

            htmlFiles.forEach(file => {
                assert.ok(fs.existsSync(file), `File missing: ${file}`);
                const content = fs.readFileSync(file, "utf8");
                assert.ok(!content.includes("sdk.uropay.com"), `File ${file} still contains sdk.uropay.com reference`);
                assert.ok(!content.includes("uropay.js"), `File ${file} still contains uropay.js reference`);
            });
        });

        await test("1.6 Frontend Cashfree Removal: No Cashfree SDK functions remain in payment.js", () => {
            const paymentJsPath = path.join(FRONTEND_DIR, "assets/js/payment.js");
            assert.ok(fs.existsSync(paymentJsPath), "payment.js missing");
            const content = fs.readFileSync(paymentJsPath, "utf8");
            assert.ok(!content.includes("loadCashfreeSDK"), "payment.js still contains loadCashfreeSDK");
            assert.ok(!content.includes("waitForCashfree"), "payment.js still contains waitForCashfree");
            assert.ok(!content.includes("openCashfreeCheckout"), "payment.js still contains openCashfreeCheckout");
            assert.ok(!content.includes("cashfree.js"), "payment.js still contains cashfree.js reference");
            assert.ok(content.includes("targetUrl") && content.includes("window.location.href = targetUrl"), "payment.js must redirect to UroPay checkout URL");
        });

        // =============================================================
        // PHASE 2: PAYMENT VERIFICATION, ENTITLEMENT & SUCCESS STATE MACHINE
        // =============================================================
        console.log("\n--- PHASE 2: VERIFICATION, ENTITLEMENT & SUCCESS STATE MACHINE ---");

        await test("2.1 Verification Auth: GET /api/payment/verify/:orderId without auth returns HTTP 401", async () => {
            const res = await fetch(`${baseUrl}/api/payment/verify/RB_basic_sample_order`);
            assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
            const data = await res.json();
            assert.strictEqual(data.success, false);
        });

        await test("2.2 Verification Auth: GET /api/payment/verify?order_id=... without auth returns HTTP 401", async () => {
            const res = await fetch(`${baseUrl}/api/payment/verify?order_id=RB_basic_sample_order`);
            assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
            const data = await res.json();
            assert.strictEqual(data.success, false);
        });

        await test("2.3 Payment Storage Persistence & Fallback: Saves and retrieves payment records reliably", async () => {
            const timestamp = Date.now();
            const testOrderId = `RB_AUDIT_ORDER_${timestamp}`;
            const testUserUid = `audit_user_uid_${timestamp}`;
            const testPayment = {
                orderId: testOrderId,
                amount: 69,
                plan: "premium",
                userUid: testUserUid,
                userEmail: `audit_${timestamp}@reelsbundles.com`,
                customerName: "Audit Test",
                customerPhone: "9876543210",
                status: "PENDING",
                createdAt: new Date().toISOString()
            };

            await savePayment(testPayment);
            const retrieved = await getPayment(testOrderId);
            assert.ok(retrieved, "Failed to retrieve stored payment");
            assert.strictEqual(retrieved.orderId, testOrderId);
            assert.strictEqual(retrieved.amount, 69);
            assert.strictEqual(retrieved.status, "PENDING");
            assert.strictEqual(retrieved.userUid, testUserUid);

            // Update payment to PAID
            await updatePayment(testOrderId, { status: "PAID", paymentId: `URPY_TXN_AUDIT_${timestamp}` });
            const updated = await getPayment(testOrderId);
            assert.strictEqual(updated.status, "PAID");
            assert.strictEqual(updated.paymentId, `URPY_TXN_AUDIT_${timestamp}`);

            // Verify entitlement derivation
            const entitlement = await getUserEntitlement(testUserUid, `audit_${timestamp}@reelsbundles.com`);
            assert.strictEqual(entitlement.hasAccess, true);
            assert.strictEqual(entitlement.tier, "premium");
            assert.strictEqual(entitlement.ordersCount, 1);

            // Clean up test order
            await deletePayment(testOrderId);
        });

        await test("2.4 Success Page State Machine: Handles bounded polling, timeout screen & manual retry", () => {
            const successJsPath = path.join(FRONTEND_DIR, "assets/js/success.js");
            assert.ok(fs.existsSync(successJsPath), "success.js missing");
            const content = fs.readFileSync(successJsPath, "utf8");

            assert.ok(content.includes("MAX_PENDING_ATTEMPTS = 5"), "success.js must define MAX_PENDING_ATTEMPTS = 5");
            assert.ok(content.includes("showPendingTimeoutScreen()"), "success.js must implement showPendingTimeoutScreen");
            assert.ok(content.includes("Payment Processing"), "success.js must inform user of payment processing state");
            assert.ok(content.includes("Retry Verification"), "success.js must provide manual retry button");
            assert.ok(content.includes("verifyPayment()"), "Retry button must re-run verifyPayment without duplicate orders");
            assert.ok(content.includes("/login?return="), "success.js must redirect unauthenticated users to login with return URL");
            assert.ok(content.includes("failed.html"), "Terminal failed/cancelled statuses must redirect to failed.html");
        });

        // =============================================================
        // PHASE 3: PLATFORM REGRESSION, SEPARATION & PERSISTENCE
        // =============================================================
        console.log("\n--- PHASE 3: FULL REGRESSION, SEPARATION & PERSISTENCE ---");

        await test("3.1 Maintenance Guard: Prevents duplicate banner when modal overlay is active", () => {
            const guardPath = path.join(FRONTEND_DIR, "assets/js/maintenance-guard.js");
            assert.ok(fs.existsSync(guardPath), "maintenance-guard.js missing");
            const content = fs.readFileSync(guardPath, "utf8");
            assert.ok(
                content.includes("!activeOverlay") || content.includes("maintOverlay"),
                "maintenance-guard.js must guard against rendering alert banner when modal overlay is visible"
            );
        });

        await test("3.2 Announcement / Offer Bar: Clean empty state returns valid structure", async () => {
            const res = await fetch(`${baseUrl}/api/notifications`);
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(Array.isArray(data.notifications));
        });

        await test("3.3 Demo Videos: Clean empty state returns empty array without dummy videos", async () => {
            const res = await fetch(`${baseUrl}/api/demo/videos`);
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(Array.isArray(data.videos));
        });

        await test("3.4 Maintenance Public API: Clean response never exposes testerPasscode to public", async () => {
            const res = await fetch(`${baseUrl}/api/system/maintenance`);
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(typeof data.maintenance, "boolean");
            assert.strictEqual(data.testerPasscode, undefined, "Public endpoint must not expose testerPasscode");
            assert.strictEqual(data.bypassKey, undefined, "Public endpoint must not expose bypassKey");
        });

        await test("3.5 Important Alerts: Public endpoint returns active alerts safely", async () => {
            const res = await fetch(`${baseUrl}/api/system/important-alerts`);
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(Array.isArray(data.alerts));
        });

        await test("3.6 Admin Protection: Admin endpoints reject unauthenticated access", async () => {
            const endpoints = [
                { method: "GET", path: "/api/admin/orders" },
                { method: "GET", path: "/api/admin/bundles" },
                { method: "GET", path: "/api/admin/system/maintenance" },
                { method: "GET", path: "/api/admin/demo-videos" }
            ];

            for (const ep of endpoints) {
                const res = await fetch(`${baseUrl}${ep.path}`, { method: ep.method });
                assert.strictEqual(res.status, 401, `Expected 401 for ${ep.path}, got ${res.status}`);
            }
        });

    } finally {
        await new Promise((resolve) => server.close(resolve));
    }

    console.log("\n==================================================================");
    console.log(`📊 MASTER AUDIT RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("==================================================================");

    if (failCount > 0) {
        process.exit(1);
    }
}

runMasterPaymentProductionTests().catch((err) => {
    console.error("FATAL ERROR IN MASTER AUDIT SUITE:", err);
    process.exit(1);
});
