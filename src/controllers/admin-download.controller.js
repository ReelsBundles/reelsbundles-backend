import { db } from "../config/firebase.js";


/* ==========================================================
   ADMIN DOWNLOAD LOGS
   ----------------------------------------------------------
   Combines:

   download_logs
        +
   payments

   So Admin gets:

   Customer Name
   Email
   Phone
   Order ID
   Amount
   Payment Status
   Plan
   Bundle
   Download Count
   IP
   User Agent
   Date
========================================================== */


/* ==========================================================
   HELPERS
========================================================== */

function normalizeText(value) {

    return String(
        value ?? ""
    )
        .trim()
        .toLowerCase();

}


function toNumber(value) {

    const number =
        Number(value);


    return Number.isFinite(
        number
    )
        ? number
        : 0;

}


/* ==========================================================
   GET ADMIN DOWNLOADS
========================================================== */

export const getAdminDownloads = async (
    req,
    res
) => {

    try {

        /* --------------------------------------------------
           QUERY PARAMETERS
        -------------------------------------------------- */

        const {
            page = 1,
            limit = 20,
            search = "",
            plan = "",
            status = ""
        } = req.query;


        const currentPage =
            Math.max(
                Number(page) || 1,
                1
            );


        const perPage =
            Math.min(
                Math.max(
                    Number(limit) || 20,
                    1
                ),
                100
            );


        /* --------------------------------------------------
           GET DOWNLOAD LOGS
        -------------------------------------------------- */

        const downloadSnapshot =
            await db
                .collection(
                    "download_logs"
                )
                .orderBy(
                    "createdAt",
                    "desc"
                )
                .get();


        /* --------------------------------------------------
           GET PAYMENTS
        --------------------------------------------------

           Payment records already contain:

           customerName
           customerEmail
           customerPhone
           amount
           paymentStatus
           orderId

           These are created during payment verification.
        -------------------------------------------------- */

        const paymentSnapshot =
            await db
                .collection(
                    "payments"
                )
                .get();


        /* --------------------------------------------------
           CREATE PAYMENT MAP
        -------------------------------------------------- */

        const paymentsByOrderId =
            new Map();


        paymentSnapshot.forEach(
            doc => {

                const payment =
                    doc.data() || {};


                const paymentOrderId =
                    payment.orderId ||
                    payment.order_id ||
                    doc.id;


                if (
                    paymentOrderId
                ) {

                    paymentsByOrderId.set(
                        String(
                            paymentOrderId
                        ),
                        {

                            id:
                                doc.id,

                            ...payment

                        }
                    );

                }

            }
        );


        /* --------------------------------------------------
           BUILD DOWNLOAD RECORDS
        -------------------------------------------------- */

        let downloads = [];


        downloadSnapshot.forEach(
            doc => {

                const log =
                    doc.data() || {};


                const orderId =
                    log.orderId ||
                    log.order_id ||
                    null;


                const payment =
                    orderId
                        ? paymentsByOrderId.get(
                            String(
                                orderId
                            )
                        ) || {}
                        : {};


                /*
                 * Payment data is authoritative
                 * for customer information.
                 */

                const customerName =
                    payment.customerName ||
                    payment.customer_name ||
                    payment.customer_details
                        ?.customer_name ||
                    log.customerName ||
                    "Customer";


                const customerEmail =
                    payment.customerEmail ||
                    payment.customer_email ||
                    payment.customer_details
                        ?.customer_email ||
                    log.customerEmail ||
                    "";


                const customerPhone =
                    payment.customerPhone ||
                    payment.customer_phone ||
                    payment.customer_details
                        ?.customer_phone ||
                    log.customerPhone ||
                    "";


                const amount =
                    payment.amount ??
                    payment.order_amount ??
                    payment.orderAmount ??
                    log.amount ??
                    0;


                const paymentStatus =
                    payment.paymentStatus ||
                    payment.payment_status ||
                    payment.status ||
                    log.paymentStatus ||
                    log.status ||
                    "UNKNOWN";


                const purchasedPlan =
                    payment.bundlePlan ||
                    payment.bundle_plan ||
                    payment.plan ||
                    log.plan ||
                    "";


                const downloadCount =
                    toNumber(
                        payment.downloadCount ??
                        0
                    );


                const maxDownloads =
                    toNumber(
                        payment.maxDownloads ??
                        1
                    );


                downloads.push({

                    /* --------------------------------------
                       DOWNLOAD
                    -------------------------------------- */

                    id:
                        doc.id,

                    orderId,

                    downloadId:
                        doc.id,

                    status:
                        log.status ||
                        "UNKNOWN",

                    downloadDate:
                        log.createdAt ||
                        null,


                    /* --------------------------------------
                       CUSTOMER
                    -------------------------------------- */

                    customerName,

                    email:
                        customerEmail,

                    phone:
                        customerPhone,


                    /* --------------------------------------
                       PURCHASE
                    -------------------------------------- */

                    amount,

                    currency:
                        payment.currency ||
                        "INR",

                    paymentStatus,

                    plan:
                        normalizeText(
                            purchasedPlan
                        ) || null,

                    bundleId:
                        log.bundleId ||
                        null,

                    bundleName:
                        log.bundleName ||
                        null,

                    category:
                        log.category ||
                        null,


                    /* --------------------------------------
                       DOWNLOAD USAGE
                    -------------------------------------- */

                    downloadCount,

                    maxDownloads,

                    downloadsRemaining:
                        Math.max(
                            maxDownloads -
                            downloadCount,
                            0
                        ),


                    /* --------------------------------------
                       TECHNICAL
                    -------------------------------------- */

                    ip:
                        log.ip ||
                        "Unknown",

                    userAgent:
                        log.userAgent ||
                        "Unknown",

                    createdAt:
                        log.createdAt ||
                        null

                });

            }
        );


        /* --------------------------------------------------
           INCLUDE PAYMENTS WITHOUT DOWNLOAD LOGS
        -------------------------------------------------- */

        const loggedOrderIds = new Set(
            downloads.map(d => String(d.orderId || ""))
        );

        paymentsByOrderId.forEach((payment, orderId) => {
            if (!loggedOrderIds.has(String(orderId))) {
                const customerName =
                    payment.customerName ||
                    payment.customer_name ||
                    payment.customer_details?.customer_name ||
                    payment.name ||
                    "Customer";

                const customerEmail =
                    payment.customerEmail ||
                    payment.customer_email ||
                    payment.customer_details?.customer_email ||
                    payment.email ||
                    "";

                const customerPhone =
                    payment.customerPhone ||
                    payment.customer_phone ||
                    payment.customer_details?.customer_phone ||
                    payment.phone ||
                    "";

                const amount =
                    payment.amount ??
                    payment.order_amount ??
                    payment.orderAmount ??
                    0;

                const paymentStatus =
                    payment.paymentStatus ||
                    payment.payment_status ||
                    payment.status ||
                    "PAID";

                const purchasedPlan =
                    payment.bundlePlan ||
                    payment.bundle_plan ||
                    payment.plan ||
                    "premium";

                downloads.push({
                    id: payment.id || orderId,
                    orderId: orderId,
                    downloadId: null,
                    status: "ACTIVE",
                    downloadDate: payment.createdAt || payment.updatedAt || null,
                    customerName,
                    email: customerEmail,
                    phone: customerPhone,
                    amount,
                    currency: payment.currency || "INR",
                    paymentStatus,
                    plan: normalizeText(purchasedPlan) || "premium",
                    bundleId: null,
                    bundleName: "Purchased Access",
                    category: purchasedPlan,
                    downloadCount: payment.downloadCount || 0,
                    maxDownloads: payment.maxDownloads || 1,
                    downloadsRemaining: 1,
                    ip: "N/A",
                    userAgent: "N/A",
                    createdAt: payment.createdAt || payment.updatedAt || null
                });
            }
        });


        /* ==================================================
           SEARCH
        ================================================== */

        const searchValue =
            normalizeText(
                search
            );


        if (
            searchValue
        ) {

            downloads =
                downloads.filter(
                    item => {

                        return (

                            normalizeText(
                                item.customerName
                            ).includes(
                                searchValue
                            )

                            ||

                            normalizeText(
                                item.email
                            ).includes(
                                searchValue
                            )

                            ||

                            normalizeText(
                                item.phone
                            ).includes(
                                searchValue
                            )

                            ||

                            normalizeText(
                                item.orderId
                            ).includes(
                                searchValue
                            )

                            ||

                            normalizeText(
                                item.bundleName
                            ).includes(
                                searchValue
                            )

                            ||

                            normalizeText(
                                item.ip
                            ).includes(
                                searchValue
                            )

                        );

                    }
                );

        }


        /* ==================================================
           PLAN FILTER
        ================================================== */

        if (
            plan
        ) {

            const selectedPlan =
                normalizeText(
                    plan
                );


            downloads =
                downloads.filter(
                    item => {

                        return (
                            normalizeText(
                                item.plan
                            ) ===
                            selectedPlan
                        );

                    }
                );

        }


        /* ==================================================
           STATUS FILTER
        ================================================== */

        if (
            status
        ) {

            const selectedStatus =
                normalizeText(
                    status
                );


            downloads =
                downloads.filter(
                    item => {

                        return (
                            normalizeText(
                                item.status
                            ) ===
                            selectedStatus
                        );

                    }
                );

        }


        /* ==================================================
           TOTAL
        ================================================== */

        const total =
            downloads.length;


        const totalPages =
            total === 0
                ? 0
                : Math.ceil(
                    total /
                    perPage
                );


        /* ==================================================
           SAFE PAGE
        ================================================== */

        const safePage =
            totalPages > 0
                ? Math.min(
                    currentPage,
                    totalPages
                )
                : 1;


        /* ==================================================
           PAGINATION
        ================================================== */

        const startIndex =
            (
                safePage -
                1
            ) *
            perPage;


        const paginatedDownloads =
            downloads.slice(
                startIndex,
                startIndex +
                perPage
            );


        /* ==================================================
           SUMMARY
        ================================================== */

        const successfulDownloads =
            downloads.filter(
                item =>
                    normalizeText(
                        item.status
                    ) ===
                    "success"
            ).length;


        const basicDownloads =
            downloads.filter(
                item =>
                    normalizeText(
                        item.plan
                    ) ===
                    "basic"
            ).length;


        const premiumDownloads =
            downloads.filter(
                item =>
                    normalizeText(
                        item.plan
                    ) ===
                    "premium"
            ).length;


        /* ==================================================
           RESPONSE
        ================================================== */

        return res.status(
            200
        ).json({

            success:
                true,

            downloads:
                paginatedDownloads,

            pagination: {

                page:
                    safePage,

                limit:
                    perPage,

                total,

                totalPages

            },

            summary: {

                totalDownloads:
                    total,

                successfulDownloads,

                basicDownloads,

                premiumDownloads

            }

        });

    } catch (
        error
    ) {

        console.error(
            "[Admin Downloads] Error:",
            error
        );


        return res.status(
            500
        ).json({

            success:
                false,

            message:
                error?.message ||
                "Unable to load download records."

        });

    }

};
/* ==========================================================
   DELETE SINGLE DOWNLOAD
   Deletes ONLY download_logs record.
   Payment / order is NOT deleted.
========================================================== */

