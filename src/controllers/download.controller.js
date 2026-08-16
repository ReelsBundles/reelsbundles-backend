import {
    hashDownloadToken,
    isTokenExpired
} from "../utils/token.js";


import {
    getPaymentByTokenHash,
    updatePayment,
    lockDownload,
    unlockDownload
} from "../services/payment-storage.service.js";


import {
    getDownloadLink
} from "../services/download.service.js";


import {
    saveDownloadLog
} from "../services/download-log.service.js";

import {
    getBundlesByPlan
} from "../services/bundle.service.js";


/* ==========================================================
   RESOLVE PURCHASED PLAN
==========================================================

   Priority:

   1. payment.bundlePlan
   2. payment.plan
   3. payment.bundle_plan
   4. payment amount fallback

   IMPORTANT:

   Browser never decides the purchased plan.

========================================================== */

const resolvePurchasedPlan = (
    payment
) => {

    if (!payment) {

        return null;

    }


    let plan =
        String(
            payment.bundlePlan ||
            payment.plan ||
            payment.bundle_plan ||
            ""
        )
            .trim()
            .toLowerCase();


    if (
        plan === "basic" ||
        plan === "premium"
    ) {

        return plan;

    }


    /*
     * Fallback only.
     *
     * Existing payment pricing:
     *
     * ₹49  → Basic
     * ₹69  → Premium
     */

    const amount =
        Number(
            payment.amount ??
            payment.order_amount ??
            payment.orderAmount ??
            0
        );


    if (
        amount === 49
    ) {

        return "basic";

    }


    if (
        amount === 69
    ) {

        return "premium";

    }


    return null;

};


/* ==========================================================
   NORMALIZE PAYMENT STATUS
========================================================== */

const isPaymentPaid = (
    payment
) => {

    const status =
        String(
            payment?.paymentStatus ||
            payment?.payment_status ||
            payment?.status ||
            ""
        )
            .trim()
            .toUpperCase();


    return status === "PAID";

};


/* ==========================================================
   GET DOWNLOAD COUNT
========================================================== */

const getDownloadCount = (
    payment
) => {

    return (
        Number(
            payment?.downloadCount
        ) || 0
    );

};


/* ==========================================================
   GET DOWNLOAD LIMIT
========================================================== */

const getMaxDownloads = (
    payment
) => {

    const value =
        Number(
            payment?.maxDownloads
        );


    /*
     * Existing system expects at least
     * one allowed download.
     */

    if (
        !Number.isFinite(
            value
        ) ||
        value <= 0
    ) {

        return 1;

    }


    return value;

};


/* ==========================================================
   DOWNLOAD BUNDLE
==========================================================

   GET:

   /api/download/:token

   Optional:

   /api/download/:token/:category

========================================================== */

