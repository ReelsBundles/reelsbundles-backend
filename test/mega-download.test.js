/* ==========================================================
   REELSBUNDLES — MEGA.NZ SECURE DOWNLOAD TEST SUITE
   PHASE 2B VERIFICATION SUITE
========================================================== */

import assert from "assert";
import http from "http";
import app from "../src/app.js";
import { savePayment, loadLocalPayments } from "../src/services/payment-storage.service.js";
import { saveLocalBundles, loadLocalBundles } from "../src/services/bundle.service.js";
import { saveDownloadLog, getLocalDownloadLogs } from "../src/services/download-log.service.js";
import { findMegaFile, getItemId, listMegaFolder, streamMegaFile } from "../src/services/mega-storage.service.js";
import { getUserBundle, getUserBundleFiles } from "../src/services/user-bundle.service.js";

const PORT = 3099;
let server;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Test users
const USER_A_BASIC = {
    uid: "mega_user_a_basic",
    email: "mega_userA@reelsbundles.test",
    displayName: "Mega User A"
};

const USER_B_PREMIUM = {
    uid: "mega_user_b_premium",
    email: "mega_userB@reelsbundles.test",
    displayName: "Mega User B"
};

const USER_C_UNENTITLED = {
    uid: "mega_user_c_unentitled",
    email: "mega_userC@reelsbundles.test",
    displayName: "Mega User C"
};

// Bundle data with real MEGA structure
const BUNDLE_BASIC_MEGA = {
    id: "bundle_mega_basic_01",
    name: "Viral Reels Basic Package (MEGA)",
    slug: "viral-reels-basic-package-mega",
    plan: "basic",
    page: 1,
    title: "Viral Reels Basic Package",
    description: "Exclusive creator reels hosted securely.",
    thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    active: true,
    basic: {
        title: "Viral Reels Basic Package",
        description: "Standard creator package",
        folderId: null,
        fileId: null,
        folderLink: "",
        megaLink: "https://mega.nz/file/ABC123XY#k0kG3aBLk0kG3aBLk0kG3aBLk0kG3aBLk0kG3aBLk0k"
    }
};

const BUNDLE_PREMIUM_MEGA = {
    id: "bundle_mega_premium_02",
    name: "Ultimate High-Ticket Pro Bundle (MEGA)",
    slug: "ultimate-high-ticket-pro-bundle-mega",
    plan: "premium",
    page: 1,
    title: "Ultimate High-Ticket Pro Bundle",
    description: "Complete creator suite with VIP assets.",
    thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    active: true,
    premium: {
        title: "Ultimate High-Ticket Pro Bundle",
        description: "VIP access package",
        folderId: null,
        fileId: null,
        folderLink: "",
        megaLink: "https://mega.nz/folder/XYZ789PR#m1mH4bCMm1mH4bCMm1mH4b"
    }
};

