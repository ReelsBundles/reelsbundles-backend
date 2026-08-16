import express from "express";

import {
    listPublicBundles
} from "../controllers/bundle.controller.js";


const router =
    express.Router();


/* ==========================================================
   PUBLIC ACTIVE BUNDLE CATALOG
==========================================================

   Only safe display information.

   NO Google Drive file IDs.
   NO secure download tokens.
========================================================== */

router.get(
    "/",
    listPublicBundles
);


export default router;