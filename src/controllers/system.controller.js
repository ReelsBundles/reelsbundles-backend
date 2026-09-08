import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db, isFirestoreAvailable, markFirestoreFailure, markFirestoreSuccess } from "../config/firebase.js";
import { getAggregateReviewStats } from "../services/review-storage.service.js";
import { loadLocalPayments } from "../services/payment-storage.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, "../../data/system_settings.json");

function ensureSettingsFile() {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(SETTINGS_FILE)) {
        const initial = {
            maintenance: false,
            message: "🛠️ ReelsBundles is currently undergoing scheduled system upgrades. We will be back online shortly!",
            expectedBack: null,
            showTimer: true,
            testerPasscode: "5796",
            bypassKey: "RB_TESTER_KEY_5796",
            updatedAt: "1970-01-01T00:00:00.000Z"
        };
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(initial, null, 2), "utf-8");
    }
}

function loadSettingsLocal() {
    ensureSettingsFile();
    try {
        const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
        return JSON.parse(raw || "{}");
    } catch (e) {
        return {
            maintenance: false,
            message: "🛠️ System Maintenance in progress.",
            expectedBack: null,
            showTimer: true,
            testerPasscode: "5796",
            bypassKey: "RB_TESTER_KEY_5796",
            updatedAt: "1970-01-01T00:00:00.000Z"
        };
    }
}

