import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
    initializeApp,
    cert,
    getApps,
    getApp
} from "firebase-admin/app";

import {
    getFirestore
} from "firebase-admin/firestore";

import {
    getAuth
} from "firebase-admin/auth";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ==========================================================
   MULTI-SOURCE CREDENTIAL RESOLUTION
   Resolves credentials in strict priority order:
   1. FIREBASE_SERVICE_ACCOUNT (Raw JSON or base64 JSON string)
   2. GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
   3. GOOGLE_APPLICATION_CREDENTIALS file path
   4. Render Secret File (/etc/secrets/firebase-admin.json)
   5. Local filesystem (./firebase-admin.json, ../firebase-admin.json)
========================================================== */

function normalizePrivateKey(key) {
    if (!key || typeof key !== "string") return key;
    let normalized = key.trim();
    // Strip surrounding matching single or double quotes
    if ((normalized.startsWith('"') && normalized.endsWith('"')) ||
        (normalized.startsWith("'") && normalized.endsWith("'"))) {
        normalized = normalized.slice(1, -1).trim();
    }
    // Replace literal escaped newlines with actual newlines
    normalized = normalized.replace(/\\n/g, "\n");
    return normalized;
}

function resolveServiceAccount() {
    // 1. process.env.FIREBASE_SERVICE_ACCOUNT (JSON or base64 string)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            let raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
            if (raw.startsWith("{")) {
                const parsed = JSON.parse(raw);
                if (parsed.private_key) {
                    parsed.private_key = normalizePrivateKey(parsed.private_key);
                }
                return parsed;
            }
            // Base64 decode attempt
            const decoded = Buffer.from(raw, "base64").toString("utf8");
            if (decoded.trim().startsWith("{")) {
                const parsed = JSON.parse(decoded);
                if (parsed.private_key) {
                    parsed.private_key = normalizePrivateKey(parsed.private_key);
                }
                return parsed;
            }
        } catch (e) {
            console.warn("[FIREBASE CONFIG] Failed to parse FIREBASE_SERVICE_ACCOUNT:", e.message);
        }
    }

    // 2. process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
    if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
        try {
            const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL.trim();
            const privateKey = normalizePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
            const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_PROJECT_ID || "reelsbundles-48840";
            return {
                type: "service_account",
                project_id: projectId,
                client_email: clientEmail,
                private_key: privateKey
            };
        } catch (e) {
            console.warn("[FIREBASE CONFIG] Failed to construct service account from env vars:", e.message);
        }
    }

    // 3. process.env.GOOGLE_APPLICATION_CREDENTIALS path
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
            if (parsed.private_key) {
                parsed.private_key = normalizePrivateKey(parsed.private_key);
            }
            return parsed;
        } catch (e) {
            console.warn("[FIREBASE CONFIG] Failed to read GOOGLE_APPLICATION_CREDENTIALS file:", e.message);
        }
    }

    // 4. Filesystem locations: Render Secret File, Current Directory, Project Root
    const candidatePaths = [
        path.resolve(process.cwd(), "firebase-admin.json"),
        path.resolve("/etc/secrets/firebase-admin.json"),
        path.resolve(__dirname, "../../firebase-admin.json"),
        path.resolve(__dirname, "../../../firebase-admin.json")
    ];

    for (const filePath of candidatePaths) {
        if (fs.existsSync(filePath)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
                if (parsed.private_key) {
                    parsed.private_key = normalizePrivateKey(parsed.private_key);
                }
                return parsed;
            } catch (e) {
                console.warn(`[FIREBASE CONFIG] Failed to read ${filePath}:`, e.message);
            }
        }
    }

    return null;
}

let app = null;
let db = null;
let auth = null;

try {
    const serviceAccount = resolveServiceAccount();
    if (getApps().length) {
        app = getApp();
    } else if (serviceAccount && serviceAccount.private_key) {
        app = initializeApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.project_id || "reelsbundles-48840"
        });
    } else {
        app = initializeApp({
            projectId: process.env.FIREBASE_PROJECT_ID || "reelsbundles-48840"
        });
    }
    db = getFirestore(app);
    auth = getAuth(app);
} catch (err) {
    console.error("[FIREBASE CONFIG] Initialization warning:", err.message);
}

// Fast circuit breaker for Firestore authentication / credential failures
let firestoreHealthy = true;
let lastFailureTime = 0;
const RETRY_COOLDOWN_MS = 60000; // 60s cooldown

export function isFirestoreAvailable() {
    if (!db) return false;
    if (!firestoreHealthy) {
        if (Date.now() - lastFailureTime > RETRY_COOLDOWN_MS) {
            return true; // Allow one probe after cooldown
        }
        return false;
    }
    return true;
}

export function markFirestoreFailure(err) {
    const msg = String(err?.message || err);
    if (
        msg.includes("16 UNAUTHENTICATED") ||
        msg.includes("invalid_grant") ||
        msg.includes("OAuth 2") ||
        msg.includes("UNAUTHENTICATED") ||
        msg.includes("devconsole-project") ||
        msg.includes("Invalid JWT Signature")
    ) {
        firestoreHealthy = false;
        lastFailureTime = Date.now();
    }
}

export function markFirestoreSuccess() {
    firestoreHealthy = true;
}

export {
    app,
    db,
    auth
};