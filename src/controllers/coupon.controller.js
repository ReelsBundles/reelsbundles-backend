import {
    getAllCoupons,
    fetchCouponsAsync,
    getCouponByCode,
    createCoupon as createCouponService,
    toggleCoupon as toggleCouponService,
    deleteCoupon as deleteCouponService
} from '../services/coupon-storage.service.js';

import { getPlan } from '../services/payment.service.js';
import { db } from '../config/firebase.js';

export const applyCoupon = async (req, res) => {
    try {
        const { code, planKey, userEmail, userId } = req.body || {};
        if (!code) {
            return res.status(200).json({
                success: false,
                message: "Coupon code is required."
            });
        }

        const coupon = getCouponByCode(code);
        if (!coupon || !coupon.active) {
            return res.status(200).json({
                success: false,
                message: "Invalid or expired coupon code."
            });
        }

        if (coupon.maxUses && coupon.usageCount >= coupon.maxUses) {
            return res.status(200).json({
                success: false,
                message: "This coupon code usage limit has been reached."
            });
        }

        if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
            return res.status(200).json({
                success: false,
                message: "This coupon code has expired."
            });
        }

        // Check Bidirectional User Eligibility (New Users vs Existing Users)
        const targetType = (coupon.eligibleUserType || 'all').toLowerCase();
        if (targetType !== 'all') {
            let isExistingUser = false;
            try {
                if (userEmail || userId) {
                    const snap = await db.collection("payments").get();
                    snap.forEach(doc => {
                        const data = doc.data() || {};
                        const status = String(data.paymentStatus || data.status || "").toUpperCase();
                        if (status === "PAID" || status === "SUCCESS" || status === "COMPLETED") {
                            if (userEmail && String(data.customerEmail || data.email || "").toLowerCase() === String(userEmail).toLowerCase()) {
                                isExistingUser = true;
                            }
                            if (userId && String(data.userId || data.customerPhone || "").toLowerCase() === String(userId).toLowerCase()) {
                                isExistingUser = true;
                            }
                        }
                    });
                }
            } catch (e) {
                console.warn("[COUPON ELIGIBILITY CHECK WARN]", e.message);
            }

            // Rule A: Existing User attempting to apply a New Users Only coupon
            if (targetType === 'new_users' && isExistingUser) {
                return res.status(200).json({
                    success: false,
                    message: "⚠️ This coupon code is valid for New Users on their first purchase only."
                });
            }

            // Rule B: New User attempting to apply a Returning Users Only coupon
            if ((targetType === 'existing_users' || targetType === 'premium') && !isExistingUser) {
                return res.status(200).json({
                    success: false,
                    message: "⚠️ This coupon code is valid for Returning Users on repeat purchases only."
                });
            }
        }

        const selectedPlan = getPlan(planKey || 'basic');
        const originalPrice = selectedPlan ? selectedPlan.amount : 49;

        if (coupon.minOrderAmount && originalPrice < coupon.minOrderAmount) {
            return res.status(200).json({
                success: false,
                message: `Minimum order amount of ₹${coupon.minOrderAmount} required for this coupon.`
            });
        }

        let discountAmount = 0;
        if (coupon.discountType === 'percentage') {
            discountAmount = Math.round((originalPrice * coupon.discountValue) / 100);
            if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
                discountAmount = coupon.maxDiscount;
            }
        } else if (coupon.discountType === 'flat') {
            discountAmount = coupon.discountValue;
        }

        if (discountAmount > originalPrice) {
            discountAmount = originalPrice;
        }

        const finalPrice = Math.max(1, originalPrice - discountAmount);

        return res.json({
            success: true,
            message: `Coupon '${coupon.code}' applied successfully!`,
            coupon: {
                code: coupon.code,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue
            },
            originalPrice,
            discountAmount,
            finalPrice
        });
    } catch (error) {
        console.error("APPLY COUPON ERROR:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to validate coupon."
        });
    }
};

export const listCoupons = async (req, res) => {
    try {
        const coupons = await fetchCouponsAsync();
        return res.json({
            success: true,
            coupons
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getActiveCoupons = async (req, res) => {
    try {
        const coupons = await fetchCouponsAsync();
        const now = new Date();
        const activeCoupons = (coupons || []).filter(c => {
            if (!c.active) return false;
            if (c.expiryDate && new Date(c.expiryDate) < now) return false;
            if (c.maxUses && c.usageCount >= c.maxUses) return false;
            return true;
        }).map(c => ({
            id: c.id,
            code: c.code,
            discountType: c.discountType,
            discountValue: c.discountValue,
            description: c.description || (c.discountType === 'percentage' ? `Get ${c.discountValue}% OFF on your bundle order!` : `Get ₹${c.discountValue} FLAT OFF!`),
            userBadge: c.userBadge || (String(c.code).toUpperCase().includes('WELCOME') ? '✨ NEW USER OFFER' : '🔥 SPECIAL DISCOUNT'),
            eligibleUserType: c.eligibleUserType || 'all'
        }));

        return res.json({
            success: true,
            coupons: activeCoupons
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const createCoupon = async (req, res) => {
    try {
        const newCoupon = createCouponService(req.body);
        return res.json({
            success: true,
            message: "Coupon created successfully!",
            coupon: newCoupon
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

export const toggleCoupon = async (req, res) => {
    try {
        const updated = toggleCouponService(req.params.id);
        return res.json({
            success: true,
            message: `Coupon is now ${updated.active ? 'Active' : 'Inactive'}`,
            coupon: updated
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

export const deleteCoupon = async (req, res) => {
    try {
        deleteCouponService(req.params.id);
        return res.json({
            success: true,
            message: "Coupon deleted successfully."
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