function saveSettingsLocal(settings) {
    ensureSettingsFile();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

function parseSafeDate(val) {
    if (!val) return null;
    try {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d.toISOString();
    } catch (e) {
        return null;
    }
}

let lastSyncTime = 0;
const SYNC_CACHE_TTL_MS = 5000; // 5s throttle for read sync

async function syncWithFirestore(localSettings, forceRefresh = false) {
    if (!isFirestoreAvailable()) return localSettings;
    const now = Date.now();
    if (!forceRefresh && now - lastSyncTime < SYNC_CACHE_TTL_MS) {
        return localSettings;
    }
    try {
        const docRef = db.collection("system_settings").doc("maintenance");
        const docSnap = await docRef.get();
        markFirestoreSuccess();
        lastSyncTime = Date.now();
        if (docSnap.exists) {
            const remoteData = docSnap.data() || {};
            const localTime = new Date(localSettings.updatedAt || 0).getTime();
            const remoteTime = new Date(remoteData.updatedAt || 0).getTime();

            if (remoteTime > localTime) {
                // Remote Firestore data is strictly newer: adopt remote
                const merged = { ...localSettings, ...remoteData };
                saveSettingsLocal(merged);
                return merged;
            } else if (localTime > remoteTime) {
                // Local copy is newer: push to Firestore to sync remote
                docRef.set(localSettings, { merge: true }).catch(err => {
                    markFirestoreFailure(err);
                    console.warn("[SYSTEM CONTROLLER] Firestore sync write warning:", err?.message);
                });
            }
        } else {
            docRef.set(localSettings, { merge: true }).catch(err => {
                markFirestoreFailure(err);
                console.warn("[SYSTEM CONTROLLER] Firestore seed write warning:", err?.message);
            });
        }
    } catch (e) {
        markFirestoreFailure(e);
        console.warn("[SYSTEM CONTROLLER] Firestore sync warning:", e?.message);
    }
    return localSettings;
}

export const getMaintenanceStatus = async (req, res) => {
    try {
        let settings = loadSettingsLocal();
        settings = await syncWithFirestore(settings);

        const passcode = settings.testerPasscode || "5796";
        const key = settings.bypassKey || `RB_TESTER_KEY_${passcode}`;

        // Strictly check if request is authenticated as an Admin
        const isAdmin = Boolean(req.admin && (req.admin.role === "admin" || req.admin.role === "superadmin"));

        // Maintenance is STRICTLY determined by Admin setting.
        // No automatic expiry / auto-off: stays ON indefinitely until Admin explicitly turns it OFF.
        const isMaintenanceActive = Boolean(settings.maintenance);

        const responsePayload = {
            success: true,
            maintenance: isMaintenanceActive,
            message: settings.message || "🛠️ System Maintenance in progress.",
            expectedBack: settings.expectedBack || null,
            showTimer: settings.showTimer !== false
        };

        // NEVER expose testerPasscode or bypassKey on public endpoints. Only authenticated admin receives it.
        if (isAdmin) {
            responsePayload.testerPasscode = passcode;
            responsePayload.bypassKey = key;
        }

        return res.json(responsePayload);
    } catch (err) {
        return res.status(500).json({
            success: false,
            maintenance: false,
            message: err.message
        });
    }
};

export const updateMaintenanceStatus = async (req, res) => {
    try {
        const current = loadSettingsLocal();
        const { maintenance, message, expectedBack, showTimer, testerPasscode, passcode: altPasscode, pin } = req.body || {};
        const incomingPasscode = testerPasscode ?? altPasscode ?? pin;
        const passcode = incomingPasscode !== undefined && String(incomingPasscode).trim() !== ""
            ? String(incomingPasscode).trim()
            : (current.testerPasscode || "5796");
        const key = `RB_TESTER_KEY_${passcode}`;

        const updated = {
            ...current,
            maintenance: maintenance !== undefined ? Boolean(maintenance) : current.maintenance,
            message: message !== undefined ? String(message).trim() : current.message,
            expectedBack: expectedBack !== undefined ? parseSafeDate(expectedBack) : current.expectedBack,
            showTimer: showTimer !== undefined ? Boolean(showTimer) : current.showTimer,
            testerPasscode: passcode,
            bypassKey: key,
            updatedAt: new Date().toISOString()
        };

        // Save locally first
        saveSettingsLocal(updated);
        lastSyncTime = Date.now();

        // Save to Firestore Cloud Database
        try {
            if (isFirestoreAvailable()) {
                await db.collection("system_settings").doc("maintenance").set(updated, { merge: true });
                markFirestoreSuccess();
            }
        } catch (e) {
            markFirestoreFailure(e);
            console.warn("[SYSTEM CONTROLLER] Firestore write warning:", e?.message);
        }

        return res.json({
            success: true,
            message: `Maintenance Mode is now ${updated.maintenance ? "ENABLED (ON)" : "DISABLED (OFF)"}`,
            settings: updated
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
};

export const updateMaintenancePasscode = async (req, res) => {
    try {
        const current = loadSettingsLocal();
        const incomingPasscode = req.body?.testerPasscode ?? req.body?.passcode ?? req.body?.pin;
        if (!incomingPasscode || String(incomingPasscode).trim() === "") {
            return res.status(400).json({ success: false, message: "Passcode (PIN) is required." });
        }
        const passcode = String(incomingPasscode).trim();
        const key = `RB_TESTER_KEY_${passcode}`;

        const updated = {
            ...current,
            testerPasscode: passcode,
            bypassKey: key,
            updatedAt: new Date().toISOString()
        };

        saveSettingsLocal(updated);
        lastSyncTime = Date.now();

        if (isFirestoreAvailable()) {
            try {
                await db.collection("system_settings").doc("maintenance").set(updated, { merge: true });
                markFirestoreSuccess();
            } catch (e) {
                markFirestoreFailure(e);
                console.warn("[SYSTEM CONTROLLER] Firestore write warning:", e?.message);
            }
        }

        return res.json({
            success: true,
            message: "Maintenance passcode updated successfully.",
            settings: {
                testerPasscode: passcode,
                bypassKey: key,
                updatedAt: updated.updatedAt
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

export const verifyMaintenancePin = async (req, res) => {
    try {
        let settings = loadSettingsLocal();
        settings = await syncWithFirestore(settings);

        const activePin = String(settings.testerPasscode || "5796").trim();
        const activeKey = String(settings.bypassKey || `RB_TESTER_KEY_${activePin}`).trim();
        const inputPin = String(req.body?.pin || req.body?.passcode || "").trim();

        if (inputPin && (inputPin === activePin || inputPin === activeKey || inputPin === `RB_TESTER_KEY_${activePin}`)) {
            return res.json({ success: true, valid: true });
        }
        return res.json({ success: true, valid: false });
    } catch (err) {
        return res.status(500).json({ success: false, valid: false });
    }
};

/* ==========================================================
   PUBLIC LIVE SYSTEM STATS API
========================================================== */
export const getPublicStats = async (req, res) => {
    try {
        let paidCount = 0;
        try {
            if (db) {
                const snap = await db.collection("payments").get();
                snap.forEach(doc => {
                    const data = doc.data() || {};
                    const status = String(data.paymentStatus || data.status || "").toUpperCase();
                    if (["PAID", "SUCCESS", "COMPLETED", "CAPTURED"].includes(status)) {
                        paidCount++;
                    }
                });
            }
        } catch (e) {
            console.warn("[PUBLIC STATS WARN]", e?.message);
        }

        if (paidCount === 0) {
            const localPayments = loadLocalPayments();
            localPayments.forEach(data => {
                const status = String(data.paymentStatus || data.status || "").toUpperCase();
                if (["PAID", "SUCCESS", "COMPLETED", "CAPTURED"].includes(status)) {
                    paidCount++;
                }
            });
        }

        const reviewStats = await getAggregateReviewStats().catch(() => ({
            totalReviews: 0,
            averageRating: 0,
            satisfactionPercentage: 0
        }));

        const totalCustomersCount = paidCount;
        const totalCustomersFormatted = String(totalCustomersCount);

        return res.json({
            success: true,
            stats: {
                readyReels: "200K+",
                readyReelsCount: 200000,
                happyCustomers: totalCustomersFormatted,
                happyCustomersCount: totalCustomersCount,
                satisfaction: `${reviewStats.satisfactionPercentage}%`,
                satisfactionPercentage: reviewStats.satisfactionPercentage,
                averageRating: reviewStats.averageRating,
                totalReviews: reviewStats.totalReviews,
                support: "24/7",
                liveSynced: true,
                totalPaidOrders: paidCount
            }
        });
    } catch (err) {
        return res.json({
            success: true,
            stats: {
                readyReels: "200K+",
                happyCustomers: "0",
                happyCustomersCount: 0,
                satisfaction: "0%",
                satisfactionPercentage: 0,
                averageRating: 0,
                totalReviews: 0,
                support: "24/7",
                liveSynced: false
            }
        });
    }
};
