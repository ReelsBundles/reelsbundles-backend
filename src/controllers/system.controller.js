import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../config/firebase.js";
import { getAggregateReviewStats } from "../services/review-storage.service.js";

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

export const getMaintenanceStatus = async (req, res) => {
    try {
        let settings = loadSettingsLocal();

        // Sync with cloud Firestore to prevent Render restart/reset wiping maintenance mode
        try {
            if (db) {
                const docRef = db.collection("system_settings").doc("maintenance");
                const docSnap = await docRef.get();
                if (docSnap.exists) {
                    const remoteData = docSnap.data();
                    // Prioritize remote custom passcode if set
                    settings = {
                        ...settings,
                        ...remoteData
                    };
                    saveSettingsLocal(settings);
                }
            }
        } catch (e) {
            console.warn("[SYSTEM CONTROLLER] Firestore sync warning:", e?.message);
        }

        const passcode = settings.testerPasscode || "5796";
        const key = settings.bypassKey || `RB_TESTER_KEY_${passcode}`;

        return res.json({
            success: true,
            maintenance: Boolean(settings.maintenance),
            message: settings.message || "🛠️ System Maintenance in progress.",
            expectedBack: settings.expectedBack || null,
            showTimer: settings.showTimer !== false,
            testerPasscode: passcode,
            bypassKey: key
        });
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
        const { maintenance, message, expectedBack, showTimer, testerPasscode, bypassKey } = req.body || {};
        const passcode = testerPasscode !== undefined ? String(testerPasscode).trim() : (current.testerPasscode || "5796");
        const key = bypassKey !== undefined ? String(bypassKey).trim() : `RB_TESTER_KEY_${passcode}`;

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

        // Save locally
        saveSettingsLocal(updated);

        // Save to Firestore Cloud Database so it NEVER resets on Render server restart
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

export const verifyMaintenancePin = async (req, res) => {
    try {
        let settings = loadSettingsLocal();
        try {
            if (db) {
                const docRef = db.collection("system_settings").doc("maintenance");
                const docSnap = await docRef.get();
                if (docSnap.exists) {
                    settings = { ...settings, ...docSnap.data() };
                }
            }
        } catch (e) {}

        const activePin = String(settings.testerPasscode || "5796").trim();
        const activeKey = String(settings.bypassKey || `RB_TESTER_KEY_${activePin}`).trim();
        const inputPin = String(req.body?.pin || "").trim();

        if (inputPin && (inputPin === activePin || inputPin === activeKey || inputPin === `RB_TESTER_KEY_${activePin}`)) {
            return res.json({ success: true, valid: true, passcode: activePin });
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

        const reviewStats = await getAggregateReviewStats().catch(() => ({
            totalReviews: 1250,
            averageRating: 4.9,
            satisfactionPercentage: 99
        }));

        const totalCustomersCount = 10000 + paidCount;
        const totalCustomersFormatted = (totalCustomersCount / 1000).toFixed(1) + "K+";

        return res.json({
            success: true,
            stats: {
                readyReels: "200K+",
                happyCustomers: totalCustomersFormatted,
                happyCustomersCount: totalCustomersCount,
                satisfaction: `${reviewStats.satisfactionPercentage || 99}%`,
                averageRating: reviewStats.averageRating || 4.9,
                totalReviews: reviewStats.totalReviews || 1250,
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
                happyCustomers: "10.0K+",
                happyCustomersCount: 10000,
                satisfaction: "99%",
                averageRating: 4.9,
                totalReviews: 1250,
                support: "24/7",
                liveSynced: false
            }
        });
    }
};
