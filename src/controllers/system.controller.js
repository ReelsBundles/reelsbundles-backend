import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../config/firebase.js";

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

        return res.json({
            success: true,
            maintenance: Boolean(settings.maintenance),
            message: settings.message || "🛠️ System Maintenance in progress.",
            expectedBack: settings.expectedBack || null,
            showTimer: settings.showTimer !== false,
            testerPasscode: settings.testerPasscode || "5796",
            bypassKey: settings.bypassKey || "RB_TESTER_KEY_5796"
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
        const { maintenance, message, expectedBack, showTimer, testerPasscode, bypassKey } = req.body;

        const updated = {
            ...current,
            maintenance: maintenance !== undefined ? Boolean(maintenance) : current.maintenance,
            message: message !== undefined ? String(message).trim() : current.message,
            expectedBack: expectedBack !== undefined ? parseSafeDate(expectedBack) : current.expectedBack,
            showTimer: showTimer !== undefined ? Boolean(showTimer) : current.showTimer,
            testerPasscode: testerPasscode !== undefined ? String(testerPasscode).trim() : (current.testerPasscode || "5796"),
            bypassKey: bypassKey !== undefined ? String(bypassKey).trim() : (current.bypassKey || `RB_TESTER_KEY_${Date.now()}`),
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
