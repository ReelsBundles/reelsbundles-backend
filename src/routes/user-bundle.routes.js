import express from "express";

import {
    firebaseUserAuth
} from "../middleware/auth.middleware.js";

import {
    getUserBundles,
    listUserBundleFiles,
    downloadUserBundleFile,
    downloadUserBundle
} from "../controllers/user-bundle.controller.js";

const router = express.Router();

router.use(firebaseUserAuth);

/* User library */
router.get(
    "/bundles",
    getUserBundles
);

/* Secure root/nested folder browser */
router.get(
    "/bundles/:bundleId/files",
    listUserBundleFiles
);

/* Secure server-side file stream */
router.get(
    "/bundles/:bundleId/file/:fileId",
    downloadUserBundleFile
);

/* Legacy compatibility endpoint */
router.get(
    "/bundles/:bundleId/download",
    downloadUserBundle
);

export default router;
