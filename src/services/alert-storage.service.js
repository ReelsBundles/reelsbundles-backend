import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../config/firebase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, "../../data/important_alerts.json");

function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) return true;
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname, { recursive: true });
}

export function loadImportantAlerts() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            ensureDirectoryExistence(DATA_FILE);
            fs.writeFileSync(DATA_FILE, "[]", "utf-8");
            return [];
        }
        const raw = fs.readFileSync(DATA_FILE, "utf-8");
        return JSON.parse(raw || "[]");
    } catch (error) {
        console.error("[ALERT STORAGE] Load Error:", error);
        return [];
    }
}

export function saveImportantAlerts(alerts) {
    try {
        ensureDirectoryExistence(DATA_FILE);
        fs.writeFileSync(DATA_FILE, JSON.stringify(alerts, null, 2), "utf-8");
        return true;
    } catch (error) {
        console.error("[ALERT STORAGE] Save Error:", error);
        return false;
    }
}

export async function fetchImportantAlertsAsync() {
    let items = loadImportantAlerts();
    try {
        if (db) {
            const snapshot = await db.collection("important_alerts").get();
            if (!snapshot.empty) {
                const remote = [];
                snapshot.forEach(doc => remote.push({ id: doc.id, ...doc.data() }));

                remote.forEach(rItem => {
                    const idx = items.findIndex(lItem => lItem.id === rItem.id);
                    if (idx === -1) {
                        items.push(rItem);
                    } else {
                        items[idx] = { ...items[idx], ...rItem };
                    }
                });
                saveImportantAlerts(items);
            }
        }
    } catch (e) {
        // Fallback gracefully to local disk file if Firestore is unreachable
    }
    return items;
}

export function getActiveImportantAlerts() {
    const list = loadImportantAlerts();
    return list.filter(item => item.active !== false);
}

export function getAllImportantAlerts() {
    return loadImportantAlerts();
}

export async function createImportantAlert(data) {
    const list = loadImportantAlerts();
    const newId = "alert_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    const newAlert = {
        id: newId,
        title: String(data.title || "Important Alert").trim(),
        message: String(data.message || "").trim(),
        active: data.active !== false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    list.unshift(newAlert);
    saveImportantAlerts(list);

    try {
        if (db) {
            await db.collection("important_alerts").doc(newAlert.id).set(newAlert);
        }
    } catch (e) {
        // Local persistence succeeded
    }

    return newAlert;
}

export async function updateImportantAlert(id, data) {
    await fetchImportantAlertsAsync();
    const list = loadImportantAlerts();
    const index = list.findIndex(a => a.id === id);
    if (index === -1) return null;

    list[index] = {
        ...list[index],
        title: data.title !== undefined ? String(data.title).trim() : list[index].title,
        message: data.message !== undefined ? String(data.message).trim() : list[index].message,
        active: data.active !== undefined ? Boolean(data.active) : list[index].active,
        updatedAt: new Date().toISOString()
    };

    saveImportantAlerts(list);

    try {
        if (db) {
            await db.collection("important_alerts").doc(id).set(list[index], { merge: true });
        }
    } catch (e) {
        // Local persistence succeeded
    }

    return list[index];
}

export async function deleteImportantAlert(id) {
    await fetchImportantAlertsAsync();
    let list = loadImportantAlerts();
    const initialLen = list.length;
    list = list.filter(a => a.id !== id);
    if (list.length === initialLen) return false;
    saveImportantAlerts(list);

    try {
        if (db) {
            await db.collection("important_alerts").doc(id).delete();
        }
    } catch (e) {
        // Local persistence succeeded
    }

    return true;
}
