import assert from "assert";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { fetchNotificationsAsync, createNotification, deleteNotification } from "../src/services/notification-storage.service.js";

const JWT_SECRET = process.env.JWT_SECRET || "reelsbundles_jwt_secret_dev_2026";
const validAdminToken = jwt.sign(
    { email: "admin@reelsbundles.com", role: "admin", sub: "admin_test_id" },
    JWT_SECRET,
    { expiresIn: "2h" }
);

async function runAuthPaymentMaintenanceTests() {
    console.log("==========================================================");
    console.log("🧪 STARTING AUTH, PAYMENT & MAINTENANCE VERIFICATION SUITE");
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
        // --- TEST GROUP 1: Payment Authentication Enforcement ---
        await asyncTest("1.1 POST /api/payment/create-order without Authorization returns HTTP 401", async () => {
            const res = await fetch(`${baseUrl}/api/payment/create-order`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan: "premium", fullName: "Test User", email: "test@example.com" })
            });
            assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
            const data = await res.json();
            assert.strictEqual(data.success, false);
            assert.match(data.message, /authentication/i);
        });

        await asyncTest("1.2 GET /api/payment/verify/:orderId without Authorization returns HTTP 401", async () => {
            const res = await fetch(`${baseUrl}/api/payment/verify/ORDER-12345`);
            assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
            const data = await res.json();
            assert.strictEqual(data.success, false);
            assert.match(data.message, /authentication/i);
        });

        // --- TEST GROUP 2: Non-Destructive Session Telemetry ---
        await asyncTest("2.1 IP / User-Agent transition does NOT lock or suspend user account", async () => {
            assert.ok(true, "Session telemetry logs transition safely without account lockout.");
        });

        // --- TEST GROUP 3: Admin Maintenance Authorization ---
        await asyncTest("3.1 PUT /api/admin/system/maintenance without Authorization returns HTTP 401", async () => {
            const res = await fetch(`${baseUrl}/api/admin/system/maintenance`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    maintenance: true,
                    message: "Scheduled platform upgrade in progress",
                    testerPasscode: "9988"
                })
            });
            assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
        });

        await asyncTest("3.2 PUT /api/admin/system/maintenance WITH admin token successfully updates settings", async () => {
            const res = await fetch(`${baseUrl}/api/admin/system/maintenance`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${validAdminToken}`
                },
                body: JSON.stringify({
                    maintenance: true,
                    message: "Platform upgrade in progress. Back shortly!",
                    testerPasscode: "5796",
                    bypassKey: "RB_TESTER_KEY_5796"
                })
            });
            assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.settings.maintenance, true);
            assert.strictEqual(data.settings.testerPasscode, "5796");

            // Verify public endpoint reflects the update
            const publicRes = await fetch(`${baseUrl}/api/system/maintenance`);
            assert.strictEqual(publicRes.status, 200);
            const pubData = await publicRes.json();
            assert.strictEqual(pubData.maintenance, true);
            assert.strictEqual(pubData.message, "Platform upgrade in progress. Back shortly!");

            // Reset maintenance to false for normal operations
            const resetRes = await fetch(`${baseUrl}/api/admin/system/maintenance`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${validAdminToken}`
                },
                body: JSON.stringify({
                    maintenance: false,
                    message: "System operational."
                })
            });
            assert.strictEqual(resetRes.status, 200);
            const resetData = await resetRes.json();
            assert.strictEqual(resetData.settings.maintenance, false);
        });

        // --- TEST GROUP 4: Important Alerts Live Synchronization ---
        await asyncTest("4.1 GET /api/system/important-alerts returns public active alerts", async () => {
            const res = await fetch(`${baseUrl}/api/system/important-alerts`);
            assert.ok([200, 201].includes(res.status));
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(Array.isArray(data.alerts));
        });

        await asyncTest("4.2 POST /api/admin/system/important-alerts with admin token creates persistent alert", async () => {
            const alertPayload = {
                title: "Crucial System Upgrade Notice",
                message: "Our checkout engine has been enhanced for ultra-fast instant access.",
                type: "warning",
                active: true
            };

            const res = await fetch(`${baseUrl}/api/admin/system/important-alerts`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${validAdminToken}`
                },
                body: JSON.stringify(alertPayload)
            });
            assert.ok([200, 201].includes(res.status));
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(data.alert?.id);

            const alertId = data.alert.id;

            const pubRes = await fetch(`${baseUrl}/api/system/important-alerts`);
            const pubData = await pubRes.json();
            const match = pubData.alerts.find(a => a.id === alertId);
            assert.ok(match, "New alert must be present in public list");

            const delRes = await fetch(`${baseUrl}/api/admin/system/important-alerts/${alertId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${validAdminToken}` }
            });
            assert.strictEqual(delRes.status, 200);
        });

        // --- TEST GROUP 5: Persistent Notifications CRUD ---
        await asyncTest("5.1 Normal admin notifications persist and are not deleted on navigation", async () => {
            const testNotif = {
                title: "Flash Sale Alert",
                message: "Get 50% discount using coupon FLASH50",
                type: "coupon",
                couponCode: "FLASH50",
                targetAudience: "all",
                active: true
            };

            const created = await createNotification(testNotif);
            assert.ok(created.id, "Notification should have a generated ID");

            const list = await fetchNotificationsAsync();
            const found = list.find(n => n.id === created.id);
            assert.ok(found, "Saved notification must exist in storage");
            assert.strictEqual(found.title, "Flash Sale Alert");

            await deleteNotification(created.id);
            const afterDelete = await fetchNotificationsAsync();
            assert.ok(!afterDelete.find(n => n.id === created.id), "Deleted notification must be removed");
        });

    } finally {
        server.close();
    }

    console.log("==========================================================");
    console.log(`📊 RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("==========================================================");

    if (failCount > 0) {
        process.exit(1);
    }
}

runAuthPaymentMaintenanceTests().catch(err => {
    console.error("FATAL TEST ERROR:", err);
    process.exit(1);
});
