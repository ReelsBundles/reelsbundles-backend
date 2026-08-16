import { auth } from "../config/firebase.js";

import {
    generateAdminToken
} from "../utils/jwt.js";

import {
    sendPasswordResetEmail
} from "../services/email.service.js";

import env from "../config/env.js";

import {
    getUserEntitlement
} from "../services/payment-storage.service.js";


/* ==========================================================
   ADMIN LOGIN
========================================================== */

export const adminLogin = async (req, res) => {

    try {

        const {
            idToken
        } = req.body;


        if (!idToken) {

            return res.status(400).json({

                success: false,

                message:
                    "Firebase ID Token required."

            });

        }


        console.log(
            "[ADMIN LOGIN] Token received:",
            Boolean(idToken)
        );


        const decoded =
            await auth.verifyIdToken(
                idToken
            );


        console.log(
            "[ADMIN LOGIN] Firebase token verified."
        );

        console.log(
            "[ADMIN LOGIN] Firebase UID:",
            decoded.uid
        );

        console.log(
            "[ADMIN LOGIN] Firebase Email:",
            decoded.email
        );

        console.log(
            "[ADMIN LOGIN] Token Project:",
            decoded.aud
        );

        console.log(
            "[ADMIN LOGIN] Expected Project:",
            decoded.firebase?.sign_in_provider
                ? "Firebase Authentication"
                : "Unknown"
        );


        /* ==================================================
           ADMIN EMAIL CHECK
        ================================================== */

        const adminEmail =
            String(
                process.env.ADMIN_EMAIL || ""
            )
                .trim()
                .toLowerCase();


        const firebaseEmail =
            String(
                decoded.email || ""
            )
                .trim()
                .toLowerCase();


        console.log(
            "[ADMIN LOGIN] Configured ADMIN_EMAIL:",
            adminEmail
        );


        console.log(
            "[ADMIN LOGIN] Firebase email:",
            firebaseEmail
        );


        if (
            !adminEmail
        ) {

            console.error(
                "[ADMIN LOGIN] ADMIN_EMAIL is missing from .env"
            );


            return res.status(500).json({

                success: false,

                message:
                    "ADMIN_EMAIL is not configured."

            });

        }


        if (
            firebaseEmail !==
            adminEmail
        ) {

            console.error(
                "[ADMIN LOGIN] Email is not authorized."
            );


            return res.status(403).json({

                success: false,

                message:
                    "Unauthorized admin."

            });

        }


        /* ==================================================
           GENERATE ADMIN JWT
        ================================================== */

        const token =
            generateAdminToken({

                id:
                    decoded.uid,

                email:
                    decoded.email

            });


        console.log(
            "[ADMIN LOGIN] Admin authentication successful."
        );


        return res.json({

            success: true,

            token,

            admin: {

                uid:
                    decoded.uid,

                email:
                    decoded.email,

                name:
                    decoded.name || ""

            }

        });

    }

    catch (
        error
    ) {

        /*
         * IMPORTANT:
         * Do NOT hide the real Firebase error
         * during local development.
         */

        console.error(
            "=========================================="
        );

        console.error(
            "[ADMIN LOGIN] FIREBASE VERIFICATION FAILED"
        );

        console.error(
            "Error code:",
            error?.code
        );

        console.error(
            "Error message:",
            error?.message
        );

        console.error(
            "=========================================="
        );


        return res.status(401).json({

            success: false,

            message:
                "Invalid Firebase Token.",

            /*
             * Development diagnostic only.
             * Remove before production.
             */

            errorCode:
                error?.code || null

        });

    }

};

/* ==========================================================
   CREATE USER SESSION
========================================================== */

export const createUserSession = async (
    req,
    res
) => {

    try {

        const { idToken } =
            req.body;


        if (!idToken) {

            return res.status(400).json({

                success: false,

                message:
                    "Firebase ID Token required."

            });

        }


        const decoded =
            await auth.verifyIdToken(
                idToken
            );


        return res.json({

            success: true,

            message:
                "User session verified.",

            user: {

                uid:
                    decoded.uid,

                email:
                    decoded.email || "",

                name:
                    decoded.name || "",

                picture:
                    decoded.picture || "",

                emailVerified:
                    decoded.email_verified === true,

                provider:
                    decoded.firebase
                        ?.sign_in_provider ||
                    "unknown"

            }

        });

    }

    catch (error) {

        console.error(
            "USER SESSION ERROR:",
            error
        );

        return res.status(401).json({

            success: false,

            message:
                "Invalid or expired Firebase token."

        });

    }

};


/* ==========================================================
   CURRENT USER
   + LIVE PURCHASE / ENTITLEMENT
========================================================== */

export const getCurrentUser = async (
    req,
    res
) => {

    try {

        /*
         * firebaseUser was WRONG here.
         *
         * auth.middleware.js creates:
         *
         * req.user
         */

        const user =
            req.user;


        if (!user) {

            return res.status(401).json({

                success: false,

                message:
                    "User authentication required."

            });

        }


        /*
         * Get LIVE paid purchases
         * belonging to this Firebase UID.
         */

        const entitlement =
            await getUserEntitlement(
                user.uid
            );


        return res.json({

            success: true,

            user: {

                uid:
                    user.uid,

                email:
                    user.email || "",

                name:
                    user.name || "",

                picture:
                    user.picture || "",

                emailVerified:
                    user.emailVerified === true,

                provider:
                    "firebase",

                /*
                 * FREE / BASIC / PREMIUM
                 */

                plan:
                    entitlement.plan,

                /*
                 * Premium = lifetime
                 */

                lifetime_access:
                    entitlement.lifetimeAccess,

                /*
                 * All paid purchases
                 */

                purchases:
                    entitlement.purchases

            }

        });

    }

    catch (error) {

        console.error(
            "GET CURRENT USER ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to get current user."

        });

    }

};


/* ==========================================================
   PASSWORD RESET
========================================================== */

export const sendUserPasswordReset =
    async (req, res) => {

        try {

            const {
                email
            } = req.body;


            if (!email) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Email is required."

                });

            }


            const normalizedEmail =
                email
                    .trim()
                    .toLowerCase();


            const resetLink =
                await auth.generatePasswordResetLink(
                    normalizedEmail,
                    {
                        url:
                            `${env.FRONTEND_URL}/login.html`
                    }
                );


            let displayName = "";


            try {

                const userRecord =
                    await auth.getUserByEmail(
                        normalizedEmail
                    );

                displayName =
                    userRecord.displayName ||
                    "";

            }

            catch (userError) {

                console.log(
                    "Password reset lookup:",
                    userError.code
                );

            }


            await sendPasswordResetEmail({

                to:
                    normalizedEmail,

                resetLink,

                displayName

            });


            return res.json({

                success: true,

                message:
                    "If an account exists for this email, a password reset email has been sent."

            });

        }

        catch (error) {

            console.error(
                "PASSWORD RESET ERROR:",
                error
            );

            return res.json({

                success: true,

                message:
                    "If an account exists for this email, a password reset email has been sent."

            });

        }

    };