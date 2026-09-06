import assert from "assert";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { loadReviewsLocal } from "../src/services/review-storage.service.js";

const JWT_SECRET = process.env.JWT_SECRET || "reelsbundles_jwt_secret_dev_2026";
const validAdminToken = jwt.sign(
    { email: "admin@reelsbundles.com", role: "admin", sub: "admin_audit_id" },
    JWT_SECRET,
    { expiresIn: "2h" }
);

async function runProductionAuditTests() {
    console.log("==========================================================");
    console.log("🧪 STARTING PRODUCTION-WIDE REAL DATA & AUDIT VERIFICATION");
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

    let createdReviewId = null;

    try {
        // --- TEST 1: Public Stats Endpoint Real Data ---
        await asyncTest("1.1 GET /api/system/stats returns real counts with zero fake 10000 base count", async () => {
            const res = await fetch(`${baseUrl}/api/system/stats`);
            assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(data.stats, "Stats object missing");
            // Happy customers count should equal real paid orders, NOT baseCount 10000 + paid orders
            assert.strictEqual(typeof data.stats.happyCustomersCount, "number");
            assert.strictEqual(typeof data.stats.totalPaidOrders, "number");
            assert.strictEqual(data.stats.happyCustomersCount, data.stats.totalPaidOrders);
            // Should not have fake 10K+ unless there are 10,000 real paid orders
            if (data.stats.totalPaidOrders < 1000) {
                assert.ok(!data.stats.happyCustomers.includes("10.0K+"), `Found manufactured customer count: ${data.stats.happyCustomers}`);
            }
        });

        // --- TEST 2: Public Reviews Strict Real Data ---
        await asyncTest("2.1 GET /api/reviews returns only real reviews and never contains dummy Aarav Sharma", async () => {
            const res = await fetch(`${baseUrl}/api/reviews`);
            assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(Array.isArray(data.reviews), "reviews must be an array");
            const hasDummy = data.reviews.some(r => (r.customerName || "").includes("Aarav Sharma"));
            assert.strictEqual(hasDummy, false, "Found dummy seed review Aarav Sharma in public reviews!");
        });

        // --- TEST 3: Admin Review Operations ---
        await asyncTest("3.1 GET /api/admin/reviews with admin token returns real reviews and stats", async () => {
            const res = await fetch(`${baseUrl}/api/admin/reviews`, {
                headers: { "Authorization": `Bearer ${validAdminToken}` }
            });
            assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(Array.isArray(data.reviews));
            assert.ok(data.stats);
            assert.strictEqual(typeof data.stats.totalReviews, "number");
        });

        await asyncTest("3.2 POST /api/admin/reviews creates new real customer review", async () => {
            const res = await fetch(`${baseUrl}/api/admin/reviews`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${validAdminToken}`
                },
                body: JSON.stringify({
                    customerName: "Priya Patel",
                    bundlePlan: "premium",
                    rating: 5,
                    qualityRating: "5/5 Ultra HD",
                    supportRating: "10/10 Fast",
                    comment: "Real production audit review test.",
                    approved: true
                })
            });
            assert.ok([200, 201].includes(res.status), `Expected 200 or 201, got ${res.status}`);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(data.review && data.review.id);
            createdReviewId = data.review.id;
        });

        await asyncTest("3.3 PUT /api/admin/reviews/:id toggles approval state cleanly", async () => {
            assert.ok(createdReviewId, "createdReviewId required");
            const res = await fetch(`${baseUrl}/api/admin/reviews/${createdReviewId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${validAdminToken}`
                },
                body: JSON.stringify({ approved: false })
            });
            assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.review.approved, false);
        });

        await asyncTest("3.4 DELETE /api/admin/reviews/:id deletes test review", async () => {
            assert.ok(createdReviewId, "createdReviewId required");
            const res = await fetch(`${baseUrl}/api/admin/reviews/${createdReviewId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${validAdminToken}` }
            });
            assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            createdReviewId = null;
        });

        // --- TEST 4: Admin Orders Resilience ---
        await asyncTest("4.1 GET /api/admin/orders returns orders with local storage fallback without 500", async () => {
            const res = await fetch(`${baseUrl}/api/admin/orders?page=1&limit=10`, {
                headers: { "Authorization": `Bearer ${validAdminToken}` }
            });
            assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(Array.isArray(data.orders), "orders must be an array");
            assert.strictEqual(typeof data.total, "number");
        });

        // --- TEST 5: Admin Dashboard Resilience ---
        await asyncTest("5.1 GET /api/admin/dashboard returns real metrics without 500", async () => {
            const res = await fetch(`${baseUrl}/api/admin/dashboard`, {
                headers: { "Authorization": `Bearer ${validAdminToken}` }
            });
            assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.ok(data.stats, "stats must exist");
            assert.strictEqual(typeof data.stats.revenue, "number");
            assert.strictEqual(typeof data.stats.orders, "number");
            assert.ok(Array.isArray(data.stats.recentOrders));
            assert.ok(Array.isArray(data.stats.recentDownloads));
        });

    } finally {
        if (createdReviewId) {
            try {
                await fetch(`${baseUrl}/api/admin/reviews/${createdReviewId}`, {
                    method: "DELETE",
                    headers: { "Authorization": `Bearer ${validAdminToken}` }
                });
            } catch (e) {}
        }
        server.close();
    }

    console.log("==========================================================");
    console.log(`📊 PRODUCTION AUDIT RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("==========================================================");

    if (failCount > 0) {
        process.exit(1);
    }
}

runProductionAuditTests().catch(err => {
    console.error("Fatal Test Suite Error:", err);
    process.exit(1);
});
