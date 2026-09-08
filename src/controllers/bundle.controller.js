import {
    getBundles,
    getBundle,
    createBundle,
    createBulkBundles,
    updateBundle,
    deleteBundle,
    deleteAllBundles,
    toggleBundle,
    getBundleStats,
    searchBundles,
    getPublicActiveBundles
} from "../services/bundle.service.js";

import {
    validateBundle
} from "../validators/bundle.validator.js";

function formatErrorMessage(err) {
    const msg = String(err?.message || err || "Internal server error");
    if (
        msg.includes("16 UNAUTHENTICATED") ||
        msg.includes("OAuth 2") ||
        msg.includes("invalid_grant") ||
        msg.includes("UNAUTHENTICATED")
    ) {
        return "Database service authentication unavailable. Operating in resilient storage mode.";
    }
    return msg;
}

/* ===========================================
   GET ALL
========================================== */

export async function listBundles(req, res) {

    try {

        const bundles =
            await getBundles();

        return res.json({

            success: true,

            bundles

        });

    }

  catch (err) {

    console.error("Bundle Error:", err);

    return res.status(500).json({
        success: false,
        message: formatErrorMessage(err)
    });

}

}

/* ===========================================
   GET ONE
=========================================== */

export async function getSingleBundle(req, res) {

    try {

        const bundle =
            await getBundle(
                req.params.id
            );

        if (!bundle) {

            return res.status(404).json({

                success: false,

                message:
                    "Bundle not found."

            });

        }

        return res.json({

            success: true,

            bundle

        });

    }

catch (err) {

    console.error("Bundle Error:", err);

    return res.status(500).json({
        success: false,
        message: formatErrorMessage(err)
    });

}
}

/* ===========================================
   CREATE
=========================================== */

export async function addBundle(req, res) {

    try {

        const errors =
            validateBundle(req.body);

        if (errors.length) {

            return res.status(400).json({

                success: false,

                errors

            });

        }

        const bundle =
            await createBundle(
                req.body
            );

        return res.status(201).json({

            success: true,

            bundle

        });

    }

catch (err) {

    console.error("Bundle Error:", err);

    return res.status(500).json({
        success: false,
        message: formatErrorMessage(err)
    });

}
}

/* ===========================================
   UPDATE
=========================================== */

export async function editBundle(req, res) {

    try {

        const errors =
            validateBundle(req.body);

        if (errors.length) {

            return res.status(400).json({

                success: false,

                errors

            });

        }

        const bundle =
            await updateBundle(

                req.params.id,

                req.body

            );

        return res.json({

            success: true,

            bundle

        });

    }

catch (err) {

    console.error("Bundle Error:", err);

    return res.status(500).json({
        success: false,
        message: formatErrorMessage(err)
    });

}

}
/* ===========================================
   DELETE
=========================================== */

export async function removeBundle(req, res) {

    try {

        await deleteBundle(
            req.params.id
        );

        return res.json({

            success: true,

            message:
                "Bundle deleted successfully."

        });

    }

catch (err) {

    console.error("Bundle Error:", err);

    return res.status(500).json({
        success: false,
        message: formatErrorMessage(err)
    });

}
}

/* ===========================================
   TOGGLE ACTIVE
=========================================== */

export async function toggleBundleStatus(req, res) {

    try {

        const active =
            await toggleBundle(
                req.params.id
            );

        return res.json({

            success: true,

            active

        });

    }

 catch (err) {

    console.error("Bundle Error:", err);

    return res.status(500).json({
        success: false,
        message: formatErrorMessage(err)
    });

}

}

/* ===========================================
   SEARCH
=========================================== */

export async function searchBundle(req, res) {

    try {

        const keyword =
            req.query.q || "";

        const bundles =
            await searchBundles(
                keyword
            );

        return res.json({

            success: true,

            bundles

        });

    }

  catch (err) {

    console.error("Bundle Error:", err);

    return res.status(500).json({
        success: false,
        message: formatErrorMessage(err)
    });

}

}

/* ===========================================
   DASHBOARD STATS
=========================================== */

export async function bundleStats(req, res) {

    try {

        const stats =
            await getBundleStats();

        return res.json({

            success: true,

            stats

        });

    }

    catch (err) {

    console.error("Bundle Error:", err);

    return res.status(500).json({
        success: false,
        message: formatErrorMessage(err)
    });

}

}
/* ==========================================================
   PUBLIC ACTIVE BUNDLES
========================================================== */

export async function listPublicBundles(
    req,
    res
) {

    try {

        const bundles =
            await getPublicActiveBundles();


        return res.json({

            success: true,

            bundles

        });

    }

    catch (error) {

        console.error(
            "PUBLIC BUNDLE ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Unable to load bundles."

        });

    }

}

/* ===========================================
   BULK CREATE
=========================================== */
export async function addBulkBundles(req, res) {
    try {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No items provided for bulk creation."
            });
        }

        const result = await createBulkBundles(items);
        return res.json({
            success: true,
            message: `Successfully created ${result.createdCount} bundles. ${result.skippedCount > 0 ? `${result.skippedCount} skipped.` : ""}`,
            result
        });
    } catch (err) {
        console.error("Bulk Bundle Creation Error:", err);
        return res.status(500).json({
            success: false,
            message: formatErrorMessage(err)
        });
    }
}

/* ===========================================
   REMOVE ALL
=========================================== */
export async function removeAllBundles(req, res) {
    try {
        const result = await deleteAllBundles();
        return res.json({
            success: true,
            message: `Successfully deleted all ${result.deletedCount} bundles.`,
            deletedCount: result.deletedCount
        });
    } catch (err) {
        console.error("Remove All Bundles Error:", err);
        return res.status(500).json({
            success: false,
            message: formatErrorMessage(err)
        });
    }
}