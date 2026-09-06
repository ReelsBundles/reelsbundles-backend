import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db, isFirestoreAvailable, markFirestoreFailure, markFirestoreSuccess } from "../config/firebase.js";
import { getAllCoupons, getCouponByCode, createCoupon } from "./coupon-storage.service.js";

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
        if (isFirestoreAvailable()) {
            const snapshot = await db.collection("notifications").get();
            markFirestoreSuccess();
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
        markFirestoreFailure(e);
        console.warn("[NOTIFICATIONS] Firestore sync warning:", e?.message);
    }
    return items;
}

export function getActiveNotifications() {
    const list = loadNotifications();
    const now = new Date();

    // 1. Filter active announcements and custom notifications
    // NOTE: An item NEVER expires unless an explicit expiresAt date is specified in the past
    const activeList = list.filter(item => {
        if (item.active === false) return false;
        if (item.expiresAt && new Date(item.expiresAt) < now) return false;
        return true;
    });

    // 2. Unify with active coupon offers from coupon store so public ticker and feeds surface all active offers
    try {
        const coupons = getAllCoupons();
        const activeCoupons = coupons.filter(c => {
            if (c.active === false) return false;
            if (c.expiryDate && new Date(c.expiryDate) < now) return false;
            if (c.maxUses && (c.usageCount || 0) >= c.maxUses) return false;
            return true;
        });

        for (const c of activeCoupons) {
            const exists = activeList.some(n => 
                n.type === "coupon" && 
                String(n.couponCode || "").toUpperCase() === String(c.code).toUpperCase()
            );
            if (!exists) {
                activeList.push({
                    id: `coupon_offer_${c.code}`,
                    title: c.userBadge || "Special Discount Offer",
                    message: c.description || (c.discountType === "percentage" ? `Get ${c.discountValue}% OFF on your bundle order!` : `Get ₹${c.discountValue} FLAT OFF!`),
                    type: "coupon",
                    couponCode: c.code,
                    targetAudience: c.eligibleUserType || "all",
                    active: true,
                    createdAt: c.createdAt || new Date().toISOString()
                });
            }
        }
    } catch (e) {
        console.warn("[NOTIFICATION STORAGE] Coupon unification warning:", e.message);
    }

    return activeList;
}

export function getAllNotifications() {
    return loadNotifications();
}

export async function createNotification(data) {
    const list = loadNotifications();
    const newId = "notif_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    const cleanCouponCode = data.couponCode ? String(data.couponCode).trim().toUpperCase() : "";

    const newNotif = {
        id: newId,
        title: data.title || "Notification",
        message: data.message || "",
        type: data.type || "announcement",
        couponCode: cleanCouponCode,
        targetAudience: data.targetAudience || "all",
        active: data.active !== false,
        expiresAt: data.expiresAt ? new Date(data.expiresAt).toISOString() : null,
        createdAt: new Date().toISOString()
    };
    list.unshift(newNotif);
    saveNotifications(list);

    // If coupon notification, ensure code is also registered in coupon store so it applies at checkout
    if (newNotif.type === "coupon" && cleanCouponCode) {
        try {
            const existingCoupon = getCouponByCode(cleanCouponCode);
            if (!existingCoupon) {
                await createCoupon({
                    code: cleanCouponCode,
                    discountType: data.discountType || "percentage",
                    discountValue: Number(data.discountValue) || 10,
                    description: data.message || `Special offer: ${cleanCouponCode}`,
                    userBadge: data.title || "Special Offer",
                    active: true
                });
            }
        } catch (e) {
            // Already exists or handled
        }
    }

    try {
        if (isFirestoreAvailable()) {
            await db.collection("notifications").doc(newNotif.id).set(newNotif);
            markFirestoreSuccess();
        }
    } catch (e) {
        markFirestoreFailure(e);
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
        expiresAt: data.expiresAt !== undefined ? (data.expiresAt ? new Date(data.expiresAt).toISOString() : null) : list[index].expiresAt,
        updatedAt: new Date().toISOString()
    };

    saveNotifications(list);

    try {
        if (isFirestoreAvailable()) {
            await db.collection("notifications").doc(id).set(list[index], { merge: true });
            markFirestoreSuccess();
        }
    } catch (e) {
        markFirestoreFailure(e);
        console.warn("[NOTIFICATION] Firestore update warning:", e?.message);
    }

    return list[index];
}

export async function deleteNotification(id) {
    let list = loadNotifications();
    const initialLen = list.length;
    list = list.filter(n => n.id !== id);
    if (list.length === initialLen) return false;
    saveNotifications(list);

    try {
        if (isFirestoreAvailable()) {
            await db.collection("notifications").doc(id).delete();
            markFirestoreSuccess();
        }
    } catch (e) {
        markFirestoreFailure(e);
        console.warn("[NOTIFICATION] Firestore delete warning:", e?.message);
    }

    return true;
}