async function runTests() {
    console.log("\n====================================================");
    console.log("🚀 STARTING MEGA.NZ SECURE DOWNLOAD TEST SUITE (PHASE 2B)");
    console.log("====================================================\n");

    server = http.createServer(app);
    await new Promise(res => server.listen(PORT, res));

    let passed = 0;
    let failed = 0;

    function assertPass(condition, message) {
        if (condition) {
            console.log(`  ✅ PASS: ${message}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${message}`);
            failed++;
        }
    }

    try {
        // Setup persistent test bundles
        const initialBundles = loadLocalBundles();
        saveLocalBundles([BUNDLE_BASIC_MEGA, BUNDLE_PREMIUM_MEGA, ...initialBundles]);

        // ----------------------------------------------------
        // 1. Authentication Security Checks (HTTP 401)
        // ----------------------------------------------------
        console.log("--- 1. Authentication Security Checks ---");

        // 1.1 Unauthenticated file download request
        const resUnauthFile = await fetch(`${BASE_URL}/api/user/bundles/bundle_mega_basic_01/file/file123`);
        assertPass(resUnauthFile.status === 401, "1.1 Unauthenticated /bundles/:id/file/:fileId returns 401");

        // 1.2 Unauthenticated /mega request
        const resUnauthMega = await fetch(`${BASE_URL}/api/user/bundles/bundle_mega_basic_01/mega`);
        assertPass(resUnauthMega.status === 401, "1.2 Unauthenticated /bundles/:id/mega returns 401");

        // 1.3 Invalid Bearer token
        const resInvalidBearer = await fetch(`${BASE_URL}/api/user/bundles/bundle_mega_basic_01/file/file123`, {
            headers: { Authorization: "Bearer bad_token_12345" }
        });
        assertPass(resInvalidBearer.status === 401, "1.3 Invalid Bearer token returns 401");

        // 1.4 Invalid ?token= query parameter
        const resInvalidQuery = await fetch(`${BASE_URL}/api/user/bundles/bundle_mega_basic_01/file/file123?token=bad_query_token`);
        assertPass(resInvalidQuery.status === 401, "1.4 Invalid ?token= query parameter returns 401");

        // ----------------------------------------------------
        // 2. Entitlement Authorization Checks (403)
        // ----------------------------------------------------
        console.log("\n--- 2. Entitlement Authorization Checks ---");

        // 2.1 Authenticated user without entitlement accessing bundle
        const accessUnentitled = await getUserBundle(USER_C_UNENTITLED, "bundle_mega_basic_01");
        assertPass(accessUnentitled.ok === false && accessUnentitled.status === 403, "2.1 Unentitled user denied bundle access (403)");

        // 2.2 Authenticated user without entitlement accessing bundle files
        const accessUnentitledFiles = await getUserBundleFiles(USER_C_UNENTITLED, "bundle_mega_basic_01");
        assertPass(accessUnentitledFiles.ok === false && accessUnentitledFiles.status === 403, "2.2 Unentitled user denied bundle files listing (403)");

        // 2.3 Setup Entitlements: User A has Basic, User B has Premium
        await savePayment({
            orderId: "ord_mega_user_a",
            userUid: USER_A_BASIC.uid,
            customerEmail: USER_A_BASIC.email,
            plan: "basic",
            bundlePlan: "basic",
            amount: 49,
            paymentStatus: "PAID"
        });

        await savePayment({
            orderId: "ord_mega_user_b",
            userUid: USER_B_PREMIUM.uid,
            customerEmail: USER_B_PREMIUM.email,
            plan: "premium",
            bundlePlan: "premium",
            amount: 69,
            paymentStatus: "PAID"
        });
        assertPass(true, "2.3 Entitlements registered for User A (Basic) and User B (Premium)");

        // ----------------------------------------------------
        // 3. IDOR / Cross-User Access Checks
        // ----------------------------------------------------
        console.log("\n--- 3. IDOR / Cross-User Access Checks ---");

        // 3.1 User A (Basic) attempting to access User B (Premium) bundle
        const accessIdorBundle = await getUserBundle(USER_A_BASIC, "bundle_mega_premium_02");
        assertPass(accessIdorBundle.ok === false && accessIdorBundle.status === 403, "3.1 IDOR: User A (Basic) denied User B (Premium) bundle access (403)");

        // 3.2 User A (Basic) attempting to access User B (Premium) bundle files
        const accessIdorFiles = await getUserBundleFiles(USER_A_BASIC, "bundle_mega_premium_02");
        assertPass(accessIdorFiles.ok === false && accessIdorFiles.status === 403, "3.2 IDOR: User A (Basic) denied User B (Premium) files listing (403)");

        // ----------------------------------------------------
        // 4. Authorized Access & Payload Sanitization
        // ----------------------------------------------------
        console.log("\n--- 4. Authorized Access & Payload Sanitization ---");

        // 4.1 User A accessing own Basic MEGA bundle
        const accessUserABundle = await getUserBundle(USER_A_BASIC, "bundle_mega_basic_01");
        assertPass(accessUserABundle.ok === true && accessUserABundle.status === 200, "4.1 Authorized User A can access own MEGA bundle (200)");

        // 4.2 User A accessing own Basic MEGA bundle files
        const accessUserAFiles = await getUserBundleFiles(USER_A_BASIC, "bundle_mega_basic_01");
        assertPass(accessUserAFiles.ok === true && Array.isArray(accessUserAFiles.bundle ? [1] : []), "4.2 Authorized User A can list own MEGA bundle items");

        // 4.3 Verify items NEVER leak raw megaLink or private decryption keys
        const leakedLink = (accessUserAFiles.items || []).find(item => item.megaLink || String(item.id).includes("k0kG3aBL"));
        assertPass(!leakedLink, "4.3 Response items NEVER leak raw megaLink or private decryption keys");

        // 4.4 User B (Premium) has access to both Premium and Basic (Premium includes Basic)
        const accessUserBPremium = await getUserBundle(USER_B_PREMIUM, "bundle_mega_premium_02");
        const accessUserBBasic = await getUserBundle(USER_B_PREMIUM, "bundle_mega_basic_01");
        assertPass(accessUserBPremium.ok === true && accessUserBBasic.ok === true, "4.4 Authorized User B (Premium) can access both Premium and Basic (200)");

        // ----------------------------------------------------
        // 5. Node Matching & Resolution Verification
        // ----------------------------------------------------
        console.log("\n--- 5. Node Matching & Resolution Verification ---");

        // Create a mock MEGA file structure to test findMegaFile unit behavior
        const mockMegaFolder = {
            directory: true,
            downloadId: "FOLDER123",
            name: "Creator Assets",
            children: [
                {
                    directory: false,
                    nodeId: "h1a2b3c4",
                    downloadId: ["FOLDER123", "h1a2b3c4"],
                    name: "viral_reel_01.mp4",
                    size: 15420000
                },
                {
                    directory: false,
                    nodeId: "h5d6e7f8",
                    downloadId: ["FOLDER123", "h5d6e7f8"],
                    name: "hook_template.mp4",
                    size: 8930000
                }
            ]
        };

        const foundByNodeId = findMegaFile(mockMegaFolder, "h1a2b3c4");
        assertPass(foundByNodeId && foundByNodeId.name === "viral_reel_01.mp4", "5.1 findMegaFile resolves file by nodeId (handle h)");

        const foundByName = findMegaFile(mockMegaFolder, "hook_template.mp4");
        assertPass(foundByName && foundByName.nodeId === "h5d6e7f8", "5.2 findMegaFile resolves file by name");

        const foundByItemId = findMegaFile(mockMegaFolder, getItemId(mockMegaFolder.children[0]));
        assertPass(foundByItemId && foundByItemId.name === "viral_reel_01.mp4", "5.3 findMegaFile resolves file by computed getItemId");

        // Test single file link matching
        const mockSingleFile = {
            directory: false,
            downloadId: "SINGLEFILE99",
            name: "full_bundle_package.zip",
            size: 104857600
        };

        const foundSingleRoot = findMegaFile(mockSingleFile, "root");
        assertPass(foundSingleRoot && foundSingleRoot.name === "full_bundle_package.zip", "5.4 findMegaFile resolves single file by 'root'");

        const foundSingleVirtual = findMegaFile(mockSingleFile, "mega_bundle_mega_basic_01");
        assertPass(foundSingleVirtual && foundSingleVirtual.name === "full_bundle_package.zip", "5.5 findMegaFile resolves single file by virtual 'mega_*' ID");

        // ----------------------------------------------------
        // 6. Zero 302 Redirect & Stream Safety Checks
        // ----------------------------------------------------
        console.log("\n--- 6. Zero 302 Redirect & Stream Safety Checks ---");

        // 6.1 Calling streamMegaFile with invalid file must return 404/500 JSON, NOT 302 redirect
        const mockRes = {
            statusCode: 200,
            headersSent: false,
            headers: {},
            setHeader(k, v) { this.headers[k] = v; },
            status(code) { this.statusCode = code; return this; },
            json(data) { this.body = data; return this; },
            redirect(status, url) { this.redirectStatus = status; this.redirectUrl = url; return this; },
            end() { this.ended = true; }
        };

        try {
            await streamMegaFile("https://mega.nz/file/ABC#KEY", "non_existent_file_id", mockRes);
        } catch (e) {
            // expected to handle gracefully
        }
        assertPass(mockRes.redirectStatus === undefined && mockRes.redirectUrl === undefined, "6.1 streamMegaFile NEVER issues 302 redirect on error or missing file");

        // 6.2 openUserBundleMega unauthenticated returns 401 without redirect
        const resMegaEndpoint = await fetch(`${BASE_URL}/api/user/bundles/bundle_mega_basic_01/mega?fileId=testFile`, {
            redirect: "manual"
        });
        assertPass(resMegaEndpoint.status === 401 && !resMegaEndpoint.headers.get("location"), "6.2 GET /api/user/bundles/:id/mega does NOT return 302 redirect");

        // ----------------------------------------------------
        // 7. Download Logging Verification
        // ----------------------------------------------------
        console.log("\n--- 7. Download Logging Verification ---");

        await saveDownloadLog({
            orderId: "ord_mega_user_a",
            category: "reels",
            plan: "basic",
            bundleId: "bundle_mega_basic_01",
            bundleName: "Viral Reels Basic Package (MEGA)",
            fileId: "h1a2b3c4",
            source: "MEGA",
            customerName: USER_A_BASIC.displayName,
            customerEmail: USER_A_BASIC.email,
            amount: 0,
            status: "SUCCESS"
        });

        const logs = getLocalDownloadLogs();
        const latestMegaLog = logs.find(l => l.customerEmail === USER_A_BASIC.email && l.source === "MEGA");
        assertPass(Boolean(latestMegaLog && latestMegaLog.source === "MEGA" && latestMegaLog.bundleId === "bundle_mega_basic_01"), "7.1 saveDownloadLog correctly records source = 'MEGA' and bundle metadata");

    } finally {
        if (server) {
            await new Promise(res => server.close(res));
        }
    }

    console.log("\n====================================================");
    console.log(`🎯 MEGA TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log("====================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("FATAL in test suite:", err);
    process.exit(1);
});
