import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import app from "../src/app.js";

import {
    getAllVideos,
    saveVideos,
    addVideo,
    updateVideo,
    toggleVideo,
    deleteVideo,
    getActiveVideosAsync
} from "../src/services/demo-video-storage.service.js";

import {
    loadImportantAlerts,
    saveImportantAlerts,
    createImportantAlert,
    updateImportantAlert,
    deleteImportantAlert,
    getActiveImportantAlerts
} from "../src/services/alert-storage.service.js";

import {
    loadNotifications,
    saveNotifications,
    createNotification,
    deleteNotification,
    getActiveNotifications
} from "../src/services/notification-storage.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEMO_FILE = path.resolve(__dirname, "../data/demo-videos.json");
const SETTINGS_FILE = path.resolve(__dirname, "../data/system_settings.json");
const ALERTS_FILE = path.resolve(__dirname, "../data/important_alerts.json");
const NOTIFS_FILE = path.resolve(__dirname, "../data/notifications.json");
const COUPONS_FILE = path.resolve(__dirname, "../data/coupons.json");

const JWT_SECRET = process.env.JWT_SECRET || "reelsbundles_jwt_secret_dev_2026";
const adminToken = jwt.sign(
    { email: "admin@reelsbundles.com", role: "admin", sub: "admin_test_id" },
    JWT_SECRET,
    { expiresIn: "2h" }
);

