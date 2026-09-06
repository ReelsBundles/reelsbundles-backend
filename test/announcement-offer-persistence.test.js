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
    updateNotification,
    deleteNotification
} from "../src/services/notification-storage.service.js";
import {
    getAllCoupons,
    saveCoupons,
    getCouponByCode,
    createCoupon,
    deleteCoupon
} from "../src/services/coupon-storage.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NOTIFS_FILE = path.resolve(__dirname, "../data/notifications.json");
const COUPONS_FILE = path.resolve(__dirname, "../data/coupons.json");

const JWT_SECRET = process.env.JWT_SECRET || "reelsbundles_jwt_secret_dev_2026";
const adminToken = jwt.sign(
    { email: "admin@reelsbundles.com", role: "admin", sub: "admin_test_id" },
    JWT_SECRET,
    { expiresIn: "2h" }
);

async function runPersistenceTestSuite() {
    console.log("==========================================================");
    console.log("🧪 STARTING ANNOUNCEMENT & OFFER PERSISTENCE TEST SUITE");
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

    // Backup original files
    const origNotifs = fs.existsSync(NOTIFS_FILE) ? fs.readFileSync(NOTIFS_FILE, "utf8") : "[]";
    const origCoupons = fs.existsSync(COUPONS_FILE) ? fs.readFileSync(COUPONS_FILE, "utf8") : "[]";

    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        // --- TEST 1: Durable Announcement Creation and Disk Persistence ---
        let createdNotif = null;
        await test("1. Announcement persists to disk in notifications.json", async () => {
            saveNotifications([]);
            createdNotif = await createNotification({
                title: "Flash Sale Alert",
                message: "Get all reels at flat ₹49 today only!",
                type: "announcement",
                targetAudience: "all",
                active: true
            });

            assert.ok(createdNotif && createdNotif.id, "Created notification must have an ID");
            const onDisk = JSON.parse(fs.readFileSync(NOTIFS_FILE, "utf8"));
            const found = onDisk.find(n => n.id === createdNotif.id);
            assert.ok(found, "Created announcement must exist on disk in notifications.json");
            assert.strictEqual(found.title, "Flash Sale Alert");
            assert.strictEqual(found.active, true);
        });

        // --- TEST 2: Durable Coupon Creation and Disk Persistence ---
        let createdCoupon = null;
        await test("2. Coupon persists to disk in coupons.json", async () => {
            createdCoupon = await createCoupon({
                code: "PERSIST99",
                discountType: "percentage",
                discountValue: 20,
                minOrderAmount: 49,
                description: "Save 20% on any bundle",
                userBadge: "🔥 20% DISCOUNT",
                active: true
            });

            assert.ok(createdCoupon && createdCoupon.id, "Created coupon must have an ID");
            const onDisk = JSON.parse(fs.readFileSync(COUPONS_FILE, "utf8"));
            const found = onDisk.find(c => c.code === "PERSIST99");
            assert.ok(found, "Coupon PERSIST99 must exist on disk in coupons.json");
            assert.strictEqual(found.discountValue, 20);
        });

        // --- TEST 3: GET /api/notifications surfaces both announcements & coupon notifications ---
        await test("3. GET /api/notifications returns published announcements and coupon notifications", async () => {
            await createNotification({
                title: "Flash Coupon Offer",
                message: "Save 20% on any bundle with PERSIST99",
                type: "coupon",
                couponCode: "PERSIST99",
                discountValue: 20,
                active: true
            });

            const res = await fetch(`${baseUrl}/api/notifications`);
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(data.notifications.length >= 2, "Expected at least 2 items");

            const foundAnnounce = data.notifications.find(n => n.title === "Flash Sale Alert");
            assert.ok(foundAnnounce, "Active announcement must be present in public feed");

            const foundCouponOffer = data.notifications.find(n => n.type === "coupon" && n.couponCode === "PERSIST99");
            assert.ok(foundCouponOffer, "Active coupon PERSIST99 must be present in public feed");
        });

        // --- TEST 4: Items without explicit expiry NEVER expire (> 24 hours) ---
        await test("4. Announcements and notifications without explicit expiry never expire", async () => {
            const activeList = getActiveNotifications();
            const flashSale = activeList.find(n => n.title === "Flash Sale Alert");
            assert.ok(flashSale, "Announcement must still be active");
            assert.strictEqual(flashSale.expiresAt, null, "Should not have an auto-generated 24h expiration");

            const couponOffer = activeList.find(n => n.couponCode === "PERSIST99");
            assert.ok(couponOffer, "Coupon offer must still be active");
        });

        // --- TEST 5: Explicit expiryDate in the past correctly expires items ---
        await test("5. Explicit past expiry date correctly marks item expired", async () => {
            const expiredItem = await createNotification({
                title: "Expired Promo",
                message: "This expired yesterday",
                type: "announcement",
                expiresAt: new Date(Date.now() - 3600000).toISOString(),
                active: true
            });

            const activeList = getActiveNotifications();
            const foundExpired = activeList.find(n => n.id === expiredItem.id);
            assert.strictEqual(foundExpired, undefined, "Expired notification must not appear in active notifications");
        });

        // --- TEST 6: Checkout Apply Coupon accepts coupons from both sources ---
        await test("6. POST /api/apply-coupon validates code created in coupon manager", async () => {
            const res = await fetch(`${baseUrl}/api/apply-coupon`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: "PERSIST99", planKey: "basic" })
            });

            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.coupon.code, "PERSIST99");
            assert.ok(data.discountAmount > 0);
        });

        // --- TEST 7: Notification Manager coupon auto-sync to coupon engine ---
        await test("7. Coupon notification creates valid coupon applicable at checkout", async () => {
            await createNotification({
                title: "Special VIP Offer",
                message: "Use code VIPFLASH for instant discount",
                type: "coupon",
                couponCode: "VIPFLASH",
                discountValue: 15,
                active: true
            });

            const res = await fetch(`${baseUrl}/api/apply-coupon`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: "VIPFLASH", planKey: "basic" })
            });

            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.coupon.code, "VIPFLASH");
        });

        // --- TEST 8: Maintenance Passcode Routes (/passcode and /maintenance/passcode) ---
        await test("8. Maintenance passcode works on both URL aliases", async () => {
            // PUT /api/admin/system/passcode
            const res1 = await fetch(`${baseUrl}/api/admin/system/passcode`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({ passcode: "8888" })
            });
            assert.strictEqual(res1.status, 200);

            // PUT /api/admin/system/maintenance/passcode
            const res2 = await fetch(`${baseUrl}/api/admin/system/maintenance/passcode`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({ passcode: "1234" })
            });
            assert.strictEqual(res2.status, 200);
        });

        // --- TEST 9: Empty State Preservation ---
        await test("9. When no announcements or coupons exist, count is 0 for exact empty state", async () => {
            saveNotifications([]);
            saveCoupons([]);

            const res = await fetch(`${baseUrl}/api/notifications`);
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.count, 0);
            assert.deepStrictEqual(data.notifications, []);
        });

    } finally {
        server.close();
        // Restore original data
        fs.writeFileSync(NOTIFS_FILE, origNotifs, "utf8");
        fs.writeFileSync(COUPONS_FILE, origCoupons, "utf8");
    }

    console.log("==========================================================");
    console.log(`📊 RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("==========================================================");

    if (failCount > 0) {
        process.exit(1);
    }
}

runPersistenceTestSuite();
