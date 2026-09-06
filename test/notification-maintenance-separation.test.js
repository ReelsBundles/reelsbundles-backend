import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import {
    loadNotifications,
    saveNotifications,
    getActiveNotifications,
    createNotification,
    deleteNotification
} from "../src/services/notification-storage.service.js";
import {
    loadImportantAlerts,
    saveImportantAlerts,
    createImportantAlert,
    deleteImportantAlert
} from "../src/services/alert-storage.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NOTIFS_FILE = path.resolve(__dirname, "../data/notifications.json");
const ALERTS_FILE = path.resolve(__dirname, "../data/important_alerts.json");
const SETTINGS_FILE = path.resolve(__dirname, "../data/system_settings.json");

const JWT_SECRET = process.env.JWT_SECRET || "reelsbundles_jwt_secret_dev_2026";
const adminToken = jwt.sign(
    { email: "admin@reelsbundles.com", role: "admin", sub: "admin_test_id" },
    JWT_SECRET,
    { expiresIn: "2h" }
);

async function runSeparationTestSuite() {
    console.log("==========================================================");
    console.log("🧪 NOTIFICATION & MAINTENANCE SEPARATION TEST SUITE");
    console.log("==========================================================");

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

    // Back up original files
    const origNotifs = fs.existsSync(NOTIFS_FILE) ? fs.readFileSync(NOTIFS_FILE, "utf8") : "[]";
    const origAlerts = fs.existsSync(ALERTS_FILE) ? fs.readFileSync(ALERTS_FILE, "utf8") : "[]";
    const origSettings = fs.existsSync(SETTINGS_FILE) ? fs.readFileSync(SETTINGS_FILE, "utf8") : "{}";

    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        // --- TEST 1: Empty Database Rule: 0 notifications in DB returns strictly 0 items ---
        await test("1. Empty Database Rule: 0 notifications returns empty list and no fabricated data", async () => {
            saveNotifications([]);
            const res = await fetch(`${baseUrl}/api/notifications`);
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.count, 0);
            assert.deepStrictEqual(data.notifications, []);
        });

        // --- TEST 2: Maintenance Separation: Enabling maintenance does NOT create a notification ---
        await test("2. Maintenance Separation: Enabling maintenance does not insert into notifications", async () => {
            saveNotifications([]);
            const maintMsg = "🚀 We are upgrading our cloud servers for faster downloads and better performance. Back online shortly!";
            const putRes = await fetch(`${baseUrl}/api/admin/system/maintenance`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    maintenance: true,
                    message: maintMsg,
                    showTimer: false
                })
            });
            assert.strictEqual(putRes.status, 200);

            // Verify maintenance endpoint returns maintenance info
            const mRes = await fetch(`${baseUrl}/api/system/maintenance`);
            assert.strictEqual(mRes.status, 200);
            const mData = await mRes.json();
            assert.strictEqual(mData.maintenance, true);
            assert.strictEqual(mData.message, maintMsg);

            // Verify notifications endpoint is completely untouched (0 notifications)
            const nRes = await fetch(`${baseUrl}/api/notifications`);
            const nData = await nRes.json();
            assert.strictEqual(nData.count, 0);
            assert.deepStrictEqual(nData.notifications, []);
        });

        // --- TEST 3: Important Alerts Separation: Creating alert does NOT copy into notifications ---
        await test("3. Important Alerts Separation: Creating an alert does not copy into notifications", async () => {
            saveNotifications([]);
            const alertRes = await fetch(`${baseUrl}/api/admin/system/important-alerts`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    title: "Critical Gateway Upgrade",
                    message: "High speed routing enabled.",
                    level: "info",
                    active: true
                })
            });
            assert.strictEqual(alertRes.status, 201);

            // Notifications endpoint must remain strictly 0
            const nRes = await fetch(`${baseUrl}/api/notifications`);
            const nData = await nRes.json();
            assert.strictEqual(nData.count, 0);
            assert.deepStrictEqual(nData.notifications, []);
        });

        // --- TEST 4: Real Notification Lifecycle: Admin creates -> User sees -> Admin disables -> User does not see ---
        await test("4. Real Notification Lifecycle: Full create, retrieve, deactivate, delete flow", async () => {
            // Admin creates real announcement
            const createRes = await fetch(`${baseUrl}/api/admin/notifications`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    title: "New AI Bundle Released",
                    message: "Check out 10,000 new reels in the library.",
                    type: "announcement",
                    targetAudience: "all",
                    active: true
                })
            });
            assert.strictEqual(createRes.status, 201);
            const created = await createRes.json();
            const notifId = created.notification.id;

            // Public user gets exactly 1 notification
            const uRes1 = await fetch(`${baseUrl}/api/notifications`);
            const uData1 = await uRes1.json();
            assert.strictEqual(uData1.count, 1);
            assert.strictEqual(uData1.notifications[0].title, "New AI Bundle Released");

            // Admin deactivates notification
            const putRes = await fetch(`${baseUrl}/api/admin/notifications/${notifId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({ active: false })
            });
            assert.strictEqual(putRes.status, 200);

            // Public user now sees 0 active notifications
            const uRes2 = await fetch(`${baseUrl}/api/notifications`);
            const uData2 = await uRes2.json();
            assert.strictEqual(uData2.count, 0);

            // Admin deletes notification
            const delRes = await fetch(`${baseUrl}/api/admin/notifications/${notifId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            assert.strictEqual(delRes.status, 200);
        });

        // --- TEST 5: Frontend Maintenance Duplication Elimination Contract ---
        await test("5. Frontend Maintenance Duplication Elimination: Static files verify zero duplication paths", async () => {
            const maintGuardPath = path.resolve(__dirname, "../../Frontend/assets/js/maintenance-guard.js");
            const maintHtmlPath = path.resolve(__dirname, "../../Frontend/maintenance.html");
            const maintHtmlIndexPath = path.resolve(__dirname, "../../Frontend/maintenance/index.html");
            const maintGuardContent = fs.readFileSync(maintGuardPath, "utf8");
            const maintHtmlContent = fs.readFileSync(maintHtmlPath, "utf8");
            const maintHtmlIndexContent = fs.readFileSync(maintHtmlIndexPath, "utf8");

            // maintBellBtn must not exist in maintenance.html or maintenance/index.html
            assert.ok(!maintHtmlContent.includes("maintBellBtn"), "maintBellBtn must be removed from maintenance.html");
            assert.ok(!maintHtmlIndexContent.includes("maintBellBtn"), "maintBellBtn must be removed from maintenance/index.html");
            // notifications.js must not be included in maintenance.html or maintenance/index.html
            assert.ok(!maintHtmlContent.includes("notifications.js"), "notifications.js must not be included in maintenance.html");
            assert.ok(!maintHtmlIndexContent.includes("notifications.js"), "notifications.js must not be included in maintenance/index.html");

            // renderMaintenanceOverlay must not have duplicate alert box when countdown is null
            assert.ok(!maintGuardContent.includes("✨ ${escapeHtml(message)}"), "Duplicate message alert box must be removed from maintenance-guard.js");
            // maintAlertModal must not exist in maintenance-guard.js
            assert.ok(!maintGuardContent.includes("openMaintenanceAlertModal"), "openMaintenanceAlertModal must be removed from maintenance-guard.js");
        });

        // --- TEST 6: Frontend Ticker & Notification Decoupling Contract ---
        await test("6. Frontend Ticker Decoupling: Index HTML and notifications.js eliminate fake special offer", async () => {
            const indexHtmlPath = path.resolve(__dirname, "../../Frontend/index.html");
            const notifsJsPath = path.resolve(__dirname, "../../Frontend/assets/js/notifications.js");
            const indexContent = fs.readFileSync(indexHtmlPath, "utf8");
            const notifsContent = fs.readFileSync(notifsJsPath, "utf8");

            // index.html must not contain hardcoded SPECIAL OFFER in ticker-badge
            assert.ok(!indexContent.includes('class="ticker-badge">📢 SPECIAL OFFER</span>'), "Hardcoded SPECIAL OFFER must be removed from index.html");

            // notifications.js must not fabricate maintenance notifications
            assert.ok(!notifsContent.includes("system_maintenance_active_alert"), "notifications.js must not synthesize maintenance notifications");

            // notifications.js must preserve exact empty state
            assert.ok(notifsContent.includes("📢 No any kind of announcements and offers"), "notifications.js must preserve exact required empty state string");
        });

    } finally {
        server.close();
        fs.writeFileSync(NOTIFS_FILE, origNotifs, "utf8");
        fs.writeFileSync(ALERTS_FILE, origAlerts, "utf8");
        fs.writeFileSync(SETTINGS_FILE, origSettings, "utf8");
    }

    console.log("==========================================================");
    console.log(`📊 RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("==========================================================");

    if (failCount > 0) {
        process.exit(1);
    }
}

runSeparationTestSuite();
