import express from "express";

import {
    getUserEntitlement
} from "../services/payment-storage.service.js";

import verifyFirebaseToken from "../middleware/verifyFirebaseToken.js";

const router = express.Router();

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
   REPORT DEVTOOLS INSPECTION & SUSPENSION
   ========================================================== */
router.post("/report-devtools", (req, res) => {
    try {
        const { uid, email, reason } = req.body || {};
        console.warn("[DEVTOOLS SUSPENSION REPORT]", {
            uid: uid || "anonymous",
            email: email || "unknown",
            reason: reason || "Developer tools inspection detected",
            timestamp: new Date().toISOString(),
            ip: req.ip || req.headers["x-forwarded-for"] || "127.0.0.1"
        });

        return res.status(200).json({
            success: true,
            message: "DevTools inspection report logged successfully."
        });
    } catch (error) {
        console.error("[DEVTOOLS REPORT ERROR]", error);
        return res.status(500).json({
            success: false,
            message: "Failed to log DevTools report."
        });
    }
});

export default router;