export const downloadBundle = async (
    req,
    res
) => {

    let lockedOrderId =
        null;


    try {

        /* --------------------------------------------------
           GET PARAMETERS
        -------------------------------------------------- */

        const {
            token,
            category
        } = req.params;


        /* --------------------------------------------------
           TOKEN REQUIRED
        -------------------------------------------------- */

        if (!token) {

            return res.status(400).json({

                success:
                    false,

                message:
                    "Download token is required."

            });

        }


        /* --------------------------------------------------
           HASH TOKEN
        -------------------------------------------------- */

        const tokenHash =
            hashDownloadToken(
                token
            );


        /* --------------------------------------------------
           FIND PAYMENT
        -------------------------------------------------- */

        const payment =
            await getPaymentByTokenHash(
                tokenHash
            );


        if (!payment) {

            return res.status(404).json({

                success:
                    false,

                message:
                    "Invalid download token."

            });

        }


        /* --------------------------------------------------
           CHECK EXPIRY
        -------------------------------------------------- */

        if (
            !payment.expiresAt
        ) {

            return res.status(410).json({

                success:
                    false,

                message:
                    "Download link has expired."

            });

        }


        if (
            isTokenExpired(
                payment.expiresAt
            )
        ) {

            return res.status(410).json({

                success:
                    false,

                message:
                    "Download link expired."

            });

        }


        /* --------------------------------------------------
           CHECK PAYMENT
        -------------------------------------------------- */

        if (
            !isPaymentPaid(
                payment
            )
        ) {

            return res.status(403).json({

                success:
                    false,

                message:
                    "Payment not completed."

            });

        }


        /* --------------------------------------------------
           RESOLVE PURCHASED PLAN
        -------------------------------------------------- */

        const plan =
            resolvePurchasedPlan(
                payment
            );


        if (!plan) {

            return res.status(403).json({

                success:
                    false,

                message:
                    "Purchased bundle plan could not be determined."

            });

        }


        console.log(
            "[Download Controller] Purchased plan:",
            plan
        );


        /* --------------------------------------------------
           DOWNLOAD COUNT
        -------------------------------------------------- */

        const downloadCount =
            getDownloadCount(
                payment
            );


        const maxDownloads =
            getMaxDownloads(
                payment
            );


        /* --------------------------------------------------
           DOWNLOAD LIMIT
        -------------------------------------------------- */

        if (
            downloadCount >=
            maxDownloads
        ) {

            return res.status(403).json({

                success:
                    false,

                message:
                    "Download limit reached."

            });

        }


        /* --------------------------------------------------
           EXISTING LOCK
        -------------------------------------------------- */

        if (
            payment.downloadLock
        ) {

            return res.status(429).json({

                success:
                    false,

                message:
                    "Download already in progress."

            });

        }


        /* --------------------------------------------------
           GET LIVE ADMIN BUNDLE
        --------------------------------------------------

           The download service reads only ACTIVE bundles.

           Admin controls which bundle is live.

        -------------------------------------------------- */

        const result =
            await getDownloadLink(
                category,
                plan
            );


        if (
            !result ||
            result.success !== true
        ) {

            return res.status(
                result?.status ||
                500
            ).json({

                success:
                    false,

                message:
                    result?.message ||
                    "Unable to prepare download."

            });

        }


        /* --------------------------------------------------
           DOWNLOAD LOCK
        -------------------------------------------------- */

        await lockDownload(
            payment.orderId
        );


        lockedOrderId =
            payment.orderId;


        /* --------------------------------------------------
           UPDATE DOWNLOAD COUNT
        -------------------------------------------------- */

        await updatePayment(
            payment.orderId,
            {

                downloadCount:
                    downloadCount + 1

            }
        );


        /* --------------------------------------------------
           SAVE DOWNLOAD LOG
        -------------------------------------------------- */

        await saveDownloadLog({

            orderId:
                payment.orderId,

            category:
                category ||
                null,

            plan,

            bundleId:
                result.bundle?.id ||
                null,

            bundleName:
                result.bundle?.name ||
                null,

            ip:
                req.headers[
                    "x-forwarded-for"
                ] ||
                req.socket?.remoteAddress ||
                "Unknown",

            userAgent:
                req.headers[
                    "user-agent"
                ] ||
                "Unknown",

            status:
                "SUCCESS"

        });


        /* --------------------------------------------------
           RELEASE LOCK
        --------------------------------------------------

           We already incremented the download count and
           prepared the final Drive URL.

           Therefore the temporary lock can be released
           before redirecting the browser.

        -------------------------------------------------- */

        try {

            await unlockDownload(
                payment.orderId
            );


            lockedOrderId =
                null;

        } catch (
            unlockError
        ) {

            console.error(
                "[Download Controller] Unlock error:",
                unlockError
            );

            /*
             * Do not block a valid download only because
             * lock cleanup failed.
             */

        }


        /* --------------------------------------------------
           REDIRECT TO GOOGLE DRIVE
        -------------------------------------------------- */

        return res.redirect(
            result.url
        );

    } catch (error) {

        console.error(
            "[Download Controller] Error:",
            error
        );


        /* --------------------------------------------------
           RELEASE LOCK AFTER ERROR
        -------------------------------------------------- */

        if (
            lockedOrderId
        ) {

            try {

                await unlockDownload(
                    lockedOrderId
                );

            } catch (
                unlockError
            ) {

                console.error(
                    "[Download Controller] Unlock error:",
                    unlockError
                );

            }

        }


        /* --------------------------------------------------
           ERROR RESPONSE
        -------------------------------------------------- */

        return res.status(500).json({

            success:
                false,

            message:
                error?.message ||
                "Unable to start download."

        });

    }

};


/* ==========================================================
   GET LIVE BUNDLE INFO
==========================================================

   Endpoint:

   GET /api/download/bundle-info?token=XXXXX

   IMPORTANT:

   This endpoint is for the DOWNLOAD PAGE.

   It returns LIVE ADMIN bundle information.

   It NEVER returns:

   - Google Drive URL
   - Google Drive file ID
   - encrypted Drive data

========================================================== */

