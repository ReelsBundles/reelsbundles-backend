import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../config/firebase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, "../../data/notifications.json");

function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) return true;
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname, { recursive: true });
}

export function loadNotifications() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            ensureDirectoryExistence(DATA_FILE);
            fs.writeFileSync(DATA_FILE, "[]", "utf-8");
            return [];
        }
        const raw = fs.readFileSync(DATA_FILE, "utf-8");
        return JSON.parse(raw || "[]");
    } catch (error) {
        console.error("[NOTIFICATION STORAGE] Load Error:", error);
        return [];
    }
}

export function saveNotifications(notifications) {
    try {
        ensureDirectoryExistence(DATA_FILE);
        fs.writeFileSync(DATA_FILE, JSON.stringify(notifications, null, 2), "utf-8");
        return true;
    } catch (error) {
        console.error("[NOTIFICATION STORAGE] Save Error:", error);
        return false;
    }
}

export async function fetchNotificationsAsync() {
    let items = loadNotifications();
    try {
        if (db) {
            const snapshot = await db.collection("notifications").get();
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
                saveNotifications(items);
            }
        }
    } catch (e) {
        console.warn("[NOTIFICATIONS] Firestore sync warning:", e?.message);
    }
    return items;
}

export function getActiveNotifications() {
    const list = loadNotifications();
    return list.filter(item => item.active !== false);
}

export function getAllNotifications() {
    return loadNotifications();
}

export async function createNotification(data) {
    const list = loadNotifications();
    const newId = "notif_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    const newNotif = {
        id: newId,
        title: data.title || "Notification",
        message: data.message || "",
        type: data.type || "announcement",
        couponCode: data.couponCode ? String(data.couponCode).trim().toUpperCase() : "",
        targetAudience: data.targetAudience || "all",
        active: data.active !== false,
        createdAt: new Date().toISOString()
    };
    list.unshift(newNotif);
    saveNotifications(list);

    try {
        if (db) {
            await db.collection("notifications").doc(newNotif.id).set(newNotif);
        }
    } catch (e) {
        console.warn("[NOTIFICATION] Firestore write warning:", e?.message);
    }

    return newNotif;
}

export async function updateNotification(id, data) {
    const list = loadNotifications();
    const index = list.findIndex(n => n.id === id);
    if (index === -1) return null;

    list[index] = {
        ...list[index],
        title: data.title !== undefined ? data.title : list[index].title,
        message: data.message !== undefined ? data.message : list[index].message,
        type: data.type !== undefined ? data.type : list[index].type,
        couponCode: data.couponCode !== undefined ? String(data.couponCode).trim().toUpperCase() : list[index].couponCode,
        targetAudience: data.targetAudience !== undefined ? data.targetAudience : list[index].targetAudience,
        active: data.active !== undefined ? Boolean(data.active) : list[index].active,
        updatedAt: new Date().toISOString()
    };

    saveNotifications(list);

    try {
        if (db) {
            await db.collection("notifications").doc(id).set(list[index], { merge: true });
        }
    } catch (e) {
        console.warn("[NOTIFICATION] Firestore update warning:", e?.message);
    }

    return list[index];
}

export async function deleteNotification(id) {
    await fetchNotificationsAsync();
    let list = loadNotifications();
    const initialLen = list.length;
    list = list.filter(n => n.id !== id);
    if (list.length === initialLen) return false;
    saveNotifications(list);

    try {
        if (db) {
            await db.collection("notifications").doc(id).delete();
        }
    } catch (e) {
        console.warn("[NOTIFICATION] Firestore delete warning:", e?.message);
    }

    return true;
}
