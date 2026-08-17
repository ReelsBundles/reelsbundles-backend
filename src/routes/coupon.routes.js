import { Router } from "express";
import {
    applyCoupon,
    listCoupons,
    createCoupon,
    toggleCoupon,
    deleteCoupon
} from "../controllers/coupon.controller.js";

const router = Router();

// Public coupon verification for checkout
router.post("/apply-coupon", applyCoupon);

// Admin coupon management
router.get("/admin/coupons", listCoupons);
router.post("/admin/coupons", createCoupon);
router.put("/admin/coupons/:id/toggle", toggleCoupon);
router.delete("/admin/coupons/:id", deleteCoupon);

export default router;
