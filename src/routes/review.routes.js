import { Router } from "express";
import { submitReview, getPublicReviews } from "../controllers/review.controller.js";
import { firebaseUserAuth } from "../middleware/auth.middleware.js";

const router = Router();

// Public route to fetch reviews & aggregate stats
router.get("/reviews", getPublicReviews);

// Authenticated route to submit feedback
router.post("/reviews", firebaseUserAuth, submitReview);

export default router;
