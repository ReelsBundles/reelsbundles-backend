import express from "express";

import {
    firebaseUserAuth
} from "../middleware/auth.middleware.js";

import {
    getUserBundles,
    listUserBundleFiles,
    downloadUserBundleFile,
    downloadUserBundle,
    openUserBundleMega,
    reportDevToolsViolation
} from "../controllers/user-bundle.controller.js";

const router = express.Router();

/* DevTools security report endpoint */
router.post(
    "/report-devtools",
    reportDevToolsViolation
);

/* Apply auth middleware to specific bundle endpoints only, so public endpoints under /api/user are not blocked */

/* User library */
router.get(
    "/bundles",
    firebaseUserAuth,
    getUserBundles
);

/* Secure root/nested folder browser */
router.get(
    "/bundles/:bundleId/files",
    firebaseUserAuth,
    listUserBundleFiles
);

/* Secure server-side file stream */
router.get(
    "/bundles/:bundleId/file/:fileId",
    firebaseUserAuth,
    downloadUserBundleFile
);

/* Secure MEGA cloud link redirect */
router.get(
    "/bundles/:bundleId/mega",
    firebaseUserAuth,
    openUserBundleMega
);

/* Legacy compatibility endpoint */
router.get(
    "/bundles/:bundleId/download",
    firebaseUserAuth,
    downloadUserBundle
);

export default router;
