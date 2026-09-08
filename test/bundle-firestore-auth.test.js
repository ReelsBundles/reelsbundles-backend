import assert from "node:assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import {
    isFirestoreAvailable,
    markFirestoreFailure,
    markFirestoreSuccess
} from "../src/config/firebase.js";
import {
    loadLocalBundles,
    saveLocalBundles
} from "../src/services/bundle.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUNDLES_FILE = path.resolve(__dirname, "../data/bundles.json");

const JWT_SECRET = process.env.JWT_SECRET || "reelsbundles_jwt_secret_dev_2026";
const adminToken = jwt.sign(
    { email: "admin@reelsbundles.com", role: "admin", sub: "admin_test_id" },
    JWT_SECRET,
    { expiresIn: "1h" }
);

async function runBundleFirestoreAuthTests() {
    console.log("==================================================================");
    console.log("🧪 RUNNING BUNDLE MANAGER & FIRESTORE AUTHENTICATION TEST SUITE");
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

    const origBundles = fs.existsSync(BUNDLES_FILE) ? fs.readFileSync(BUNDLES_FILE, "utf8") : "[]";

    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        // -------------------------------------------------------------
        // PART 1: FIREBASE CREDENTIAL RESOLUTION & CIRCUIT BREAKER
        // -------------------------------------------------------------
        await test("1.1 Circuit Breaker: Reports available or degraded gracefully without crashing", async () => {
            const avail = isFirestoreAvailable();
            assert.strictEqual(typeof avail, "boolean");
        });

        await test("1.2 Circuit Breaker: Marks auth failure and recovers on success", async () => {
            markFirestoreFailure(new Error("16 UNAUTHENTICATED: Request had invalid authentication credentials."));
            assert.strictEqual(isFirestoreAvailable(), false);

            markFirestoreSuccess();
            assert.strictEqual(isFirestoreAvailable(), true);
        });

        // -------------------------------------------------------------
        // PART 2: ADMIN AUTHENTICATION SECURITY ON BUNDLE ROUTES
        // -------------------------------------------------------------
        await test("2.1 Admin Auth: Unauthorized visitor cannot list bundles (401)", async () => {
            const res = await fetch(`${baseUrl}/api/admin/bundles`);
            assert.strictEqual(res.status, 401);
        });

        await test("2.2 Admin Auth: Unauthorized visitor cannot create bundles (401)", async () => {
            const res = await fetch(`${baseUrl}/api/admin/bundles`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Hacked Bundle" })
            });
            assert.strictEqual(res.status, 401);
        });

        await test("2.3 Admin Auth: Unauthorized visitor cannot delete bundles (401)", async () => {
            const res = await fetch(`${baseUrl}/api/admin/bundles/some_id`, { method: "DELETE" });
            assert.strictEqual(res.status, 401);
        });

        // -------------------------------------------------------------
        // PART 3: ADMIN BUNDLE CRUD & STATS ENDPOINTS
        // -------------------------------------------------------------
        let testBundleId = null;

        await test("3.1 Admin Bundles: GET /api/admin/bundles returns valid bundle collection", async () => {
            const res = await fetch(`${baseUrl}/api/admin/bundles`, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(Array.isArray(data.bundles));
        });

        await test("3.2 Admin Bundles: GET /api/admin/bundles/stats returns counts without gRPC crash", async () => {
            const res = await fetch(`${baseUrl}/api/admin/bundles/stats`, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(typeof data.stats.total === "number");
            assert.ok(typeof data.stats.active === "number");
        });

        await test("3.3 Admin Bundles: POST /api/admin/bundles creates new bundle with persistence", async () => {
            const res = await fetch(`${baseUrl}/api/admin/bundles`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    name: "Automated Test Reels Suite",
                    plan: "basic",
                    page: 1,
                    thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
                    title: "Automated Test Reels Suite",
                    basic: {
                        title: "Automated Test Reels Suite",
                        folderLink: "https://drive.google.com/drive/folders/1A2B3C4D5E6F7G8H9I0J"
                    }
                })
            });
            assert.strictEqual(res.status, 201);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(data.bundle.id);
            testBundleId = data.bundle.id;

            // Verify persistence
            const listRes = await fetch(`${baseUrl}/api/admin/bundles`, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            const listData = await listRes.json();
            assert.ok(listData.bundles.some(b => b.id === testBundleId));
        });

        await test("3.4 Admin Bundles: PUT /api/admin/bundles/:id updates bundle metadata", async () => {
            assert.ok(testBundleId);
            const res = await fetch(`${baseUrl}/api/admin/bundles/${testBundleId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    name: "Automated Test Reels Suite Updated",
                    plan: "basic",
                    page: 2,
                    thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
                    title: "Automated Test Reels Suite Updated",
                    basic: {
                        title: "Automated Test Reels Suite Updated",
                        folderLink: "https://drive.google.com/drive/folders/1A2B3C4D5E6F7G8H9I0J"
                    }
                })
            });
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.bundle.name, "Automated Test Reels Suite Updated");
        });

        await test("3.5 Admin Bundles: PATCH /api/admin/bundles/:id/toggle toggles active state", async () => {
            assert.ok(testBundleId);
            const res = await fetch(`${baseUrl}/api/admin/bundles/${testBundleId}/toggle`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.strictEqual(typeof data.active, "boolean");
        });

        await test("3.6 Admin Bundles: GET /api/admin/bundles/search searches keyword accurately", async () => {
            const res = await fetch(`${baseUrl}/api/admin/bundles/search?q=Updated`, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(data.bundles.some(b => b.id === testBundleId));
        });

        await test("3.7 Admin Bundles: DELETE /api/admin/bundles/:id removes test bundle", async () => {
            assert.ok(testBundleId);
            const res = await fetch(`${baseUrl}/api/admin/bundles/${testBundleId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);

            // Verify removed
            const checkRes = await fetch(`${baseUrl}/api/admin/bundles/${testBundleId}`, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            assert.strictEqual(checkRes.status, 404);
        });

        await test("3.8 Admin Bundles: DELETE /api/admin/bundles/all executes without 500 or 16 UNAUTHENTICATED", async () => {
            const res = await fetch(`${baseUrl}/api/admin/bundles/all`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(typeof data.deletedCount === "number");
        });

        // -------------------------------------------------------------
        // PART 4: REAL PRODUCTION DATA INTEGRITY & ZERO FAKE BUNDLES
        // -------------------------------------------------------------
        await test("4.1 Data Integrity: Empty state returns empty collection (no fake/mock bundles injected)", async () => {
            saveLocalBundles([]);
            const res = await fetch(`${baseUrl}/api/admin/bundles`, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.deepStrictEqual(data.bundles, []);
        });

    } finally {
        fs.writeFileSync(BUNDLES_FILE, origBundles, "utf8");
        server.close();
    }

    console.log("==================================================================");
    console.log(`📊 RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("==================================================================");

    if (failCount > 0) {
        process.exit(1);
    }
}

runBundleFirestoreAuthTests().catch((err) => {
    console.error("Test Suite Failed with Exception:", err);
    process.exit(1);
});
