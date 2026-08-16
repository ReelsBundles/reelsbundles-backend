import {
    db
} from "../config/firebase.js";


/* ==========================================================
   SAVE DOWNLOAD LOG
========================================================== */

export async function saveDownloadLog(
    logData
) {

    if (!logData) {

        throw new Error(
            "Download log data is required."
        );

    }


    const log = {

        orderId:
            logData.orderId ||
            null,

        category:
            logData.category ||
            null,

        plan:
            logData.plan ||
            null,

        bundleId:
            logData.bundleId ||
            null,

        bundleName:
            logData.bundleName ||
            null,

        ip:
            logData.ip ||
            "Unknown",

        userAgent:
            logData.userAgent ||
            "Unknown",

        status:
            logData.status ||
            "SUCCESS",

        createdAt:
            new Date()

    };


    await db
        .collection(
            "download_logs"
        )
        .add(
            log
        );


    return true;

}
/* ==========================================================
   ADMIN DOWNLOAD LIST
   NEW FUNCTION — EXISTING CODE UNCHANGED
========================================================== */

export async function getAdminDownloads(options = {}) {

    const {
        page = 1,
        limit = 20,
        search = "",
        plan = "",
        status = ""
    } = options;


    const currentPage =
        Math.max(
            Number(page) || 1,
            1
        );


    const currentLimit =
        Math.min(
            Math.max(
                Number(limit) || 20,
                1
            ),
            100
        );


    /* ------------------------------------------------------
       DOWNLOAD LOGS
    ------------------------------------------------------ */

    const logSnapshot =
        await db
            .collection("download_logs")
            .get();


    const logs = [];


    logSnapshot.forEach((doc) => {

        logs.push({

            id: doc.id,

            ...doc.data()

        });

    });


    /* ------------------------------------------------------
       PAYMENTS
       Used for customer/order information
    ------------------------------------------------------ */

    const paymentSnapshot =
        await db
            .collection("payments")
            .get();


    const payments = {};


    paymentSnapshot.forEach((doc) => {

        const data =
            doc.data() || {};


        const orderId =
            data.orderId ||
            doc.id;


        payments[
            String(orderId)
        ] = {

            ...data,

            documentId:
                doc.id

        };

    });


    /* ------------------------------------------------------
       MERGE DOWNLOAD LOG + PAYMENT
    ------------------------------------------------------ */

    let downloads =
        logs.map((log) => {

            const payment =
                payments[
                    String(
                        log.orderId || ""
                    )
                ] || {};


            return {

                id:
                    log.id,

                customerName:
                    payment.customerName ||
                    payment.fullName ||
                    payment.name ||
                    "Customer",

                email:
                    payment.email ||
                    "—",

                phone:
                    payment.phone ||
                    payment.customerPhone ||
                    "—",

                orderId:
                    log.orderId ||
                    payment.orderId ||
                    "—",

                amount:
                    Number(
                        payment.amount ||
                        0
                    ),

                plan:
                    String(
                        log.plan ||
                        payment.plan ||
                        payment.bundlePlan ||
                        ""
                    )
                        .trim()
                        .toLowerCase(),

                bundleName:
                    log.bundleName ||
                    "—",

                bundleId:
                    log.bundleId ||
                    null,

                paymentStatus:
                    String(
                        payment.paymentStatus ||
                        "PAID"
                    )
                        .trim()
                        .toUpperCase(),

                status:
                    String(
                        log.status ||
                        "SUCCESS"
                    )
                        .trim()
                        .toUpperCase(),

                downloadCount:
                    Number(
                        payment.downloadCount ||
                        0
                    ),

                maxDownloads:
                    Number(
                        payment.maxDownloads ||
                        1
                    ),

                category:
                    log.category ||
                    "—",

                ip:
                    log.ip ||
                    "Unknown",

                userAgent:
                    log.userAgent ||
                    "Unknown",

                downloadDate:
                    log.createdAt ||
                    null,

                createdAt:
                    log.createdAt ||
                    null

            };

        });


    /* ------------------------------------------------------
       SEARCH
    ------------------------------------------------------ */

    const keyword =
        String(search || "")
            .trim()
            .toLowerCase();


    if (keyword) {

        downloads =
            downloads.filter(
                (item) => {

                    return (

                        String(
                            item.customerName
                        )
                            .toLowerCase()
                            .includes(keyword)

                        ||

                        String(
                            item.email
                        )
                            .toLowerCase()
                            .includes(keyword)

                        ||

                        String(
                            item.phone
                        )
                            .toLowerCase()
                            .includes(keyword)

                        ||

                        String(
                            item.orderId
                        )
                            .toLowerCase()
                            .includes(keyword)

                    );

                }
            );

    }


    /* ------------------------------------------------------
       PLAN FILTER
    ------------------------------------------------------ */

    const selectedPlan =
        String(plan || "")
            .trim()
            .toLowerCase();


    if (selectedPlan) {

        downloads =
            downloads.filter(
                (item) =>
                    item.plan ===
                    selectedPlan
            );

    }


    /* ------------------------------------------------------
       STATUS FILTER
    ------------------------------------------------------ */

    const selectedStatus =
        String(status || "")
            .trim()
            .toUpperCase();


    if (selectedStatus) {

        downloads =
            downloads.filter(
                (item) =>
                    item.status ===
                    selectedStatus
            );

    }


    /* ------------------------------------------------------
       NEWEST FIRST
    ------------------------------------------------------ */

    downloads.sort(
        (a, b) => {

            return (
                getDownloadDate(
                    b.createdAt
                ) -
                getDownloadDate(
                    a.createdAt
                )
            );

        }
    );


    /* ------------------------------------------------------
       SUMMARY
    ------------------------------------------------------ */

    const totalDownloads =
        downloads.length;


    const successfulDownloads =
        downloads.filter(
            (item) =>
                item.status ===
                "SUCCESS"
        ).length;


    const basicDownloads =
        downloads.filter(
            (item) =>
                item.plan ===
                "basic"
        ).length;


    const premiumDownloads =
        downloads.filter(
            (item) =>
                item.plan ===
                "premium"
        ).length;


    /* ------------------------------------------------------
       PAGINATION
    ------------------------------------------------------ */

    const total =
        downloads.length;


    const totalPages =
        Math.max(
            Math.ceil(
                total /
                currentLimit
            ),
            1
        );


    const start =
        (
            currentPage - 1
        ) *
        currentLimit;


    const result =
        downloads.slice(
            start,
            start +
            currentLimit
        );


    return {

        downloads:
            result,

        summary: {

            totalDownloads,

            successfulDownloads,

            basicDownloads,

            premiumDownloads

        },

        pagination: {

            page:
                currentPage,

            limit:
                currentLimit,

            total,

            totalPages,

            hasPrevious:
                currentPage > 1,

            hasNext:
                currentPage <
                totalPages

        }

    };

}


/* ==========================================================
   DATE HELPER
========================================================== */

function getDownloadDate(value) {

    if (!value) {
        return 0;
    }


    if (
        typeof value.toMillis ===
        "function"
    ) {

        return value.toMillis();

    }


    if (
        typeof value.seconds ===
        "number"
    ) {

        return (
            value.seconds *
            1000
        );

    }


    if (
        typeof value._seconds ===
        "number"
    ) {

        return (
            value._seconds *
            1000
        );

    }


    const parsed =
        new Date(value)
            .getTime();


    return Number.isNaN(parsed)
        ? 0
        : parsed;

}