import {
    auth,
    db
} from "../config/firebase.js";

const activeSessions = new Map();


/* ==========================================================
   ADMIN AUTH
========================================================== */

import {
    verifyAdminToken
} from "../utils/jwt.js";


export const adminAuth = (
    req,
    res,
    next
) => {

    try {

        const authHeader =
            req.headers.authorization;


        if (!authHeader) {

            return res.status(401).json({

                success: false,

                message:
                    "Authorization header missing."

            });

        }


        const token =
            authHeader.replace(
                "Bearer ",
                ""
            );


        const admin =
            verifyAdminToken(
                token
            );


        if (
            admin.role !== "admin"
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "Access denied."

            });

        }


        req.admin =
            admin;


        next();

    }

    catch (error) {

        return res.status(401).json({

            success: false,

            message:
                "Invalid or expired token."

        });

    }

};


/* ==========================================================
   USER AUTH
   Firebase ID Token Verification
========================================================== */

export const firebaseUserAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        let idToken = null;

        if (authHeader && authHeader.startsWith("Bearer ")) {
            idToken = authHeader.substring(7).trim();
        } else if (req.query?.token) {
            idToken = String(req.query.token).trim();
        }

        if (!idToken) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const decodedUser = await auth.verifyIdToken(idToken);

        if (!decodedUser || !decodedUser.uid) {
            return res.status(401).json({
                success: false,
                message: "Invalid Firebase user."
            });
        }

        req.user = decodedUser;
        const userId = decodedUser.uid;
        const currentIp = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
        const currentUserAgent = req.headers["user-agent"] || "";

        // Check if user is already suspended in Firestore database
        const userDoc = await db.collection("users").doc(userId).get();
        if (userDoc.exists) {
            const userData = userDoc.data() || {};
            if (userData.locked === true || userData.status === "SUSPENDED") {
                return res.status(403).json({
                    success: false,
                    suspended: true,
                    message: userData.suspensionReason || "Account suspended due to security violation."
                });
            }
        }

        const now = Date.now();
        const prevSession = activeSessions.get(userId);

        if (prevSession) {
            if (now - prevSession.timestamp < 10 * 60 * 1000) {
                if (prevSession.ip !== currentIp && prevSession.userAgent !== currentUserAgent) {
                    console.warn(`[Suspicious Activity] Account sharing detected for UID: ${userId}. IP: ${prevSession.ip} -> ${currentIp}, User-Agent: ${prevSession.userAgent} -> ${currentUserAgent}`);
                    
                    await db.collection("users").doc(userId).set({
                        locked: true,
                        status: "SUSPENDED",
                        suspendedAt: new Date(),
                        suspensionReason: `Simultaneous logins detected. IP1: ${prevSession.ip}, IP2: ${currentIp}`
                    }, { merge: true });

                    activeSessions.delete(userId);

                    return res.status(403).json({
                        success: false,
                        suspended: true,
                        message: "Account suspended due to suspicious sharing detection."
                    });
                }
            }
        }

        activeSessions.set(userId, {
            ip: currentIp,
            userAgent: currentUserAgent,
            timestamp: now
        });


        /*
         * IMPORTANT:
         *
         * Never trust user ID/email sent
         * from frontend.
         *
         * Everything comes from the
         * verified Firebase token.
         */

        req.user = {

    uid:
        decodedUser.uid,

    email:
        decodedUser.email ||
        "",

    phoneNumber:
        decodedUser.phone_number ||
        "",

    name:
        decodedUser.name ||
        "",

    emailVerified:
        decodedUser.email_verified === true

};


        next();

    }

    catch (error) {

        console.error(
            "USER AUTH ERROR:",
            error
        );


        return res.status(401).json({

            success: false,

            message:
                "Invalid or expired user authentication."

        });

    }

};