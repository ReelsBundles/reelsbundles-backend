import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../config/firebase.js";
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
            updatedAt: new Date().toISOString()
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
            bypassKey: "RB_TESTER_KEY_5796"
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

async function syncWithFirestore(localSettings) {
    if (!db) return localSettings;
    try {
        const docRef = db.collection("system_settings").doc("maintenance");
        const docSnap = await docRef.get();
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
                    console.warn("[SYSTEM CONTROLLER] Firestore sync write warning:", err?.message);
                });
            }
        } else {
            docRef.set(localSettings, { merge: true }).catch(err => {
                console.warn("[SYSTEM CONTROLLER] Firestore seed write warning:", err?.message);
            });
        }
    } catch (e) {
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

        // Check if request is from an authenticated admin
        const isAdmin = Boolean(req.admin || req.headers.authorization);

        const responsePayload = {
            success: true,
            maintenance: Boolean(settings.maintenance),
            message: settings.message || "🛠️ System Maintenance in progress.",
            expectedBack: settings.expectedBack || null,
            showTimer: settings.showTimer !== false
        };

        // Only include testerPasscode and bypassKey if requester is authenticated admin
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

        // Save to Firestore Cloud Database
        try {
            if (db) {
                await db.collection("system_settings").doc("maintenance").set(updated, { merge: true });
            }
        } catch (e) {
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

        if (db) {
            try {
                await db.collection("system_settings").doc("maintenance").set(updated, { merge: true });
            } catch (e) {
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
