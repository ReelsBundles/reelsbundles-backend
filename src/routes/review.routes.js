import { Router } from "express";
import {
    submitReview,
    getPublicReviews,
    adminGetReviews,
    adminCreateReview,
    adminUpdateReview,
    adminDeleteReview
} from "../controllers/review.controller.js";
import { firebaseUserAuth, adminAuth } from "../middleware/auth.middleware.js";

const router = Router();

// Public route to fetch reviews & aggregate stats
router.get("/reviews", getPublicReviews);

// Authenticated route to submit feedback
router.post("/reviews", firebaseUserAuth, submitReview);

// Admin Feedback Management Routes
router.get("/admin/reviews", adminAuth, adminGetReviews);
router.post("/admin/reviews", adminAuth, adminCreateReview);
router.put("/admin/reviews/:id", adminAuth, adminUpdateReview);
router.delete("/admin/reviews/:id", adminAuth, adminDeleteReview);

export default router;
