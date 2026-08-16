import express from "express";


import {
    downloadBundle,
    getBundleInfo
} from "../controllers/download.controller.js";


const router =
    express.Router();


/* ==========================================================
   BUNDLE INFO
==========================================================

   GET:

   /api/download/bundle-info?token=XXXXX

   IMPORTANT:

   This route MUST stay BEFORE /:token.

   Otherwise Express can treat:

   /bundle-info

   as:

   /:token

========================================================== */

router.get(
    "/bundle-info",
    getBundleInfo
);


/* ==========================================================
   SECURE DOWNLOAD
==========================================================

   GET:

   /api/download/:token

========================================================== */

router.get(
    "/:token",
    downloadBundle
);


/* ==========================================================
   SECURE CATEGORY DOWNLOAD
==========================================================

   GET:

   /api/download/:token/:category

   Examples:

   /api/download/TOKEN/basic
   /api/download/TOKEN/premium
   /api/download/TOKEN/page-1

========================================================== */

router.get(
    "/:token/:category",
    downloadBundle
);


/* ==========================================================
   EXPORT
========================================================== */

export default router;