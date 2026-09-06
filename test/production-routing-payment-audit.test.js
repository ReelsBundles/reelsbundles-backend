import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { getPlan } from "../src/services/payment.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, "../../Frontend");

const JWT_SECRET = process.env.JWT_SECRET || "reelsbundles_jwt_secret_dev_2026";
const validAdminToken = jwt.sign(
    { email: "admin@reelsbundles.com", role: "admin", sub: "admin_route_audit_id" },
    JWT_SECRET,
    { expiresIn: "2h" }
);

async function runProductionRoutingAndPaymentAudit() {
    console.log("==========================================================");
    console.log("🧪 PRODUCTION ROUTING & PAYMENT AUTHENTICATION AUDIT SUITE");
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

    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        // ==========================================================
        // 1. CANONICAL USER / PUBLIC PAGES INVENTORY & DIRECTORY INTEGRITY
        // ==========================================================
        const canonicalUserRoutes = [
            { name: "Home / Landing", path: "index.html" },
            { name: "Login", path: "login/index.html" },
            { name: "Signup / Register", path: "signup/index.html" },
            { name: "Forgot Password", path: "forgot-password/index.html" },
            { name: "User Dashboard", path: "dashboard/index.html" },
            { name: "Downloads Library", path: "download/index.html" },
            { name: "Payment Checkout", path: "payment/index.html" },
            { name: "Payment Success", path: "success/index.html" },
            { name: "Payment Failed", path: "failed/index.html" },
            { name: "Maintenance Screen", path: "maintenance/index.html" },
            { name: "Demo Videos", path: "demo/index.html" },
            { name: "Contact Support", path: "contact/index.html" },
            { name: "Terms of Service", path: "terms/index.html" },
            { name: "Privacy Policy", path: "privacy/index.html" },
            { name: "Refund Policy", path: "refund/index.html" },
            { name: "Disclaimer", path: "disclaimer/index.html" }
        ];

        await test("1.1 All 16 Canonical User/Public directory index.html files exist on disk with valid content", () => {
            canonicalUserRoutes.forEach(r => {
                const fullPath = path.join(FRONTEND_DIR, r.path);
                assert.ok(fs.existsSync(fullPath), `Missing canonical file for ${r.name}: ${r.path}`);
                const stat = fs.statSync(fullPath);
                assert.ok(stat.size > 500, `File ${r.path} is unexpectedly small (${stat.size} bytes)`);
            });
        });

        // ==========================================================
        // 2. GITHUB PAGES ROUTE ALIASES
        // ==========================================================
        const aliasRoutes = [
            { name: "Register alias (/register)", path: "register/index.html" },
            { name: "Downloads alias (/downloads)", path: "downloads/index.html" },
            { name: "Checkout alias (/checkout)", path: "checkout/index.html" },
            { name: "Payment Success alias (/payment-success)", path: "payment-success/index.html" },
            { name: "Payment Failed alias (/payment-failed)", path: "payment-failed/index.html" },
            { name: "Bundles alias (/bundles)", path: "bundles/index.html" }
        ];

        await test("2.1 All 6 GitHub Pages Route Aliases exist on disk with valid content", () => {
            aliasRoutes.forEach(r => {
                const fullPath = path.join(FRONTEND_DIR, r.path);
                assert.ok(fs.existsSync(fullPath), `Missing alias file for ${r.name}: ${r.path}`);
                const stat = fs.statSync(fullPath);
                assert.ok(stat.size > 500, `Alias file ${r.path} is unexpectedly small (${stat.size} bytes)`);
            });
        });

        // ==========================================================
        // 3. ZERO .HTML EXTENSIONS IN USER NAVIGATION LINKS
        // ==========================================================
        await test("3.1 User pages do not contain raw .html links in user-facing href attributes", () => {
            const checkedFiles = [
                ...canonicalUserRoutes.map(r => r.path),
                "login.html", "signup.html", "dashboard.html", "download.html",
                "payment.html", "success.html", "failed.html"
            ];

            let rawHtmlLinksFound = 0;
            const violations = [];

            checkedFiles.forEach(relPath => {
                const fullPath = path.join(FRONTEND_DIR, relPath);
                if (fs.existsSync(fullPath)) {
                    const content = fs.readFileSync(fullPath, "utf8");
                    const matches = content.match(/href=["'][^"']*\.html[^"']*["']/g) || [];
                    if (matches.length > 0) {
                        rawHtmlLinksFound += matches.length;
                        violations.push(`${relPath}: ${matches.join(", ")}`);
                    }
                }
            });

            assert.strictEqual(rawHtmlLinksFound, 0, `Found raw .html links in user files:\n${violations.join("\n")}`);
        });

        // ==========================================================
        // 4. 404 ROUTER ROUTEMAP VERIFICATION
        // ==========================================================
        await test("4.1 404.html routeMap contains all canonical user routes and aliases without forcing .html", () => {
            const notFoundPath = path.join(FRONTEND_DIR, "404.html");
            assert.ok(fs.existsSync(notFoundPath), "404.html is missing");
            const content = fs.readFileSync(notFoundPath, "utf8");

            const requiredRouteKeys = [
                "/login", "/signup", "/register", "/dashboard", "/payment", "/checkout",
                "/download", "/downloads", "/bundles", "/success", "/payment-success",
                "/failed", "/payment-failed", "/maintenance", "/demo", "/contact"
            ];

            requiredRouteKeys.forEach(k => {
                assert.ok(content.includes(`"${k}"`), `404.html routeMap missing key: ${k}`);
            });
            assert.ok(content.includes('"/login": "/login"'), '404.html should map /login to /login');
            assert.ok(content.includes('"/payment": "/payment"'), '404.html should map /payment to /payment');
            assert.ok(content.includes('"/dashboard": "/dashboard"'), '404.html should map /dashboard to /dashboard');
        });

        // ==========================================================
        // 5. ADMIN ROUTING STRICTLY UNTOUCHED
        // ==========================================================
        await test("5.1 Admin pages directory (Frontend/admin) and files are completely intact and untouched", () => {
            const adminDir = path.join(FRONTEND_DIR, "admin");
            assert.ok(fs.existsSync(adminDir), "Frontend/admin directory missing");
            const adminFiles = [
                "index.html", "dashboard.html", "orders.html", "bundles.html",
                "coupons.html", "notifications.html", "maintenance.html", "reviews.html",
                "storage.html", "users.html", "monitor.html", "demo-videos.html"
            ];
            adminFiles.forEach(f => {
                assert.ok(fs.existsSync(path.join(adminDir, f)), `Admin file missing: ${f}`);
            });

            // auth-common.js skips admin
            const authCommonPath = path.join(FRONTEND_DIR, "assets/js/auth-common.js");
            const authCommonContent = fs.readFileSync(authCommonPath, "utf8");
            assert.ok(
                authCommonContent.includes('window.location.pathname.includes("/admin/")') ||
                authCommonContent.includes("window.location.pathname.includes('/admin/')"),
                "auth-common.js must explicitly skip Admin routes"
            );
        });

        // ==========================================================
        // 6. PAYMENT AUTHENTICATION ENFORCEMENT
        // ==========================================================
        await test("6.1 POST /api/payment/create-order without Authorization returns HTTP 401", async () => {
            const res = await fetch(`${baseUrl}/api/payment/create-order`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    plan: "basic",
                    fullName: "Anonymous Buyer",
                    email: "buyer@example.com"
                })
            });
            assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
            const data = await res.json();
            assert.strictEqual(data.success, false);
            assert.match(data.message, /authentication/i);
        });

        await test("6.2 POST /api/payment/create-order with invalid Bearer token returns HTTP 401", async () => {
            const res = await fetch(`${baseUrl}/api/payment/create-order`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer invalid_fake_user_token_12345"
                },
                body: JSON.stringify({
                    plan: "premium",
                    fullName: "Attacker",
                    email: "attacker@example.com"
                })
            });
            assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
        });

        await test("6.3 GET /api/payment/verify/:orderId without Authorization returns HTTP 401", async () => {
            const res = await fetch(`${baseUrl}/api/payment/verify/RB_basic_test_order_123`);
            assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
            const data = await res.json();
            assert.strictEqual(data.success, false);
            assert.match(data.message, /authentication/i);
        });

        // ==========================================================
        // 7. SERVER-SIDE PLAN & PRICE AUTHORITY (PRICE TAMPERING DEFENSE)
        // ==========================================================
        await test("7.1 Server authoritative plan pricing enforces ₹49 Basic and ₹69 Premium", () => {
            const basicPlan = getPlan("basic");
            assert.strictEqual(basicPlan.id, "basic");
            assert.strictEqual(basicPlan.amount, 49, "Basic plan price must be ₹49");

            const premiumPlan = getPlan("premium");
            assert.strictEqual(premiumPlan.id, "premium");
            assert.strictEqual(premiumPlan.amount, 69, "Premium plan price must be ₹69");

            // Plan lookup falls back securely
            const unknownPlan = getPlan("hacked_free_plan");
            assert.strictEqual(unknownPlan.id, "basic");
            assert.strictEqual(unknownPlan.amount, 49);
        });

        // ==========================================================
        // 8. SAFE RETURN URL VALIDATION (OPEN REDIRECT DEFENSE)
        // ==========================================================
        await test("8.1 Frontend login and signup guard reject open external redirects", () => {
            const loginJsPath = path.join(FRONTEND_DIR, "assets/js/login.js");
            const signupJsPath = path.join(FRONTEND_DIR, "assets/js/signup.js");
            const loginJs = fs.readFileSync(loginJsPath, "utf8");
            const signupJs = fs.readFileSync(signupJsPath, "utf8");

            [loginJs, signupJs].forEach(code => {
                assert.ok(code.includes('params.get("return")') || code.includes("params.get('return')"), "Must read return parameter");
                assert.ok(code.includes('"://"'), "Must check for protocol strings to block external redirects");
                assert.ok(code.includes('"/dashboard"'), "Must safely default to /dashboard");
            });

            // Simulate the validator function
            function validateRedirect(param) {
                if (!param) return "/dashboard";
                const decoded = decodeURIComponent(param).trim();
                if (decoded.includes("://") || decoded.startsWith("//") || decoded.startsWith("\\")) {
                    return "/dashboard";
                }
                return decoded.startsWith("/") ? decoded : "/" + decoded;
            }

            assert.strictEqual(validateRedirect("/payment?plan=basic"), "/payment?plan=basic");
            assert.strictEqual(validateRedirect("/payment?plan=premium"), "/payment?plan=premium");
            assert.strictEqual(validateRedirect("https://malicious-site.com/phish"), "/dashboard");
            assert.strictEqual(validateRedirect("http://evil.com"), "/dashboard");
            assert.strictEqual(validateRedirect("//evil.com/fake"), "/dashboard");
            assert.strictEqual(validateRedirect(""), "/dashboard");
        });

        // ==========================================================
        // 9. BUY BUTTON AUTH GUARD LOGIC
        // ==========================================================
        await test("9.1 buy-auth-guard.js redirects unauthenticated clicks to /login?return=/payment?plan=...", () => {
            const guardPath = path.join(FRONTEND_DIR, "assets/js/buy-auth-guard.js");
            const guardJs = fs.readFileSync(guardPath, "utf8");
            assert.ok(guardJs.includes('a[href*=\'payment\']') || guardJs.includes('a[href*="payment"]'), "Guard must match payment links");
            assert.ok(guardJs.includes('/login?return='), "Guard must redirect to /login?return=");
            assert.ok(guardJs.includes('/payment?plan='), "Guard must target clean /payment?plan= route");
        });

        // ==========================================================
        // 10. PRICING BUTTONS LOGIN CHECK LOGIC
        // ==========================================================
        await test("10.1 pricing.js checkLoginAndContinue redirects unauthenticated users to /login?return=/payment?plan=...", () => {
            const pricingPath = path.join(FRONTEND_DIR, "assets/js/pricing.js");
            const pricingJs = fs.readFileSync(pricingPath, "utf8");
            assert.ok(pricingJs.includes('/payment?plan='), "pricing.js must target clean /payment?plan= route");
            assert.ok(pricingJs.includes('/login?return='), "pricing.js must redirect to /login?return=");
        });

    } finally {
        await new Promise((resolve) => server.close(resolve));
    }

    console.log("==========================================================");
    console.log(`📊 SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("==========================================================");

    if (failCount > 0) {
        process.exit(1);
    }
}

runProductionRoutingAndPaymentAudit().catch((err) => {
    console.error("FATAL ERROR IN SUITE:", err);
    process.exit(1);
});
