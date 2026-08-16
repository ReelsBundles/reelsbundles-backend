import express from "express";

import {

    listBundles,
    getSingleBundle,
    addBundle,
    addBulkBundles,
    editBundle,
    removeBundle,
    removeAllBundles,
    toggleBundleStatus,
    searchBundle,
    bundleStats

} from "../controllers/bundle.controller.js";

import {

    adminAuth

} from "../middleware/auth.middleware.js";

const router = express.Router();

/* ===========================================
   Bundle CRUD
=========================================== */

// GET ALL
router.get(
    "/",
    adminAuth,
    listBundles
);

// SEARCH
router.get(
    "/search",
    adminAuth,
    searchBundle
);

// DASHBOARD STATS
router.get(
    "/stats",
    adminAuth,
    bundleStats
);

// BULK CREATE
router.post(
    "/bulk",
    adminAuth,
    addBulkBundles
);

// DELETE ALL
router.delete(
    "/all",
    adminAuth,
    removeAllBundles
);

// GET SINGLE
router.get(
    "/:id",
    adminAuth,
    getSingleBundle
);

// CREATE
router.post(
    "/",
    adminAuth,
    addBundle
);

// UPDATE
router.put(
    "/:id",
    adminAuth,
    editBundle
);

// DELETE
router.delete(
    "/:id",
    adminAuth,
    removeBundle
);

// TOGGLE ACTIVE
router.patch(
    "/:id/toggle",
    adminAuth,
    toggleBundleStatus
);

export default router;