import { Router } from "express";
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
router.get("/admin/coupons", listCoupons);
router.post("/admin/coupons", createCoupon);
router.put("/admin/coupons/:id", updateCoupon);
router.put("/admin/coupons/:id/toggle", toggleCoupon);
router.delete("/admin/coupons/:id", deleteCoupon);

export default router;
