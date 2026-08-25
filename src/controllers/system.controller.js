import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(initial, null, 2), "utf-8");
    }
}

function loadSettings() {
    ensureSettingsFile();
    try {
        const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
        return JSON.parse(raw || "{}");
    } catch (e) {
        return {
            maintenance: false,
            message: "🛠️ System Maintenance",
            expectedBack: null,
            showTimer: true
        };
    }
}

function saveSettings(settings) {
    ensureSettingsFile();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

export const getMaintenanceStatus = (req, res) => {
    try {
        const settings = loadSettings();
        return res.json({
            success: true,
            maintenance: Boolean(settings.maintenance),
            message: settings.message || "🛠️ System Maintenance in progress.",
            expectedBack: settings.expectedBack || null,
            showTimer: settings.showTimer !== false
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            maintenance: false,
            message: err.message
        });
    }
};

export const updateMaintenanceStatus = (req, res) => {
    try {
        const current = loadSettings();
        const { maintenance, message, expectedBack, showTimer } = req.body;

        const updated = {
            ...current,
            maintenance: maintenance !== undefined ? Boolean(maintenance) : current.maintenance,
            message: message !== undefined ? String(message).trim() : current.message,
            expectedBack: expectedBack !== undefined ? (expectedBack ? new Date(expectedBack).toISOString() : null) : current.expectedBack,
            showTimer: showTimer !== undefined ? Boolean(showTimer) : current.showTimer,
            updatedAt: new Date().toISOString()
        };

        saveSettings(updated);

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
