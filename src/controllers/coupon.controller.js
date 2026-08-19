import {
    getAllCoupons,
    fetchCouponsAsync,
    getCouponByCode,
    createCoupon as createCouponService,
    toggleCoupon as toggleCouponService,
    deleteCoupon as deleteCouponService
} from '../services/coupon-storage.service.js';

import { getPlan } from '../services/payment.service.js';

export const applyCoupon = async (req, res) => {
    try {
        const { code, planKey } = req.body;
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
