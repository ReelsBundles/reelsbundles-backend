/* ==========================================================
   REELSBUNDLES
   SECURE DOWNLOAD ROUTES
   STEP 3

   IMPORTANT:
   - Existing user-bundle.routes.js untouched
   - Existing download routes untouched
   - Firebase authentication required
========================================================== */

import express from "express";

import {
    firebaseUserAuth
} from "../middleware/auth.middleware.js";

import {
    secureDownloadUserBundle
} from "../controllers/secure-download.controller.js";


/* ==========================================================
   ROUTER
========================================================== */

const router =
    express.Router();


/* ==========================================================
   FIREBASE AUTHENTICATION
========================================================== */

router.use(
    firebaseUserAuth
);


/* ==========================================================
   SECURE DOWNLOAD

   GET
   /api/secure-download/:bundleId
========================================================== */

router.get(
    "/:bundleId",
    secureDownloadUserBundle
);


/* ==========================================================
   EXPORT
========================================================== */

export default router;