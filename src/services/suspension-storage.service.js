import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../../data");
const SUSPENDED_FILE = path.join(DATA_DIR, "suspended_users.json");

function ensureDirectoryAndFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(SUSPENDED_FILE)) {
        fs.writeFileSync(SUSPENDED_FILE, JSON.stringify([], null, 2), "utf8");
    }
}

export function getSuspendedUsers() {
    try {
        ensureDirectoryAndFile();
        const raw = fs.readFileSync(SUSPENDED_FILE, "utf8");
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
    } catch (error) {
        console.error("[SUSPENSION STORAGE] Read error:", error);
        return [];
    }
}

export function saveSuspendedUsers(list) {
    try {
        ensureDirectoryAndFile();
        fs.writeFileSync(SUSPENDED_FILE, JSON.stringify(list, null, 2), "utf8");
        return true;
    } catch (error) {
        console.error("[SUSPENSION STORAGE] Save error:", error);
        return false;
    }
}

export function isUserSuspended(identifier) {
    if (!identifier) return false;
    const cleanId = String(identifier).trim().toLowerCase();
    const list = getSuspendedUsers();

    return list.some(item => {
        const itemEmail = String(item.email || "").trim().toLowerCase();
        const itemUid = String(item.uid || "").trim().toLowerCase();
        return (itemEmail && itemEmail === cleanId) || (itemUid && itemUid === cleanId);
    });
}

export function getSuspensionRecord(identifier) {
    if (!identifier) return null;
    const cleanId = String(identifier).trim().toLowerCase();
    const list = getSuspendedUsers();

    return list.find(item => {
        const itemEmail = String(item.email || "").trim().toLowerCase();
        const itemUid = String(item.uid || "").trim().toLowerCase();
        return (itemEmail && itemEmail === cleanId) || (itemUid && itemUid === cleanId);
    }) || null;
}

export function suspendUser({ uid, email, reason }) {
    const list = getSuspendedUsers();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanUid = String(uid || "").trim().toLowerCase();

    if (!cleanEmail && !cleanUid) {
        return false;
    }

    const existingIndex = list.findIndex(item => {
        const itemEmail = String(item.email || "").trim().toLowerCase();
        const itemUid = String(item.uid || "").trim().toLowerCase();
        return (cleanEmail && itemEmail === cleanEmail) || (cleanUid && itemUid === cleanUid);
    });

    const record = {
        uid: cleanUid || (existingIndex >= 0 ? list[existingIndex].uid : ""),
        email: cleanEmail || (existingIndex >= 0 ? list[existingIndex].email : ""),
        reason: reason || "Account suspended due to Developer Tools inspection detection.",
        suspendedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
        list[existingIndex] = { ...list[existingIndex], ...record };
    } else {
        list.push(record);
    }

    return saveSuspendedUsers(list);
}

export function unsuspendUser(identifier) {
    if (!identifier) return false;
    const cleanId = String(identifier).trim().toLowerCase();
    const list = getSuspendedUsers();

    const filtered = list.filter(item => {
        const itemEmail = String(item.email || "").trim().toLowerCase();
        const itemUid = String(item.uid || "").trim().toLowerCase();
        return itemEmail !== cleanId && itemUid !== cleanId;
    });

    if (filtered.length !== list.length) {
        saveSuspendedUsers(filtered);
        return true;
    }
    return false;
}
