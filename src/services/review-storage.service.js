import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../config/firebase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REVIEWS_FILE = path.join(__dirname, "../../data/reviews.json");

function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, "[]", "utf-8");
    }
}

export function loadReviewsLocal() {
    try {
        ensureDirectoryExistence(REVIEWS_FILE);
        const raw = fs.readFileSync(REVIEWS_FILE, "utf-8");
        return JSON.parse(raw || "[]");
    } catch (error) {
        console.error("[REVIEW STORAGE] Load Error:", error);
        return [];
    }
}

export function saveReviewsLocal(reviews) {
    try {
        ensureDirectoryExistence(REVIEWS_FILE);
        fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2), "utf-8");
        return true;
    } catch (error) {
        console.error("[REVIEW STORAGE] Save Error:", error);
        return false;
    }
}

export async function fetchReviewsAsync() {
    let items = loadReviewsLocal();
    try {
        if (db) {
            const snapshot = await db.collection("reviews").get();
            if (!snapshot.empty) {
                const remote = [];
                snapshot.forEach(doc => remote.push({ id: doc.id, ...doc.data() }));

                remote.forEach(rItem => {
                    const idx = items.findIndex(lItem => lItem.id === rItem.id);
                    if (idx === -1) {
                        items.push(rItem);
                    } else {
                        items[idx] = { ...items[idx], ...rItem };
                    }
                });
                saveReviewsLocal(items);
            }
        }
    } catch (e) {
        console.warn("[REVIEWS] Firestore sync warning:", e?.message);
    }
    return items;
}

export async function saveReview(reviewData) {
    const list = loadReviewsLocal();
    const newId = "rev_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    const newReview = {
        id: newId,
        customerName: reviewData.customerName,
        userUid: reviewData.userUid || "",
        customerEmail: reviewData.customerEmail || "",
        bundlePlan: reviewData.bundlePlan || "basic",
        rating: Number(reviewData.rating) || 5,
        qualityRating: reviewData.qualityRating || "5/5 Excellent",
        supportRating: reviewData.supportRating || "10/10 Excellent",
        comment: reviewData.comment,
        approved: true,
        createdAt: new Date().toISOString()
    };

    list.unshift(newReview);
    saveReviewsLocal(list);

    try {
        if (db) {
            await db.collection("reviews").doc(newReview.id).set(newReview);
        }
    } catch (e) {
        console.warn("[REVIEWS] Firestore write warning:", e?.message);
    }

    return newReview;
}

export async function getApprovedReviews() {
    const list = await fetchReviewsAsync();
    return list.filter(r => r.approved !== false);
}

export async function getAggregateReviewStats() {
    const list = await getApprovedReviews();
    if (list.length === 0) {
        return {
            totalReviews: 1250,
            averageRating: 4.9,
            satisfactionPercentage: 99
        };
    }

    const total = list.length;
    const sum = list.reduce((acc, r) => acc + (Number(r.rating) || 5), 0);
    const avg = Math.round((sum / total) * 10) / 10;
    const positiveCount = list.filter(r => (Number(r.rating) || 5) >= 4).length;
    const satisfaction = Math.round((positiveCount / total) * 100);

    return {
        totalReviews: 1250 + total,
        averageRating: Math.max(4.5, Math.min(5.0, avg)),
        satisfactionPercentage: Math.max(95, Math.min(100, satisfaction))
    };
}
