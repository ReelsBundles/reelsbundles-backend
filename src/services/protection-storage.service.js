import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../../data");
const PROTECTION_FILE = path.join(DATA_DIR, "protection.json");

const DEFAULT_PROTECTION = {
    protectionEnabled: true,
    disableRightClick: true,
    disableDevTools: true
};

function ensureFileExists() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(PROTECTION_FILE)) {
        fs.writeFileSync(PROTECTION_FILE, JSON.stringify(DEFAULT_PROTECTION, null, 2), "utf8");
    }
}

export function getProtectionSettings() {
    try {
        ensureFileExists();
        const data = fs.readFileSync(PROTECTION_FILE, "utf8");
        return { ...DEFAULT_PROTECTION, ...JSON.parse(data) };
    } catch (error) {
        console.error("[PROTECTION] Read error:", error);
        return DEFAULT_PROTECTION;
    }
}

export function updateProtectionSettings(newSettings) {
    try {
        ensureFileExists();
        const current = getProtectionSettings();
        const updated = {
            ...current,
            protectionEnabled: Boolean(newSettings.protectionEnabled ?? current.protectionEnabled),
            disableRightClick: Boolean(newSettings.disableRightClick ?? current.disableRightClick),
            disableDevTools: Boolean(newSettings.disableDevTools ?? current.disableDevTools)
        };
        fs.writeFileSync(PROTECTION_FILE, JSON.stringify(updated, null, 2), "utf8");
        return updated;
    } catch (error) {
        console.error("[PROTECTION] Save error:", error);
        throw error;
    }
}
