import express from "express";
import { adminAuth } from "../middleware/auth.middleware.js";

import {
    getAdminDownloads,
    deleteAdminDownload,
    deleteAllAdminDownloads,
    createAdminDownloadLog
} from "../controllers/admin-download.controller.js";


const router =
    express.Router();

router.use(adminAuth);


/* ==========================================================
   ADMIN DOWNLOAD LOGS
==========================================================

   GET:

   /api/admin/downloads

   Optional:

   ?page=1
   ?limit=20
   ?search=anime
   ?plan=basic
   ?status=SUCCESS

========================================================== */

router.get(
    "/",
    getAdminDownloads
);

/* ==========================================================
   DELETE SINGLE DOWNLOAD

   DELETE /api/admin/downloads/:downloadId
========================================================== */

router.delete(
    "/:downloadId",
    deleteAdminDownload
);


/* ==========================================================
   DELETE ALL DOWNLOADS

   DELETE /api/admin/downloads
========================================================== */

router.delete(
    "/",
    deleteAllAdminDownloads
);

/* ==========================================================
   EXPORT
========================================================== */

export default router;