export const deleteAdminDownload = async (
    req,
    res
) => {

    try {

        const downloadId =
            String(
                req.params.downloadId ||
                ""
            ).trim();


        if (!downloadId) {

            return res.status(400).json({

                success: false,

                message:
                    "Download ID is required."

            });

        }


        await db
            .collection("download_logs")
            .doc(downloadId)
            .delete();


        return res.status(200).json({

            success: true,

            message:
                "Download record deleted successfully."

        });

    } catch (error) {

        console.error(
            "[Admin Downloads] Delete error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                error?.message ||
                "Failed to delete download."

        });

    }

};


/* ==========================================================
   DELETE ALL DOWNLOADS
   Deletes ONLY download_logs.
   Payments / orders are NOT deleted.
========================================================== */

export const deleteAllAdminDownloads = async (
    req,
    res
) => {

    try {

        const snapshot =
            await db
                .collection("download_logs")
                .get();


        if (
            snapshot.empty
        ) {

            return res.status(200).json({

                success: true,

                deletedCount: 0,

                message:
                    "No download records found."

            });

        }


        /*
         * Firestore batch supports a maximum
         * of 500 writes per batch.
         */

        const docs =
            snapshot.docs;


        let deletedCount = 0;


        for (
            let i = 0;
            i < docs.length;
            i += 500
        ) {

            const batch =
                db.batch();


            const chunk =
                docs.slice(
                    i,
                    i + 500
                );


            chunk.forEach(
                doc => {

                    batch.delete(
                        doc.ref
                    );

                }
            );


            await batch.commit();


            deletedCount +=
                chunk.length;

        }


        return res.status(200).json({

            success: true,

            deletedCount,

            message:
                `${deletedCount} download record(s) deleted successfully.`

        });

    } catch (error) {

        console.error(
            "[Admin Downloads] Delete all error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                error?.message ||
                "Failed to delete all downloads."

        });

    }

};