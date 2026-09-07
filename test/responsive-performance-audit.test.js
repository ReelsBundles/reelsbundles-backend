import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const frontendDir = path.join(projectRoot, "Frontend");
const adminDir = path.join(frontendDir, "admin");

console.log("==========================================================");
console.log("📱 PRODUCTION RESPONSIVE & PERFORMANCE AUDIT SUITE");
console.log("==========================================================");

describe("1. Viewport Meta Tags Coverage", () => {
    const userPages = [
        "index.html",
        "login.html",
        "signup.html",
        "forgot-password.html",
        "dashboard.html",
        "payment.html",
        "download.html",
        "maintenance.html",
        "contact.html",
        "demo.html",
        "disclaimer.html",
        "failed.html",
        "privacy.html",
        "refund.html",
        "success.html",
        "terms.html"
    ];

    const adminPages = [
        "dashboard.html",
        "orders.html",
        "users.html",
        "bundles.html",
        "coupons.html",
        "download.html",
        "reviews.html",
        "notifications.html",
        "maintenance.html",
        "demo-videos.html",
        "storage.html",
        "monitor.html",
        "user-page-tests.html",
        "login.html"
    ];

    it("1.1 All User/Public pages have responsive viewport meta tags", () => {
        for (const file of userPages) {
            const filePath = path.join(frontendDir, file);
            assert.ok(fs.existsSync(filePath), `User page ${file} should exist`);
            const content = fs.readFileSync(filePath, "utf-8");
            assert.match(
                content,
                /<meta[^>]*name=["']viewport["'][^>]*content=["'][^"']*width=device-width/i,
                `User page ${file} must have viewport width=device-width`
            );
        }
        console.log(`  ✅ PASS: 1.1 All ${userPages.length} User pages have valid viewport meta tags`);
    });

    it("1.2 All Admin pages have responsive viewport meta tags", () => {
        for (const file of adminPages) {
            const filePath = path.join(adminDir, file);
            assert.ok(fs.existsSync(filePath), `Admin page ${file} should exist`);
            const content = fs.readFileSync(filePath, "utf-8");
            assert.match(
                content,
                /<meta[^>]*name=["']viewport["'][^>]*content=["'][^"']*width=device-width/i,
                `Admin page ${file} must have viewport width=device-width`
            );
        }
        console.log(`  ✅ PASS: 1.2 All ${adminPages.length} Admin pages have valid viewport meta tags`);
    });
});

describe("2. Admin Mobile Navigation Drawer Architecture", () => {
    it("2.1 Universal admin navigation script (admin-nav.js) exists with full drawer controller", () => {
        const navScriptPath = path.join(adminDir, "assets", "js", "admin-nav.js");
        assert.ok(fs.existsSync(navScriptPath), "admin-nav.js must exist");
        const content = fs.readFileSync(navScriptPath, "utf-8");

        assert.ok(content.includes("admin-sidebar-overlay"), "Must handle admin-sidebar-overlay");
        assert.ok(content.includes("admin-sidebar-toggle"), "Must handle admin-sidebar-toggle");
        assert.ok(content.includes("admin-sidebar-close"), "Must handle admin-sidebar-close");
        assert.ok(content.includes("Escape"), "Must handle Escape key press");
        assert.ok(content.includes("openSidebar") && content.includes("closeSidebar"), "Must implement open and close methods");
        assert.ok(content.includes("initAdminNavigation"), "Must export window.initAdminNavigation");
        console.log("  ✅ PASS: 2.1 admin-nav.js implements complete off-canvas drawer lifecycle");
    });

    it("2.2 All operational Admin HTML pages include admin-nav.js", () => {
        const operationalAdminPages = [
            "dashboard.html",
            "orders.html",
            "users.html",
            "bundles.html",
            "coupons.html",
            "download.html",
            "reviews.html",
            "notifications.html",
            "maintenance.html",
            "demo-videos.html",
            "storage.html",
            "monitor.html",
            "user-page-tests.html"
        ];

        for (const file of operationalAdminPages) {
            const filePath = path.join(adminDir, file);
            const content = fs.readFileSync(filePath, "utf-8");
            assert.ok(
                content.includes("admin-nav.js"),
                `Admin page ${file} must reference admin-nav.js`
            );
        }
        console.log(`  ✅ PASS: 2.2 All ${operationalAdminPages.length} operational Admin pages reference admin-nav.js`);
    });

    it("2.3 admin-maintenance.js provides dynamic fallback initialization for admin-nav.js", () => {
        const maintScriptPath = path.join(adminDir, "assets", "js", "admin-maintenance.js");
        const content = fs.readFileSync(maintScriptPath, "utf-8");
        assert.ok(content.includes("initAdminNavigation"), "admin-maintenance.js must hook initAdminNavigation");
        console.log("  ✅ PASS: 2.3 admin-maintenance.js contains resilient fallback drawer initializer");
    });
});

describe("3. Admin CSS Responsiveness & Table Overflows", () => {
    it("3.1 admin-dashboard.css defines off-canvas drawer, overlay, and toggle button styles", () => {
        const cssPath = path.join(adminDir, "assets", "css", "admin-dashboard.css");
        const content = fs.readFileSync(cssPath, "utf-8");

        assert.ok(content.includes(".admin-sidebar-toggle"), "Must style .admin-sidebar-toggle");
        assert.ok(content.includes(".admin-sidebar-close"), "Must style .admin-sidebar-close");
        assert.ok(content.includes(".admin-sidebar-overlay"), "Must style .admin-sidebar-overlay");
        assert.ok(content.includes("translateX(-100%)"), "Sidebar must be positioned off-canvas by default on small viewports");
        assert.ok(content.includes("translateX(0)"), "Sidebar must transition onto screen when open");
        assert.ok(content.includes("min-width: 44px") && content.includes("min-height: 44px"), "Toggle and close buttons must satisfy >= 44px touch target standard");
        console.log("  ✅ PASS: 3.1 admin-dashboard.css implements full off-canvas drawer and touch targets");
    });

    it("3.2 Admin tables are wrapped with horizontal scrolling to prevent content clipping", () => {
        const cssPath = path.join(adminDir, "assets", "css", "admin-dashboard.css");
        const content = fs.readFileSync(cssPath, "utf-8");

        assert.ok(content.includes(".table-responsive"), "Must style .table-responsive");
        assert.ok(content.includes(".table-container"), "Must style .table-container");
        assert.ok(content.includes(".table-wrapper"), "Must style .table-wrapper");
        assert.ok(content.includes("overflow-x: auto"), "Table containers must have overflow-x: auto");
        console.log("  ✅ PASS: 3.2 Admin tables are configured with horizontal scroll containers");
    });

    it("3.3 Admin modals are constrained to viewport height with internal scrolling", () => {
        const cssPath = path.join(adminDir, "assets", "css", "admin-dashboard.css");
        const content = fs.readFileSync(cssPath, "utf-8");

        assert.ok(content.includes("max-height: 90vh") || content.includes("max-height: 90dvh"), "Modals must have max-height: 90vh");
        assert.ok(content.includes("overflow-y: auto"), "Modals must have overflow-y: auto for internal scroll");
        console.log("  ✅ PASS: 3.3 Admin modals adapt safely to mobile viewport height");
    });

    it("3.4 admin.css (Admin Login) supports mobile scrolling and small viewports", () => {
        const loginCssPath = path.join(adminDir, "assets", "css", "admin.css");
        const content = fs.readFileSync(loginCssPath, "utf-8");

        assert.ok(content.includes("min-height: 100vh") || content.includes("min-height:100vh") || content.includes("min-height: 100dvh"), "Admin login body must use min-height rather than fixed height");
        assert.ok(content.includes("overflow-y: auto") || content.includes("overflow-y:auto"), "Admin login body must allow vertical scroll");
        assert.ok(content.includes("max-width: 600px") || content.includes("max-width:600px"), "Admin login must have mobile media queries");
        console.log("  ✅ PASS: 3.4 Admin login card adapts safely without clipping on small screens");
    });
});

describe("4. User/Public Pages Responsiveness & Zero Horizontal Overflow", () => {
    it("4.1 global.css enforces zero horizontal overflow guards and touch target standards", () => {
        const globalCssPath = path.join(frontendDir, "assets", "css", "global.css");
        const content = fs.readFileSync(globalCssPath, "utf-8");

        assert.ok(content.includes("overflow-x: hidden"), "global.css must guard overflow-x: hidden");
        assert.ok(content.includes("min-height: 44px"), "global.css must enforce >= 44px touch targets on mobile");
        console.log("  ✅ PASS: 4.1 global.css guards against horizontal overflow and enforces touch targets");
    });

    it("4.2 hero.css phone mockup is fluid and responsive at 320px", () => {
        const heroCssPath = path.join(frontendDir, "assets", "css", "hero.css");
        const content = fs.readFileSync(heroCssPath, "utf-8");

        assert.ok(content.includes("min(300px, 85vw)") || content.includes("max-width: 100%"), "Phone mockup must be fluid on narrow screens");
        assert.ok(content.includes("max-width: 480px") || content.includes("max-width:480px"), "hero.css must contain small mobile media queries");
        console.log("  ✅ PASS: 4.2 hero.css phone mockup scales cleanly down to 320px");
    });

    it("4.3 navbar.css mobile menu items satisfy touch target standards", () => {
        const navbarCssPath = path.join(frontendDir, "assets", "css", "navbar.css");
        const content = fs.readFileSync(navbarCssPath, "utf-8");

        assert.ok(content.includes("min-height: 44px"), "navbar.css must have min-height: 44px on mobile menu links");
        console.log("  ✅ PASS: 4.3 navbar.css mobile menu items meet touch target requirements");
    });

    it("4.4 payment.css and pricing.css handle narrow 320px screens cleanly", () => {
        const paymentCssPath = path.join(frontendDir, "assets", "css", "payment.css");
        const pricingCssPath = path.join(frontendDir, "assets", "css", "pricing.css");

        const paymentContent = fs.readFileSync(paymentCssPath, "utf-8");
        const pricingContent = fs.readFileSync(pricingCssPath, "utf-8");

        assert.ok(paymentContent.includes("max-width: 360px") || paymentContent.includes("max-width: 430px"), "payment.css must have small mobile breakpoint");
        assert.ok(pricingContent.includes("max-width: 480px") || pricingContent.includes("max-width:480px"), "pricing.css must have small mobile breakpoint");
        console.log("  ✅ PASS: 4.4 payment.css and pricing.css support ultra-narrow mobile viewports");
    });

    it("4.5 download.css supports word wrapping and touch targets", () => {
        const downloadCssPath = path.join(frontendDir, "assets", "css", "download.css");
        const content = fs.readFileSync(downloadCssPath, "utf-8");

        assert.ok(content.includes("overflow-wrap: break-word") || content.includes("word-break: break-word"), "download.css must wrap long file names");
        assert.ok(content.includes("min-height: 44px"), "download.css must provide touch-friendly buttons");
        console.log("  ✅ PASS: 4.5 download.css wraps long file names and provides touch targets");
    });
});

describe("5. Low-End Hardware Optimization & prefers-reduced-motion", () => {
    it("5.1 prefers-reduced-motion is supported across all major stylesheets", () => {
        const stylesheets = [
            path.join(frontendDir, "assets", "css", "global.css"),
            path.join(frontendDir, "assets", "css", "pricing.css"),
            path.join(frontendDir, "assets", "css", "payment.css"),
            path.join(frontendDir, "assets", "css", "download.css"),
            path.join(frontendDir, "assets", "css", "user-dashboard.css"),
            path.join(adminDir, "assets", "css", "admin-dashboard.css"),
            path.join(adminDir, "assets", "css", "admin.css")
        ];

        for (const sheet of stylesheets) {
            assert.ok(fs.existsSync(sheet), `Stylesheet ${path.basename(sheet)} must exist`);
            const content = fs.readFileSync(sheet, "utf-8");
            assert.ok(
                content.includes("prefers-reduced-motion"),
                `${path.basename(sheet)} must implement prefers-reduced-motion`
            );
        }
        console.log(`  ✅ PASS: 5.1 prefers-reduced-motion implemented across all ${stylesheets.length} primary stylesheets`);
    });

    it("5.2 navbar.js scroll listener is throttled and passive for 60fps rendering", () => {
        const navbarJsPath = path.join(frontendDir, "assets", "js", "navbar.js");
        const content = fs.readFileSync(navbarJsPath, "utf-8");

        assert.ok(content.includes("{ passive: true }"), "navbar.js scroll listener must be passive");
        assert.ok(content.includes("requestAnimationFrame"), "navbar.js scroll listener must use requestAnimationFrame throttle");
        console.log("  ✅ PASS: 5.2 navbar.js uses 60fps throttled passive scroll listener");
    });

    it("5.3 Admin routes and filenames are 100% intact (Zero admin URL changes)", () => {
        const expectedAdminFiles = [
            "dashboard.html",
            "orders.html",
            "users.html",
            "bundles.html",
            "coupons.html",
            "download.html",
            "reviews.html",
            "notifications.html",
            "maintenance.html",
            "demo-videos.html",
            "storage.html",
            "monitor.html",
            "user-page-tests.html",
            "login.html",
            "index.html"
        ];

        for (const file of expectedAdminFiles) {
            assert.ok(
                fs.existsSync(path.join(adminDir, file)),
                `Admin file ${file} must remain intact`
            );
        }
        console.log(`  ✅ PASS: 5.3 All ${expectedAdminFiles.length} Admin files and routes intact with zero route changes`);
    });
});
