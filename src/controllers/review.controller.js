import {
    saveReview,
    getApprovedReviews,
    getAggregateReviewStats
} from "../services/review-storage.service.js";

import { db } from "../config/firebase.js";

export const submitReview = async (req, res) => {
    try {
        if (!req.user?.uid) {
            return res.status(401).json({
                success: false,
                message: "Authentication required to submit feedback."
            });
        }

        const {
            customerName,
            bundlePlan,
            rating,
            qualityRating,
            supportRating,
            comment
        } = req.body || {};

        // Strict 100% Mandatory Field Validation
        if (!customerName || !String(customerName).trim()) {
            return res.status(400).json({ success: false, message: "Full Name is required." });
        }
        if (!bundlePlan || !String(bundlePlan).trim()) {
            return res.status(400).json({ success: false, message: "Purchased Bundle selection is required." });
        }
        if (!rating || isNaN(Number(rating))) {
            return res.status(400).json({ success: false, message: "Star Rating is required." });
        }
        if (!qualityRating || !String(qualityRating).trim()) {
            return res.status(400).json({ success: false, message: "Content Quality rating is required." });
        }
        if (!supportRating || !String(supportRating).trim()) {
            return res.status(400).json({ success: false, message: "Support Experience rating is required." });
        }
        if (!comment || String(comment).trim().length < 10) {
            return res.status(400).json({ success: false, message: "Detailed Review comment must be at least 10 characters." });
        }

        // Verify user has paid purchase history
        let hasPaidOrder = false;
        try {
            if (db) {
                const userEmail = (req.user.email || "").toLowerCase();
                const userId = req.user.uid;
                const snap = await db.collection("payments").get();
                snap.forEach(doc => {
                    const data = doc.data() || {};
                    const status = String(data.paymentStatus || data.status || "").toUpperCase();
                    if (["PAID", "SUCCESS", "COMPLETED", "CAPTURED"].includes(status)) {
                        if (userEmail && String(data.customerEmail || data.email || "").toLowerCase() === userEmail) {
                            hasPaidOrder = true;
                        }
                        if (userId && String(data.userUid || data.userId || "").toLowerCase() === userId) {
                            hasPaidOrder = true;
                        }
                    }
                });
            } else {
                hasPaidOrder = true; // Fallback for dev mode
            }
        } catch (e) {
            hasPaidOrder = true;
        }

        if (!hasPaidOrder) {
            return res.status(403).json({
                success: false,
                message: "Feedback submission is reserved for verified buyers with a completed order."
            });
        }

        const newReview = await saveReview({
            customerName: String(customerName).trim(),
            userUid: req.user.uid,
            customerEmail: req.user.email || "",
            bundlePlan: String(bundlePlan).trim(),
            rating: Number(rating),
            qualityRating: String(qualityRating).trim(),
            supportRating: String(supportRating).trim(),
            comment: String(comment).trim()
        });

        console.log(`[REVIEWS] New Verified Review Submitted by ${newReview.customerName} (${newReview.rating}★)`);

        return res.status(201).json({
            success: true,
            message: "✓ Thank you! Your feedback has been submitted successfully.",
            review: newReview
        });
    } catch (error) {
        console.error("SUBMIT REVIEW ERROR:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to submit feedback."
        });
    }
};

export const getPublicReviews = async (req, res) => {
    try {
        const reviews = await getApprovedReviews();
        const stats = await getAggregateReviewStats();

        return res.json({
            success: true,
            stats,
            reviews
        });
    } catch (error) {
        console.error("GET PUBLIC REVIEWS ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load customer reviews."
        });
    }
};
