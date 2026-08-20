import express from "express";

import {
    getUserEntitlement
} from "../services/payment-storage.service.js";

import {
    suspendUser,
    isUserSuspended,
    getSuspensionRecord
} from "../services/suspension-storage.service.js";

import verifyFirebaseToken from "../middleware/verifyFirebaseToken.js";

const router = express.Router();

/* ==========================================================
   GET USER SUSPENSION STATUS (PUBLIC & CONTINUOUS CHECK)
   ========================================================== */
router.get("/suspension-status", (req, res) => {
    try {
        const identifier = req.query.email || req.query.uid || req.query.identifier || "";
        if (!identifier) {
            return res.status(200).json({ success: true, suspended: false });
        }

        const suspended = isUserSuspended(identifier);
        const record = suspended ? getSuspensionRecord(identifier) : null;

        return res.status(200).json({
            success: true,
            suspended,
            reason: record?.reason || "Account suspended by security policy.",
            suspendedAt: record?.suspendedAt || null
        });
    } catch (error) {
        console.error("[SUSPENSION STATUS CHECK ERROR]", error);
        return res.status(500).json({ success: false, suspended: false });
    }
});

/* ==========================================================
   GET CURRENT USER ENTITLEMENT
   ========================================================== */

router.get(
    "/entitlement",
    verifyFirebaseToken,
    async (req, res) => {

        try {

            /* --------------------------------------------------
               VERIFIED FIREBASE USER
            -------------------------------------------------- */

            if (!req.user?.uid) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Authentication required."
                });

            }

            /* --------------------------------------------------
               CHECK PERSISTENT BACKEND SUSPENSION
            -------------------------------------------------- */
            if (isUserSuspended(req.user.uid) || isUserSuspended(req.user.email)) {
                const record = getSuspensionRecord(req.user.email || req.user.uid);
                return res.status(403).json({
                    success: false,
                    suspended: true,
                    message: record?.reason || "Account suspended due to Developer Tools inspection detection."
                });
            }

            /* --------------------------------------------------
               GET PURCHASE ENTITLEMENT
            -------------------------------------------------- */

            const entitlement =
                await getUserEntitlement(
                    req.user.uid
                );

            /* --------------------------------------------------
               SAFE RESPONSE
            -------------------------------------------------- */

            return res.json({

                success: true,

                entitlement: {

                    plan:
                        entitlement?.plan ||
                        "free",

                    lifetimeAccess:
                        entitlement?.lifetimeAccess === true,

                    purchases:
                        Array.isArray(
                            entitlement?.purchases
                        )
                            ? entitlement.purchases
                            : []

                }

            });

        }
        catch (error) {

            console.error(
                "[User Entitlement] Error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load account entitlement."

            });

        }

    }
);

/* ==========================================================
   REPORT DEVTOOLS INSPECTION & PERMANENT BACKEND SUSPENSION
   ========================================================== */
router.post("/report-devtools", (req, res) => {
    try {
        const { uid, email, reason } = req.body || {};
        const defaultReason = "Account suspended due to Developer Tools inspection detection.";
        const actualReason = reason || defaultReason;

        if (email || uid) {
            suspendUser({ uid, email, reason: actualReason });
            console.warn("[PERSISTENT BACKEND SUSPENSION LOGGED]", {
                uid: uid || "anonymous",
                email: email || "unknown",
                reason: actualReason,
                timestamp: new Date().toISOString(),
                ip: req.ip || req.headers["x-forwarded-for"] || "127.0.0.1"
            });
        }

        return res.status(200).json({
            success: true,
            suspended: true,
            message: "User account suspended permanently on backend."
        });
    } catch (error) {
        console.error("[DEVTOOLS REPORT ERROR]", error);
        return res.status(500).json({
            success: false,
            message: "Failed to log DevTools suspension."
        });
    }
});

export default router;