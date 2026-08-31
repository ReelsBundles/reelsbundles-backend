import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../config/firebase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'coupons.json');

function ensureFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(FILE_PATH)) {
        fs.writeFileSync(FILE_PATH, JSON.stringify([], null, 2), 'utf8');
    }
}

export function getAllCoupons() {
    ensureFile();
    try {
        const raw = fs.readFileSync(FILE_PATH, 'utf8');
        return JSON.parse(raw) || [];
    } catch {
        return [];
    }
}

export async function fetchCouponsAsync() {
    ensureFile();
    let items = getAllCoupons();

    try {
        if (db) {
            const snapshot = await db.collection("coupons").get();
            if (!snapshot.empty) {
                const remote = [];
                snapshot.forEach(doc => remote.push({ id: doc.id, ...doc.data() }));
                
                remote.forEach(rItem => {
                    if (!items.some(lItem => lItem.id === rItem.id || (lItem.code && lItem.code.toUpperCase() === rItem.code.toUpperCase()))) {
                        items.push(rItem);
                    }
                });
                saveCoupons(items);
            }
        }
    } catch (e) {
        console.warn("[COUPONS] Firestore sync warning:", e?.message);
    }

    return items;
}

export function saveCoupons(coupons) {
    ensureFile();
    fs.writeFileSync(FILE_PATH, JSON.stringify(coupons, null, 2), 'utf8');
}

export function getCouponByCode(code) {
    if (!code) return null;
    const cleanCode = String(code).trim().toUpperCase();
    const coupons = getAllCoupons();
    return coupons.find(c => c.code.toUpperCase() === cleanCode) || null;
}

export async function createCoupon(data) {
    const coupons = getAllCoupons();
    const cleanCode = String(data.code || '').trim().toUpperCase();
    if (!cleanCode) throw new Error("Coupon code is required");
    if (coupons.some(c => c.code.toUpperCase() === cleanCode)) {
        throw new Error("Coupon code already exists");
    }

    const newCoupon = {
        id: "cpn_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        code: cleanCode,
        discountType: data.discountType === 'flat' ? 'flat' : 'percentage',
        discountValue: Number(data.discountValue) || 0,
        minOrderAmount: Number(data.minOrderAmount) || 0,
        maxDiscount: data.maxDiscount ? Number(data.maxDiscount) : null,
        usageCount: 0,
        maxUses: data.maxUses ? Number(data.maxUses) : null,
        expiryDate: data.expiryDate ? new Date(data.expiryDate).toISOString() : null,
        eligibleUserType: data.eligibleUserType || 'all',
        description: data.description || '',
        userBadge: data.userBadge || '',
        active: data.active !== false,
        createdAt: new Date().toISOString()
    };

    coupons.push(newCoupon);
    saveCoupons(coupons);

    try {
        if (db) {
            await db.collection("coupons").doc(newCoupon.id).set(newCoupon);
        }
    } catch (e) {
        console.warn("[COUPON] Firestore write warning:", e?.message);
    }

    return newCoupon;
}

export async function updateCoupon(id, data) {
    const coupons = getAllCoupons();
    const coupon = coupons.find(c => c.id === id);
    if (!coupon) throw new Error("Coupon not found");

    if (data.code) {
        const cleanCode = String(data.code).trim().toUpperCase();
        if (coupons.some(c => c.id !== id && c.code.toUpperCase() === cleanCode)) {
            throw new Error("Coupon code already exists");
        }
        coupon.code = cleanCode;
    }

    if (data.discountType !== undefined) coupon.discountType = data.discountType === 'flat' ? 'flat' : 'percentage';
    if (data.discountValue !== undefined) coupon.discountValue = Number(data.discountValue) || 0;
    if (data.minOrderAmount !== undefined) coupon.minOrderAmount = Number(data.minOrderAmount) || 0;
    if (data.maxDiscount !== undefined) coupon.maxDiscount = data.maxDiscount ? Number(data.maxDiscount) : null;
    if (data.maxUses !== undefined) coupon.maxUses = data.maxUses ? Number(data.maxUses) : null;
    if (data.expiryDate !== undefined) coupon.expiryDate = data.expiryDate ? new Date(data.expiryDate).toISOString() : null;
    if (data.eligibleUserType !== undefined) coupon.eligibleUserType = data.eligibleUserType;
    if (data.description !== undefined) coupon.description = data.description;
    if (data.userBadge !== undefined) coupon.userBadge = data.userBadge;
    if (data.active !== undefined) coupon.active = Boolean(data.active);
    coupon.updatedAt = new Date().toISOString();

    saveCoupons(coupons);

    try {
        if (db) {
            await db.collection("coupons").doc(id).set(coupon, { merge: true });
        }
    } catch (e) {
        console.warn("[COUPON] Firestore update warning:", e?.message);
    }

    return coupon;
}

export async function toggleCoupon(id) {
    const coupons = getAllCoupons();
    const coupon = coupons.find(c => c.id === id);
    if (!coupon) throw new Error("Coupon not found");
    coupon.active = !coupon.active;
    saveCoupons(coupons);

    try {
        if (db) {
            await db.collection("coupons").doc(id).update({ active: coupon.active });
        }
    } catch (e) {}

    return coupon;
}

export async function deleteCoupon(id) {
    let coupons = getAllCoupons();
    const initialLen = coupons.length;
    coupons = coupons.filter(c => c.id !== id);
    if (coupons.length === initialLen) throw new Error("Coupon not found");
    saveCoupons(coupons);

    try {
        if (db) {
            await db.collection("coupons").doc(id).delete();
        }
    } catch (e) {}

    return true;
}

export async function incrementCouponUsage(code) {
    const cleanCode = String(code).trim().toUpperCase();
    const coupons = getAllCoupons();
    const coupon = coupons.find(c => c.code.toUpperCase() === cleanCode);
    if (coupon) {
        coupon.usageCount = (coupon.usageCount || 0) + 1;
        saveCoupons(coupons);

        try {
            if (db) {
                await db.collection("coupons").doc(coupon.id).update({ usageCount: coupon.usageCount });
            }
        } catch (e) {}
    }
}
