import test from "node:test";
import assert from "node:assert";
import http from "node:http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { getDashboardStats, invalidateDashboardStatsCache } from "../src/services/dashboard.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const JWT_SECRET = process.env.JWT_SECRET || "reelsbundles_jwt_secret_dev_2026";

test("Maintenance Mode Reliability & Admin Login Performance Suite", async (t) => {
    let server;
    let baseUrl;
    const adminToken = jwt.sign(
        { email: "admin@reelsbundles.com", role: "admin", sub: "super_admin_test_123" },
        JWT_SECRET,
        { expiresIn: "2h" }
    );

    await new Promise((resolve) => {
        server = http.createServer(app);
        server.listen(0, () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });

    t.after(async () => {
        // Reset maintenance to false after test
        try {
            await fetch(`${baseUrl}/api/admin/system/maintenance`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    maintenance: false,
                    message: "All systems operational",
                    expectedBack: null
                })
            });
        } catch (e) {}
        server.close();
    });

    await t.test("1.1 Maintenance ON: Stays ON indefinitely and does NOT auto-expire when expectedBack is in past", async () => {
        const pastDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString(); // 1 day in the past
        const updateRes = await fetch(`${baseUrl}/api/admin/system/maintenance`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                maintenance: true,
                message: "Emergency upgrades in progress",
                expectedBack: pastDate,
                showTimer: false,
                testerPasscode: "5796"
            })
        });

        assert.strictEqual(updateRes.status, 200);
        const updateData = await updateRes.json();
        assert.strictEqual(updateData.success, true);
        assert.strictEqual(updateData.settings.maintenance, true);

        // Fetch multiple times to ensure stability
        for (let i = 0; i < 3; i++) {
            const pubRes = await fetch(`${baseUrl}/api/system/maintenance`);
            assert.strictEqual(pubRes.status, 200);
            const pubData = await pubRes.json();
            assert.strictEqual(pubData.maintenance, true, `Maintenance must stay ON on read ${i + 1}`);
            assert.strictEqual(pubData.expectedBack, pastDate);
            assert.strictEqual(pubData.testerPasscode, undefined, "PIN must never leak to public");
        }
    });

    await t.test("1.2 Maintenance OFF: Immediately turns OFF without mandatory message errors", async () => {
        const offRes = await fetch(`${baseUrl}/api/admin/system/maintenance`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                maintenance: false
            })
        });

        assert.strictEqual(offRes.status, 200);
        const offData = await offRes.json();
        assert.strictEqual(offData.success, true);
        assert.strictEqual(offData.settings.maintenance, false);

        const pubRes = await fetch(`${baseUrl}/api/system/maintenance`);
        const pubData = await pubRes.json();
        assert.strictEqual(pubData.maintenance, false);
    });

    await t.test("1.3 Security: Unauthenticated request to toggle maintenance returns 401", async () => {
        const unauthRes = await fetch(`${baseUrl}/api/admin/system/maintenance`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ maintenance: true })
        });
        assert.strictEqual(unauthRes.status, 401);
    });

    await t.test("1.4 PIN Verification: /api/system/verify-pin verifies live passcode", async () => {
        // Set passcode
        await fetch(`${baseUrl}/api/admin/system/maintenance/passcode`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify({ passcode: "8821" })
        });

        // Valid pin
        const validRes = await fetch(`${baseUrl}/api/system/verify-pin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin: "8821" })
        });
        const validData = await validRes.json();
        assert.strictEqual(validData.success, true);
        assert.strictEqual(validData.valid, true);

        // Invalid pin
        const invalidRes = await fetch(`${baseUrl}/api/system/verify-pin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin: "0000" })
        });
        const invalidData = await invalidRes.json();
        assert.strictEqual(invalidData.valid, false);

        // Restore 5796
        await fetch(`${baseUrl}/api/admin/system/maintenance/passcode`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify({ passcode: "5796" })
        });
    });

    await t.test("2.1 Admin Dashboard Performance: getDashboardStats completes rapidly with caching", async () => {
        invalidateDashboardStatsCache();

        const startFresh = performance.now();
        const statsFresh = await getDashboardStats();
        const durationFresh = performance.now() - startFresh;

        assert.ok(statsFresh);
        assert.ok(typeof statsFresh.orders === "number");
        assert.ok(typeof statsFresh.revenue === "number");

        // Cached call must be sub-millisecond or sub-5ms
        const startCached = performance.now();
        const statsCached = await getDashboardStats();
        const durationCached = performance.now() - startCached;

        assert.deepStrictEqual(statsFresh, statsCached);
        assert.ok(durationCached < 5, `Cached stats took ${durationCached}ms, expected < 5ms`);
    });

    await t.test("2.2 Frontend Hygiene: admin/index.html does NOT load admin-maintenance.js", () => {
        const loginHtmlPath = path.resolve(__dirname, "../../Frontend/admin/index.html");
        assert.ok(fs.existsSync(loginHtmlPath), "admin/index.html must exist");
        const content = fs.readFileSync(loginHtmlPath, "utf-8");
        assert.ok(!content.includes("admin-maintenance.js"), "admin/index.html must not include admin-maintenance.js");
    });
});