export const getBundleInfo = async (
    req,
    res
) => {

    try {

        /* --------------------------------------------------
           GET TOKEN
        -------------------------------------------------- */

        const {
            token
        } = req.query;


        /* --------------------------------------------------
           TOKEN REQUIRED
        -------------------------------------------------- */

        if (!token) {

            return res.status(400).json({

                success:
                    false,

                message:
                    "Secure download token is required."

            });

        }


        /* --------------------------------------------------
           HASH TOKEN
        -------------------------------------------------- */

        const tokenHash =
            hashDownloadToken(
                token
            );


        /* --------------------------------------------------
           FIND PAYMENT
        -------------------------------------------------- */

        const payment =
            await getPaymentByTokenHash(
                tokenHash
            );


        if (!payment) {

            return res.status(404).json({

                success:
                    false,

                message:
                    "Invalid download token."

            });

        }


        /* --------------------------------------------------
           CHECK EXPIRY
        -------------------------------------------------- */

        if (
            !payment.expiresAt
        ) {

            return res.status(410).json({

                success:
                    false,

                message:
                    "Download link has expired."

            });

        }


        if (
            isTokenExpired(
                payment.expiresAt
            )
        ) {

            return res.status(410).json({

                success:
                    false,

                message:
                    "Download link has expired."

            });

        }


        /* --------------------------------------------------
           CHECK PAYMENT
        -------------------------------------------------- */

        if (
            !isPaymentPaid(
                payment
            )
        ) {

            return res.status(403).json({

                success:
                    false,

                message:
                    "Payment has not been completed."

            });

        }


        /* --------------------------------------------------
           RESOLVE PURCHASED PLAN
        --------------------------------------------------

           IMPORTANT:

           The browser does NOT send the plan.

           The payment record decides the plan.

        -------------------------------------------------- */

        const purchasedPlan =
            resolvePurchasedPlan(
                payment
            );


        if (!purchasedPlan) {

            return res.status(403).json({

                success:
                    false,

                message:
                    "Purchased bundle plan could not be determined."

            });

        }


        /* --------------------------------------------------
           DOWNLOAD USAGE
        --------------------------------------------------

           IMPORTANT:

           We DO NOT block bundle-info because of the
           download limit.

           The page should still be able to show the
           current live bundle and usage status.

           The actual download endpoint enforces the limit.

        -------------------------------------------------- */

        const currentDownloads =
            getDownloadCount(
                payment
            );


        const maxDownloads =
            getMaxDownloads(
                payment
            );


        /* --------------------------------------------------
           GET LIVE ADMIN BUNDLES
        --------------------------------------------------

           Admin controls active/inactive bundles.

           Only the purchased plan is loaded.

        -------------------------------------------------- */

        const bundles =
            await getBundlesByPlan(
                purchasedPlan
            );


        if (
            !Array.isArray(
                bundles
            ) ||
            bundles.length === 0
        ) {

            return res.status(404).json({

                success:
                    false,

                message:
                    `No active ${purchasedPlan} bundle is available.`

            });

        }


        /* --------------------------------------------------
           SAFE BUNDLE LIST
        --------------------------------------------------

           IMPORTANT:

           Drive file IDs are NOT sent to browser.

        -------------------------------------------------- */

        const safeBundles =
            bundles.map(
                bundle => {

                    const planData =
                        bundle[
                            purchasedPlan
                        ] || {};


                    return {

                        id:
                            bundle.id ||
                            null,

                        name:
                            bundle.name ||
                            "Reels Bundle",

                        slug:
                            bundle.slug ||
                            null,

                        page:
                            bundle.page ??
                            null,

                        plan:
                            purchasedPlan,

                        thumbnail:
                            bundle.thumbnail ||
                            bundle.thumbnailUrl ||
                            bundle.imageUrl ||
                            null,

                        title:
                            planData.title ||
                            bundle.title ||
                            `${purchasedPlan} Reels Bundle`

                    };

                }
            );


        /* --------------------------------------------------
           FIRST LIVE BUNDLE
        -------------------------------------------------- */

        const primaryBundle =
            safeBundles[0] ||
            null;


        /* --------------------------------------------------
           RESPONSE
        -------------------------------------------------- */

        return res.status(200).json({

            success:
                true,

            /*
             * Primary bundle.
             *
             * Useful for older frontend code.
             */

            bundle:
                primaryBundle,

            /*
             * Complete live list.
             *
             * Useful for the new download page.
             */

            bundles:
                safeBundles,

            /*
             * Payment information.
             */

            payment: {

                orderId:
                    payment.orderId ||
                    null,

                plan:
                    purchasedPlan,

                paymentStatus:
                    "PAID",

                downloadCount:
                    currentDownloads,

                maxDownloads:
                    maxDownloads

            },

            /*
             * Download access expiry.
             */

            expiresAt:
                payment.expiresAt

        });

    } catch (error) {

        console.error(
            "[Download Controller] Bundle info error:",
            error
        );


        return res.status(500).json({

            success:
                false,

            message:
                error?.message ||
                "Unable to load bundle information."

        });

    }

};


/* ==========================================================
   END OF FILE
========================================================== */