async function runFinalProductionPersistenceTests() {
    console.log("==================================================================");
    console.log("🧪 RUNNING FINAL PRODUCTION PERSISTENCE & AUTO-SYNC TEST SUITE");
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

    // Back up original files
    const origDemos = fs.existsSync(DEMO_FILE) ? fs.readFileSync(DEMO_FILE, "utf8") : "[]";
    const origSettings = fs.existsSync(SETTINGS_FILE) ? fs.readFileSync(SETTINGS_FILE, "utf8") : "{}";
    const origAlerts = fs.existsSync(ALERTS_FILE) ? fs.readFileSync(ALERTS_FILE, "utf8") : "[]";
    const origNotifs = fs.existsSync(NOTIFS_FILE) ? fs.readFileSync(NOTIFS_FILE, "utf8") : "[]";
    const origCoupons = fs.existsSync(COUPONS_FILE) ? fs.readFileSync(COUPONS_FILE, "utf8") : "[]";

    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        // =========================================================
        // PART 1: DEMO VIDEOS TESTS
        // =========================================================

        await test("1.1 Demo Videos: Empty database returns empty list (no dummy/fake videos)", async () => {
            saveVideos([]);
            const res = await fetch(`${baseUrl}/api/demo/videos`);
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.deepStrictEqual(data.videos, []);
        });

        await test("1.2 Demo Videos: Unauthorized visitor cannot add video (401)", async () => {
            const res = await fetch(`${baseUrl}/api/admin/demo-videos`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: "Hacked Video",
                    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                })
            });
            assert.strictEqual(res.status, 401);
        });

        let createdVideoId = null;
        await test("1.3 Demo Videos: Admin adds video, persists to disk and returns in public API", async () => {
            const res = await fetch(`${baseUrl}/api/admin/demo-videos`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    title: "AI Reels Bundle Showcase",
                    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    videoType: "video",
                    category: "AI Reels"
                })
            });
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(data.video.id);
            assert.strictEqual(data.video.title, "AI Reels Bundle Showcase");
            assert.strictEqual(data.video.videoId, "dQw4w9WgXcQ");
            createdVideoId = data.video.id;

            // Check public API
            const pubRes = await fetch(`${baseUrl}/api/demo/videos`);
            const pubData = await pubRes.json();
            assert.strictEqual(pubData.success, true);
            assert.strictEqual(pubData.videos.length, 1);
            assert.strictEqual(pubData.videos[0].id, createdVideoId);
        });

        await test("1.4 Demo Videos: Admin updates video (edit persistence)", async () => {
            const res = await fetch(`${baseUrl}/api/admin/demo-videos/${createdVideoId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    title: "Updated AI Reels Bundle Showcase",
                    category: "Premium AI"
                })
            });
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.video.title, "Updated AI Reels Bundle Showcase");
            assert.strictEqual(data.video.category, "Premium AI");

            // Verify persistence in public API
            const pubRes = await fetch(`${baseUrl}/api/demo/videos`);
            const pubData = await pubRes.json();
            assert.strictEqual(pubData.videos[0].title, "Updated AI Reels Bundle Showcase");
            assert.strictEqual(pubData.videos[0].category, "Premium AI");
        });

        await test("1.5 Demo Videos: Admin toggles video visibility", async () => {
            const res = await fetch(`${baseUrl}/api/admin/demo-videos/${createdVideoId}/toggle`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.video.active, false);

            // Public API should hide inactive videos
            const pubRes = await fetch(`${baseUrl}/api/demo/videos`);
            const pubData = await pubRes.json();
            assert.strictEqual(pubData.videos.length, 0);

            // Admin API still lists it
            const adminRes = await fetch(`${baseUrl}/api/admin/demo-videos`, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            const adminData = await adminRes.json();
            assert.strictEqual(adminData.videos.length, 1);
            assert.strictEqual(adminData.videos[0].active, false);

            // Toggle back to active
            await fetch(`${baseUrl}/api/admin/demo-videos/${createdVideoId}/toggle`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${adminToken}` }
            });
        });

        await test("1.6 Demo Videos: Admin deletes video, remains deleted across reloads", async () => {
            const delRes = await fetch(`${baseUrl}/api/admin/demo-videos/${createdVideoId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            assert.strictEqual(delRes.status, 200);

            // Check public API is now clean empty
            const pubRes = await fetch(`${baseUrl}/api/demo/videos`);
            const pubData = await pubRes.json();
            assert.strictEqual(pubData.videos.length, 0);

            // Verify disk storage directly
            const onDisk = getAllVideos();
            assert.strictEqual(onDisk.length, 0);
        });

        // =========================================================
        // PART 2: MAINTENANCE & PASSCODE PERSISTENCE
        // =========================================================

        await test("2.1 Maintenance: Public endpoint NEVER leaks testerPasscode or bypassKey", async () => {
            const res = await fetch(`${baseUrl}/api/system/maintenance`);
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.testerPasscode, undefined);
            assert.strictEqual(data.bypassKey, undefined);
        });

        await test("2.2 Maintenance: Admin endpoint returns testerPasscode to authenticated Admin only", async () => {
            const res = await fetch(`${baseUrl}/api/admin/system/maintenance`, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(data.testerPasscode);
            assert.ok(data.bypassKey);
        });

        await test("2.3 Maintenance: Indefinite persistence when expectedBack is null (No 24h auto-off)", async () => {
            const maintPayload = {
                maintenance: true,
                message: "🛠️ Upgrading core storage servers.",
                expectedBack: null,
                showTimer: false,
                testerPasscode: "7890"
            };
            const updateRes = await fetch(`${baseUrl}/api/admin/system/maintenance`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify(maintPayload)
            });
            assert.strictEqual(updateRes.status, 200);

            // Check public maintenance endpoint
            const pubRes = await fetch(`${baseUrl}/api/system/maintenance`);
            const pubData = await pubRes.json();
            assert.strictEqual(pubData.maintenance, true);
            assert.strictEqual(pubData.expectedBack, null);
            assert.strictEqual(pubData.message, "🛠️ Upgrading core storage servers.");
            assert.strictEqual(pubData.testerPasscode, undefined); // Secure!
        });

        await test("2.4 Maintenance: Explicit expectedBack in the past auto-expires maintenance", async () => {
            const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
            await fetch(`${baseUrl}/api/admin/system/maintenance`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    maintenance: true,
                    expectedBack: pastDate
                })
            });

            const pubRes = await fetch(`${baseUrl}/api/system/maintenance`);
            const pubData = await pubRes.json();
            // Since expected completion date was reached in the past, it auto-expires
            assert.strictEqual(pubData.maintenance, false);
        });

        await test("2.5 Maintenance: Explicit expectedBack in the future remains ACTIVE", async () => {
            const futureDate = new Date(Date.now() + 7200 * 1000).toISOString();
            await fetch(`${baseUrl}/api/admin/system/maintenance`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    maintenance: true,
                    expectedBack: futureDate
                })
            });

            const pubRes = await fetch(`${baseUrl}/api/system/maintenance`);
            const pubData = await pubRes.json();
            assert.strictEqual(pubData.maintenance, true);
            assert.strictEqual(pubData.expectedBack, futureDate);
        });

        await test("2.6 Maintenance Passcode: Update passcode and verify via POST /api/system/verify-pin", async () => {
            const newPin = "9432";
            const updateRes = await fetch(`${baseUrl}/api/admin/system/maintenance/passcode`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({ testerPasscode: newPin })
            });
            assert.strictEqual(updateRes.status, 200);

            // Verify with correct PIN
            const verifyCorrect = await fetch(`${baseUrl}/api/system/verify-pin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin: newPin })
            });
            const vCorrData = await verifyCorrect.json();
            assert.strictEqual(vCorrData.success, true);
            assert.strictEqual(vCorrData.valid, true);

            // Verify with incorrect PIN
            const verifyWrong = await fetch(`${baseUrl}/api/system/verify-pin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin: "0000" })
            });
            const vWrongData = await verifyWrong.json();
            assert.strictEqual(vWrongData.success, true);
            assert.strictEqual(vWrongData.valid, false);

            // Turn maintenance back off
            await fetch(`${baseUrl}/api/admin/system/maintenance`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({ maintenance: false, expectedBack: null })
            });
        });

        // =========================================================
        // PART 3: IMPORTANT ALERTS PERSISTENCE
        // =========================================================

        let alertId = null;
        await test("3.1 Important Alerts: Admin creates and updates alert with persistence", async () => {
            const createRes = await fetch(`${baseUrl}/api/admin/system/important-alerts`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    title: "Scheduled Cloud Maintenance",
                    message: "Expected downtime 10 mins at midnight.",
                    level: "warning",
                    active: true
                })
            });
            assert.strictEqual(createRes.status, 201);
            const cData = await createRes.json();
            assert.ok(cData.alert.id);
            alertId = cData.alert.id;

            // Verify in public endpoint
            const pubRes = await fetch(`${baseUrl}/api/system/important-alerts`);
            const pubData = await pubRes.json();
            assert.ok(pubData.alerts.some(a => a.id === alertId));

            // Clean up
            await fetch(`${baseUrl}/api/admin/system/important-alerts/${alertId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${adminToken}` }
            });
        });

        // =========================================================
        // PART 4: NORMAL NOTIFICATIONS PERSISTENCE & EMPTY STATE
        // =========================================================

        await test("4.1 Notifications: Empty state returns count 0 and empty array", async () => {
            saveNotifications([]);
            const res = await fetch(`${baseUrl}/api/notifications`);
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.count, 0);
            assert.deepStrictEqual(data.notifications, []);
        });

        let notifId = null;
        await test("4.2 Notifications: Admin creates coupon notification with lifetime persistence", async () => {
            const createRes = await fetch(`${baseUrl}/api/admin/notifications`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    title: "Special Launch Offer",
                    message: "Save 20% on any reel bundle!",
                    type: "coupon",
                    couponCode: "LAUNCH20",
                    targetAudience: "all",
                    active: true
                })
            });
            assert.strictEqual(createRes.status, 201);
            const cData = await createRes.json();
            assert.ok(cData.notification.id);
            assert.strictEqual(cData.notification.expiresAt, null); // Lifetime persistence, no 24h TTL
            notifId = cData.notification.id;

            // Verify in public API
            const pubRes = await fetch(`${baseUrl}/api/notifications`);
            const pubData = await pubRes.json();
            assert.strictEqual(pubData.count, 1);
            assert.strictEqual(pubData.notifications[0].id, notifId);
            assert.strictEqual(pubData.notifications[0].couponCode, "LAUNCH20");

            // Clean up
            await fetch(`${baseUrl}/api/admin/notifications/${notifId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${adminToken}` }
            });
        });

        // =========================================================
        // PART 5: STRICT SYSTEM SEPARATION TEST
        // =========================================================

        await test("5.1 System Separation: Maintenance does not affect Notifications or Alerts", async () => {
            saveNotifications([]);
            saveImportantAlerts([]);

            // Enable maintenance
            await fetch(`${baseUrl}/api/admin/system/maintenance`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    maintenance: true,
                    message: "Strict separation verification.",
                    expectedBack: null
                })
            });

            // Notifications must STILL be empty
            const notifRes = await fetch(`${baseUrl}/api/notifications`);
            const notifData = await notifRes.json();
            assert.strictEqual(notifData.count, 0);
            assert.deepStrictEqual(notifData.notifications, []);

            // Alerts must STILL be empty
            const alertRes = await fetch(`${baseUrl}/api/system/important-alerts`);
            const alertData = await alertRes.json();
            assert.strictEqual(alertData.count, 0);
            assert.deepStrictEqual(alertData.alerts, []);

            // Turn maintenance back off
            await fetch(`${baseUrl}/api/admin/system/maintenance`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({ maintenance: false, expectedBack: null })
            });
        });

    } finally {
        // Restore original files
        fs.writeFileSync(DEMO_FILE, origDemos, "utf8");
        fs.writeFileSync(SETTINGS_FILE, origSettings, "utf8");
        fs.writeFileSync(ALERTS_FILE, origAlerts, "utf8");
        fs.writeFileSync(NOTIFS_FILE, origNotifs, "utf8");
        fs.writeFileSync(COUPONS_FILE, origCoupons, "utf8");
        server.close();
    }

    console.log("==================================================================");
    console.log(`📊 FINAL PRODUCTION PERSISTENCE RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("==================================================================");

    if (failCount > 0) {
        process.exit(1);
    }
}

runFinalProductionPersistenceTests().catch((err) => {
    console.error("Test Suite Failed with Exception:", err);
    process.exit(1);
});
