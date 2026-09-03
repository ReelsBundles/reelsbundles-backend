import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import paymentRoutes from "./routes/payment.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import downloadRoutes from "./routes/download.routes.js";
import authRoutes from "./routes/auth.routes.js";
import adminDashboardRoutes from "./routes/admin-dashboard.routes.js";
import orderRoutes from "./routes/order.routes.js";
import bundleRoutes from "./routes/bundle.routes.js";
import storageRoutes from "./routes/storage.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import adminDownloadRoutes from "./routes/admin-download.routes.js";
import userBundleRoutes from "./routes/user-bundle.routes.js";
import userRoutes from "./routes/user.routes.js";
import secureDownloadRoutes
    from "./routes/secure-download.routes.js";
import couponRoutes from "./routes/coupon.routes.js";
import demoVideoRoutes from "./routes/demo-video.routes.js";
import userManagementRoutes from "./routes/user-management.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import systemRoutes from "./routes/system.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import diagnosticRoutes, { clientMonitorRoutes } from "./routes/diagnostic.routes.js";
import { diagnosticMiddleware } from "./middleware/diagnostic.middleware.js";

import "./config/env.js";
import { SYSTEM_VERSION } from "./config/version.js";

import path from "path";
import { fileURLToPath } from "url";


/* ==========================================================
   PATH CONFIG
========================================================== */

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);


/* ==========================================================
   APP
========================================================== */

const app =
    express();


/* ==========================================================
   SECURITY
========================================================== */

app.use(
    helmet({

        crossOriginOpenerPolicy: {
            policy:
                "same-origin-allow-popups"
        },

        contentSecurityPolicy: {

            directives: {

                defaultSrc: [
                    "'self'"
                ],


                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",

                    "https://www.gstatic.com",
                    "https://apis.google.com",

                    "https://www.youtube.com",
                    "https://www.youtube-nocookie.com",

                    "https://sdk.cashfree.com"
                ],

                scriptSrcAttr: [
                    "'unsafe-inline'"
                ],


                connectSrc: [
                    "'self'",

                    "https://identitytoolkit.googleapis.com",
                    "https://securetoken.googleapis.com",
                    "https://firestore.googleapis.com",

                    "https://apis.google.com",
                    "https://accounts.google.com",
                    "https://www.googleapis.com",
                    "https://www.gstatic.com",

                    "https://sdk.cashfree.com",
                    "https://sandbox.cashfree.com",
                    "https://api.cashfree.com"
                ],


                frameSrc: [
                    "'self'",

                    "https://www.youtube.com",
                    "https://www.youtube-nocookie.com",

                    "https://accounts.google.com",
                    "https://*.google.com",
                    "https://*.firebaseapp.com",
                    "https://*.uropai.in"
                ],


                childSrc: [
                    "'self'",

                    "https://www.youtube.com",
                    "https://www.youtube-nocookie.com",
                    "https://*.uropai.in"
                ],


                imgSrc: [
                    "'self'",
                    "data:",
                    "blob:",
                    "https:"
                ],


                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://fonts.googleapis.com"
                ],


                fontSrc: [
                    "'self'",
                    "https://fonts.gstatic.com",
                    "data:"
                ],


                objectSrc: [
                    "'none'"
                ],


                baseUri: [
                    "'self'"
                ],


                formAction: [
                    "'self'",
                    "https://*.uropai.in"
                ]

            }

        }

    })
);

app.use((req, res, next) => {
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    next();
});


/* ==========================================================
   CORS
========================================================== */

/*
 * Keep CORS centralized here.
 *
 * For production, ALLOWED_ORIGINS can contain:
 *
 * https://reelsbundles.github.io
 *
 * and any other explicitly trusted frontend origin.
 */

const defaultAllowedOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://reelsbundles.github.io"
];

const allowedOrigins =
    process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS
            .split(",")
            .map(
                origin =>
                    origin.trim()
            )
            .filter(Boolean)
        : defaultAllowedOrigins;


app.use(
    cors({

        origin: (
            origin,
            callback
        ) => {

            /*
             * Server-to-server / tools without
             * browser Origin header.
             */

            if (!origin) {

                return callback(
                    null,
                    true
                );

            }


            /*
             * If no whitelist is configured,
             * preserve current development behavior.
             *
             * Production should configure
             * ALLOWED_ORIGINS.
             */

            if (
                allowedOrigins.length === 0
            ) {

                return callback(
                    null,
                    true
                );

            }


            if (
                allowedOrigins.includes(
                    origin
                )
            ) {

                return callback(
                    null,
                    true
                );

            }


            return callback(
                new Error(
                    "Origin not allowed by CORS."
                )
            );

        },


        credentials: true,


        methods: [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "OPTIONS"
        ],


        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-Requested-With"
        ]

    })
);


/* ==========================================================
   BODY PARSERS
========================================================== */

app.use(
    express.json({
        limit: "2mb",
        verify: (req, res, buf) => {
            req.rawBody = buf.toString();
        }
    })
);


app.use(
    express.urlencoded({
        extended: true,
        limit: "2mb"
    })
);


/* ==========================================================
   DIAGNOSTIC & OBSERVABILITY MONITOR
   Zero-disruption request telemetry interceptor
========================================================== */

app.use(
    diagnosticMiddleware
);


/* ==========================================================
   HTTP LOGGING
========================================================== */

app.use(
    morgan("dev")
);


