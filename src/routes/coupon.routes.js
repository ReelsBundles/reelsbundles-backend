import { Router } from "express";
import { adminAuth } from "../middleware/auth.middleware.js";
import {
    applyCoupon,
    getActiveCoupons,
    listCoupons,
    createCoupon,
    updateCoupon,
    toggleCoupon,
    deleteCoupon
} from "../controllers/coupon.controller.js";

const router = Router();

// Public coupon endpoints for checkout
router.get("/apply-coupon", (req, res) => {
    return res.status(200).json({
        success: true,
        message: "Coupon validation endpoint active. Use HTTP POST with coupon code to apply coupons.",
        methodRequired: "POST"
    });
});
router.post("/apply-coupon", applyCoupon);
router.get("/coupons/active", getActiveCoupons);

// Admin coupon management
router.get("/admin/coupons", adminAuth, listCoupons);
router.post("/admin/coupons", adminAuth, createCoupon);
router.put("/admin/coupons/:id", adminAuth, updateCoupon);
router.put("/admin/coupons/:id/toggle", adminAuth, toggleCoupon);
router.delete("/admin/coupons/:id", adminAuth, deleteCoupon);

export default router;
