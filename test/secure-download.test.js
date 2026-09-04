/* ==========================================================
   REELSBUNDLES — SECURE DOWNLOAD VERIFICATION SUITE
   PHASE 2 COMPREHENSIVE TEST SUITE
========================================================== */

import assert from "assert";
import app from "../src/app.js";
import { getBundles, getBundle, getBundlesByPlan, getPublicActiveBundles } from "../src/services/bundle.service.js";
import { getUserBundleLibrary, getUserBundle, getUserBundleFiles } from "../src/services/user-bundle.service.js";
import { savePayment, loadLocalPayments } from "../src/services/payment-storage.service.js";
import { saveDownloadLog, getLocalDownloadLogs } from "../src/services/download-log.service.js";
import { streamDriveFile } from "../src/services/google-drive-stream.service.js";

async function runTestSuite() {
    console.log("====================================================");
    console.log("🔒 STARTING PHASE 2: SECURE DOWNLOAD TEST SUITE");
    console.log("====================================================");

    let passed = 0;
    let failed = 0;

    async function test(name, fn) {
        try {
            await fn();
            console.log(`  ✅ PASS: ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ FAIL: ${name}`);
            console.error(`     Error: ${err.message}`);
            failed++;
        }
    }

    // Start ephemeral server for HTTP testing
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        // --- 1. UNAUTHENTICATED TESTS (Rule: Unauthenticated user -> Denied 401) ---
        await test("1.1 Unauthenticated GET /api/user/bundles returns 401", async () => {
            const res = await fetch(`${baseUrl}/api/user/bundles`);
            assert.strictEqual(res.status, 401);
            const data = await res.json();
            assert.strictEqual(data.success, false);
            assert.match(data.message, /authentication/i);
        });

        await test("1.2 Unauthenticated GET /api/user/bundles/:id/files returns 401", async () => {
            const res = await fetch(`${baseUrl}/api/user/bundles/bundle_basic_reels_01/files`);
            assert.strictEqual(res.status, 401);
            const data = await res.json();
            assert.strictEqual(data.success, false);
        });

        await test("1.3 Unauthenticated GET /api/user/bundles/:id/file/:fileId returns 401", async () => {
            const res = await fetch(`${baseUrl}/api/user/bundles/bundle_basic_reels_01/file/file123`);
            assert.strictEqual(res.status, 401);
            const data = await res.json();
            assert.strictEqual(data.success, false);
        });

        await test("1.4 Unauthenticated GET /api/secure-download/:bundleId returns 401", async () => {
            const res = await fetch(`${baseUrl}/api/secure-download/bundle_basic_reels_01`);
            assert.strictEqual(res.status, 401);
            const data = await res.json();
            assert.strictEqual(data.success, false);
        });

        // --- 2. INVALID TOKEN TESTS (Rule: Unauthorized user -> Denied 401) ---
        await test("2.1 Invalid Bearer token returns 401", async () => {
            const res = await fetch(`${baseUrl}/api/user/bundles`, {
                headers: { Authorization: "Bearer fake_garbage_jwt_token_12345" }
            });
            assert.strictEqual(res.status, 401);
            const data = await res.json();
            assert.strictEqual(data.success, false);
            assert.match(data.message, /invalid|expired|authentication/i);
        });

        await test("2.2 Invalid query ?token= returns 401", async () => {
            const res = await fetch(`${baseUrl}/api/user/bundles/bundle_basic_reels_01/file/file123?token=invalid_token`);
            assert.strictEqual(res.status, 401);
            const data = await res.json();
            assert.strictEqual(data.success, false);
        });

        // --- 3. UNENTITLED USER TESTS (Rule: User without entitlement -> Denied 403) ---
        const freeUser = { uid: "unentitled_usr_999", email: "freeuser@example.com" };
        await test("3.1 User without entitlement denied bundle access (403)", async () => {
            const access = await getUserBundle(freeUser, "bundle_basic_reels_01");
            assert.strictEqual(access.ok, false);
            assert.strictEqual(access.status, 403);
            assert.match(access.message, /do not own/i);
        });

        await test("3.2 User without entitlement denied bundle files listing (403)", async () => {
            const access = await getUserBundleFiles(freeUser, "bundle_basic_reels_01");
            assert.strictEqual(access.ok, false);
            assert.strictEqual(access.status, 403);
            assert.match(access.message, /do not own/i);
        });

        // --- 4. CROSS-USER / IDOR TESTS (Rule: User A accessing User B's file -> Denied 403) ---
        const userA = { uid: "user_a_basic_only", email: "userA@reelsbundles.test" };
        const userB = { uid: "user_b_premium_owner", email: "userB@reelsbundles.test" };

        await test("4.1 Setup: Entitle User A with Basic and User B with Premium", async () => {
            await savePayment({
                orderId: "ord_sec_user_a",
                userUid: userA.uid,
                customerEmail: userA.email,
                plan: "basic",
                bundlePlan: "basic",
                amount: 49,
                paymentStatus: "PAID"
            });

            await savePayment({
                orderId: "ord_sec_user_b",
                userUid: userB.uid,
                customerEmail: userB.email,
                plan: "premium",
                bundlePlan: "premium",
                amount: 69,
                paymentStatus: "PAID"
            });

            const payments = loadLocalPayments();
            assert.ok(payments.some(p => p.orderId === "ord_sec_user_a"));
            assert.ok(payments.some(p => p.orderId === "ord_sec_user_b"));
        });

        await test("4.2 IDOR: User A (Basic) attempting to access User B (Premium) bundle is Denied (403)", async () => {
            const access = await getUserBundle(userA, "bundle_premium_pro_02");
            assert.strictEqual(access.ok, false);
            assert.strictEqual(access.status, 403);
            assert.match(access.message, /do not own/i);
        });

        await test("4.3 IDOR: User A (Basic) attempting to list User B (Premium) files is Denied (403)", async () => {
            const access = await getUserBundleFiles(userA, "bundle_premium_pro_02");
            assert.strictEqual(access.ok, false);
            assert.strictEqual(access.status, 403);
            assert.match(access.message, /do not own/i);
        });

        // --- 5. AUTHORIZED USER TESTS (Rule: Authorized user -> Success) ---
        await test("5.1 Authorized User A can access own Basic bundle (200)", async () => {
            const access = await getUserBundle(userA, "bundle_basic_reels_01");
            assert.strictEqual(access.ok, true);
            assert.strictEqual(access.status, 200);
            assert.strictEqual(access.bundle?.plan, "basic");
            assert.strictEqual(access.bundle?.unlocked, true);
        });

        await test("5.2 Authorized User B can access Premium and Basic (Premium includes Basic)", async () => {
            const premiumAccess = await getUserBundle(userB, "bundle_premium_pro_02");
            assert.strictEqual(premiumAccess.ok, true);
            assert.strictEqual(premiumAccess.status, 200);

            const basicAccess = await getUserBundle(userB, "bundle_basic_reels_01");
            assert.strictEqual(basicAccess.ok, true);
            assert.strictEqual(basicAccess.status, 200);
        });

        await test("5.3 Authorized User file listing NEVER exposes raw Google Drive folderLink", async () => {
            const files = await getUserBundleFiles(userA, "bundle_basic_reels_01");
            assert.strictEqual(files.ok, true);
            assert.ok(Array.isArray(files.items));
            assert.ok(files.items.length > 0);

            for (const item of files.items) {
                assert.strictEqual(item.folderLink, undefined, "folderLink must not be present on item");
                assert.strictEqual(String(item.id).includes("https://"), false, "ID must not be a full URL");
                assert.strictEqual(item.type, "file", "Type must be file for secure stream");
            }
        });

        // --- 6. SECURE STREAMING & NO 302 REDIRECT ---
        await test("6.1 streamDriveFile does NOT issue 302 redirect to Google Drive", async () => {
            let capturedStatus = null;
            let redirectedTo = null;
            const mockRes = {
                headersSent: false,
                statusCode: 200,
                headers: {},
                setHeader: function(k, v) { this.headers[k] = v; },
                status: function(code) { capturedStatus = code; return this; },
                redirect: function(code, url) { capturedStatus = code; redirectedTo = url; return this; },
                json: function(obj) { return obj; },
                end: function() {},
                destroy: function() {}
            };

            await streamDriveFile("test_file_fake_id_12345", mockRes);
            assert.notStrictEqual(capturedStatus, 302, "Stream must never issue 302 redirect to Google Drive");
            assert.strictEqual(redirectedTo, null, "Redirect URL must be null (no Drive URL exposed)");
        });

        // --- 7. DOWNLOAD LOGGING ---
        await test("7.1 saveDownloadLog records download event to disk", async () => {
            const logEntry = {
                orderId: "ord_sec_user_a",
                category: "reels",
                plan: "basic",
                bundleId: "bundle_basic_reels_01",
                bundleName: "Viral Instagram Reels Bundle (Basic)",
                customerName: "User A",
                customerEmail: "userA@reelsbundles.test",
                ip: "127.0.0.1",
                userAgent: "NodeTestAgent",
                status: "SUCCESS"
            };

            await saveDownloadLog(logEntry);
            const logs = getLocalDownloadLogs();
            assert.ok(logs.length > 0);
            const found = logs.find(l => l.customerEmail === "userA@reelsbundles.test" && l.bundleId === "bundle_basic_reels_01");
            assert.ok(found, "Download log must be saved and retrievable");
            assert.strictEqual(found.status, "SUCCESS");
            assert.strictEqual(found.plan, "basic");
        });

        // --- 8. PUBLIC BUNDLE SECURITY ---
        await test("8.1 Public bundles list never leaks Google Drive IDs or keys", async () => {
            const publicBundles = await getPublicActiveBundles();
            assert.ok(Array.isArray(publicBundles));
            assert.ok(publicBundles.length > 0);

            for (const b of publicBundles) {
                assert.strictEqual(b.basic, undefined, "Public bundle must not expose basic credentials");
                assert.strictEqual(b.premium, undefined, "Public bundle must not expose premium credentials");
                assert.strictEqual(b.folderId, undefined, "Public bundle must not expose folderId");
                assert.strictEqual(b.fileId, undefined, "Public bundle must not expose fileId");
                assert.strictEqual(b.folderLink, undefined, "Public bundle must not expose folderLink");
            }
        });

    } finally {
        await new Promise(resolve => server.close(resolve));
    }

    console.log("====================================================");
    console.log(`🎯 TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log("====================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runTestSuite().catch(err => {
    console.error("Fatal test error:", err);
    process.exit(1);
});
