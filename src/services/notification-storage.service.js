import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, "../../data/notifications.json");

function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) return true;
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

function loadNotifications() {
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

function saveNotifications(notifications) {
    try {
        ensureDirectoryExistence(DATA_FILE);
        fs.writeFileSync(DATA_FILE, JSON.stringify(notifications, null, 2), "utf-8");
        return true;
    } catch (error) {
        console.error("[NOTIFICATION STORAGE] Save Error:", error);
        return false;
    }
}

export function getActiveNotifications() {
    const list = loadNotifications();
    return list.filter(item => item.active !== false);
}

export function getAllNotifications() {
    return loadNotifications();
}

export function createNotification(data) {
    const list = loadNotifications();
    const newId = "notif_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    const newNotif = {
        id: newId,
        title: data.title || "Notification",
        message: data.message || "",
        type: data.type || "announcement", // coupon, announcement, alert
        couponCode: data.couponCode ? String(data.couponCode).trim().toUpperCase() : "",
        targetAudience: data.targetAudience || "all",
        active: data.active !== false,
        createdAt: new Date().toISOString()
    };
    list.unshift(newNotif);
    saveNotifications(list);
    return newNotif;
}

export function updateNotification(id, data) {
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
    return list[index];
}

export function deleteNotification(id) {
    let list = loadNotifications();
    const initialLen = list.length;
    list = list.filter(n => n.id !== id);
    if (list.length === initialLen) return false;
    saveNotifications(list);
    return true;
}
