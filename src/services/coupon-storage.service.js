import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

export function createCoupon(data) {
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
        active: data.active !== false,
        createdAt: new Date().toISOString()
    };

    coupons.push(newCoupon);
    saveCoupons(coupons);
    return newCoupon;
}

export function toggleCoupon(id) {
    const coupons = getAllCoupons();
    const coupon = coupons.find(c => c.id === id);
    if (!coupon) throw new Error("Coupon not found");
    coupon.active = !coupon.active;
    saveCoupons(coupons);
    return coupon;
}

export function deleteCoupon(id) {
    let coupons = getAllCoupons();
    const initialLen = coupons.length;
    coupons = coupons.filter(c => c.id !== id);
    if (coupons.length === initialLen) throw new Error("Coupon not found");
    saveCoupons(coupons);
    return true;
}

export function incrementCouponUsage(code) {
    const cleanCode = String(code).trim().toUpperCase();
    const coupons = getAllCoupons();
    const coupon = coupons.find(c => c.code.toUpperCase() === cleanCode);
    if (coupon) {
        coupon.usageCount = (coupon.usageCount || 0) + 1;
        saveCoupons(coupons);
    }
}