/* ==========================================================
   STATIC FRONTEND
========================================================== */

app.use(
    express.static(
        path.join(
            __dirname,
            ".."
        )
    )
);


/* ==========================================================
   API ROUTES
========================================================== */


/* ----------------------------------------------------------
   PAYMENT
---------------------------------------------------------- */

app.use(
    "/api/payment",
    paymentRoutes
);


/* ----------------------------------------------------------
   CASHFREE WEBHOOK
---------------------------------------------------------- */

app.use(
    "/api/webhook",
    webhookRoutes
);


/* ----------------------------------------------------------
   LEGACY / INTERNAL DOWNLOAD ROUTES
---------------------------------------------------------- */

app.use(
    "/api/download",
    downloadRoutes
);


/* ----------------------------------------------------------
   AUTH
---------------------------------------------------------- */

app.use(
    "/api/auth",
    authRoutes
);


/* ----------------------------------------------------------
   ADMIN DASHBOARD
---------------------------------------------------------- */

app.use(
    "/api/admin/dashboard",
    adminDashboardRoutes
);


/* ----------------------------------------------------------
   ADMIN ORDERS
---------------------------------------------------------- */

app.use(
    "/api/admin/orders",
    orderRoutes
);


/* ----------------------------------------------------------
   STORAGE
---------------------------------------------------------- */

app.use(
    "/api/storage",
    storageRoutes
);


/* ----------------------------------------------------------
   ADMIN BUNDLES
---------------------------------------------------------- */

app.use(
    "/api/admin/bundles",
    bundleRoutes
);


/* ----------------------------------------------------------
   CONTACT
---------------------------------------------------------- */

app.use(
    "/api/contact",
    contactRoutes
);


/* ----------------------------------------------------------
   ADMIN DOWNLOADS
---------------------------------------------------------- */

app.use(
    "/api/admin/downloads",
    adminDownloadRoutes
);

app.use(
    "/api/downloads",
    adminDownloadRoutes
);

/* ----------------------------------------------------------
   COUPONS & DEMO VIDEOS
---------------------------------------------------------- */

app.use(
    "/api",
    couponRoutes
);

app.use(
    "/api",
    demoVideoRoutes
);

app.use(
    "/api",
    systemRoutes
);

app.use(
    "/api",
    reviewRoutes
);


/* ----------------------------------------------------------
   USER BUNDLE LIBRARY
----------------------------------------------------------

   NEW PHASE A3 API:

   GET /api/user/bundles

   GET /api/user/bundles/:bundleId/download

---------------------------------------------------------- */

app.use(
    "/api/user",
    userBundleRoutes
);

app.use(
    "/api/user",
    userRoutes
);

/* ==========================================================
   SECURE DOWNLOAD
   PHASE 4B
========================================================== */

app.use(
    "/api/secure-download",
    secureDownloadRoutes
);

app.use(
    "/api",
    userManagementRoutes
);

app.use(
    "/api",
    notificationRoutes
);

/* ----------------------------------------------------------
   DIAGNOSTIC & OBSERVABILITY MONITOR
   Admin Diagnostic APIs & Client Error Receiver
---------------------------------------------------------- */

app.use(
    "/api/admin/monitor",
    diagnosticRoutes
);

app.use(
    "/api/monitor",
    clientMonitorRoutes
);


/* ==========================================================
   HEALTH CHECK
========================================================== */

app.get(
    "/",
    (req, res) => {

        return res.status(200).json({

            success: true,

            message:
                "ReelsBundles Backend Running",

            version:
                "A3",

            service:
                "reelsbundles-backend"

        });

    }
);


/* ==========================================================
   API 404
========================================================== */

app.use(
    "/api",
    (req, res) => {

        return res.status(404).json({

            success: false,

            message:
                "API endpoint not found.",

            path:
                req.originalUrl

        });

    }
);


/* ==========================================================
   WEB 404 HANDLER
========================================================== */

app.use((req, res) => {
    if (req.accepts("html")) {
        return res.status(404).sendFile(path.join(__dirname, "../404.html"));
    }
    return res.status(404).json({
        success: false,
        message: "Page not found.",
        path: req.originalUrl
    });
});


/* ==========================================================
   GLOBAL ERROR HANDLER
========================================================== */

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "[Backend Error]",
            error
        );

        if (req?.diagnostic) {
            try {
                req.diagnostic.setError(error);
                req.diagnostic.addTimeline("Unhandled backend exception", error?.message || "Unknown error");
            } catch (e) {}
        }


        /*
         * CORS errors
         */

        if (
            error?.message ===
            "Origin not allowed by CORS."
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "Origin is not allowed."

            });

        }


        /*
         * JSON body parsing errors
         */

        if (
            error?.type ===
            "entity.parse.failed"
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid JSON request."

            });

        }


        /*
         * Generic server error
         */

        const statusCode =
            Number.isInteger(
                error?.statusCode
            )
                ? error.statusCode
                : 500;

        res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
        res.setHeader("Access-Control-Allow-Credentials", "true");

        return res
            .status(
                statusCode >= 400 &&
                statusCode <= 599

                    ? statusCode

                    : 500
            )
            .json({

                success: false,

                message:
                    process.env.NODE_ENV ===
                    "production"

                        ? "Internal server error."

                        : (
                            error?.message ||
                            "Internal server error."
                        )

            });

    }
);


/* ==========================================================
   EXPORT
========================================================== */

export default app;