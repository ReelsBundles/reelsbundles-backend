import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProductionDataAudit } from "../src/services/user-page-test.service.js";
import { loadLocalBundles } from "../src/services/bundle.service.js";
import { loadReviewsLocal } from "../src/services/review-storage.service.js";
import { getAllCoupons } from "../src/services/coupon-storage.service.js";
import { loadImportantAlerts } from "../src/services/alert-storage.service.js";
import { loadNotifications } from "../src/services/notification-storage.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");

console.log("\n=======================================================");
console.log("🔍 RUNNING PRODUCTION DATA CLEANUP VERIFICATION SUITE");
console.log("=======================================================\n");

let passed = 0;
let failed = 0;

function assertPass(condition, desc) {
    if (condition) {
        console.log(`  ✅ PASS: ${desc}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${desc}`);
        failed++;
    }
}

// 1. Audit scanner: Zero dummy / placeholder strings across all JSON data files
console.log("--- 1. Production Real-Data Audit Scanner ---");
const auditResult = runProductionDataAudit();
assertPass(auditResult.passed === true, "runProductionDataAudit() returns passed === true");
assertPass(auditResult.findingsCount === 0, `Audit findings count is 0 (Actual: ${auditResult.findingsCount})`);
if (auditResult.findings.length > 0) {
    console.error("  Violations found:", auditResult.findings);
}

// 2. Bundles integrity & deduplication
console.log("\n--- 2. Bundles Deduplication & Integrity ---");
const bundles = loadLocalBundles();
assertPass(bundles.length === 4, `Exact 4 unique bundles present (Actual: ${bundles.length})`);
const bundleIds = bundles.map(b => b.id);
const uniqueBundleIds = new Set(bundleIds);
assertPass(uniqueBundleIds.size === bundleIds.length, "All bundle IDs are unique with zero duplicates");

const driveBundles = bundles.filter(b => {
    const plan = String(b.plan || "basic").toLowerCase();
    const pData = b[plan] || {};
    return Boolean(pData.folderLink || pData.folderId || b.folderLink);
});
const megaBundles = bundles.filter(b => {
    const plan = String(b.plan || "basic").toLowerCase();
    const pData = b[plan] || {};
    return Boolean(pData.megaLink || b.megaLink);
});
assertPass(driveBundles.length === 2, `Drive folders count is 2 (Actual: ${driveBundles.length})`);
assertPass(megaBundles.length === 2, `MEGA folders count is 2 (Actual: ${megaBundles.length})`);

// 3. Storage Health Calculation Test
console.log("\n--- 3. Storage Health & Telemetry Calculation ---");
const totalBundles = bundles.length;
const totalLinked = driveBundles.length + megaBundles.length;
const healthPercentage = Math.round((totalLinked / totalBundles) * 100);
assertPass(healthPercentage === 100, `Storage health is accurately calculated at 100% (Actual: ${healthPercentage}%)`);

// 4. Important Alerts Cleanliness
console.log("\n--- 4. Important Alerts Cleanliness ---");
const alerts = loadImportantAlerts();
assertPass(alerts.length === 0, `Important alerts is an empty array [] in clean state (Actual: ${alerts.length})`);
const alertsContent = fs.readFileSync(path.resolve(DATA_DIR, "important_alerts.json"), "utf8");
assertPass(!alertsContent.includes("Crucial System Upgrade Notice"), "No dummy 'Crucial System Upgrade Notice' alert exists in data");

// 5. Notifications Cleanliness
console.log("\n--- 5. Notifications Cleanliness ---");
const notifications = loadNotifications();
assertPass(notifications.length === 0, `Notifications is an empty array [] in clean state (Actual: ${notifications.length})`);

// 6. Preservation of Real Production Records
console.log("\n--- 6. Preservation of Genuine Production Data ---");
const reviews = loadReviewsLocal();
assertPass(reviews.length >= 1, `Real customer review preserved (Count: ${reviews.length})`);
const adminReview = reviews.find(r => r.customerEmail === "admin5796@gmail.com");
assertPass(Boolean(adminReview), "Legitimate customer review from admin5796@gmail.com is intact");

const coupons = getAllCoupons();
assertPass(coupons.length >= 1, `Real coupons preserved (Count: ${coupons.length})`);
const samarthCoupon = coupons.find(c => c.code === "SAMARTH11");
assertPass(Boolean(samarthCoupon), "Legitimate coupon SAMARTH11 is intact");

// 7. Frontend Empty State Verification
console.log("\n--- 7. Frontend Empty States Audit ---");
const adminDemoJs = fs.readFileSync("d:/Project/Frontend/admin/assets/js/admin-demo-videos.js", "utf8");
assertPass(adminDemoJs.includes("No any kind of demo video added yet."), "Admin demo videos has 'No any kind of demo video added yet.' empty state");

const clientDemoJs = fs.readFileSync("d:/Project/Frontend/assets/js/demo.js", "utf8");
assertPass(clientDemoJs.includes("No any kind of demo video"), "Client demo.js has 'No any kind of demo video' empty state");

const storageHtml = fs.readFileSync("d:/Project/Frontend/admin/storage.html", "utf8");
assertPass(!storageHtml.includes("driveCount || bundles.length"), "Storage page does not have fake fallback 'driveCount || bundles.length'");
assertPass(storageHtml.includes("storageHealthText"), "Storage health is dynamic via storageHealthText");

console.log("\n=======================================================");
console.log(`🏁 PRODUCTION DATA CLEANUP SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
console.log("=======================================================\n");

if (failed > 0) {
    process.exit(1);
}
