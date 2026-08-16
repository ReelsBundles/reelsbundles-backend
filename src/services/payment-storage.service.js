import { db } from "../config/firebase.js";


/* ==========================================================
   SAVE PAYMENT
========================================================== */

export async function savePayment(
    paymentData
) {

    if (
        !paymentData ||
        !paymentData.orderId
    ) {

        throw new Error(
            "Payment order ID is required."
        );

    }


    await db
        .collection("payments")
        .doc(paymentData.orderId)
        .set(
            paymentData,
            {
                merge: true
            }
        );


    return true;

}


/* ==========================================================
   GET PAYMENT BY ORDER ID
========================================================== */

export async function getPayment(
    orderId
) {

    if (!orderId) {

        return null;

    }


    const doc =
        await db
            .collection("payments")
            .doc(orderId)
            .get();


    if (!doc.exists) {

        return null;

    }


    return {

        id:
            doc.id,

        ...doc.data()

    };

}


/* ==========================================================
   UPDATE PAYMENT
========================================================== */

export async function updatePayment(
    orderId,
    data
) {

    if (!orderId) {

        throw new Error(
            "Payment order ID is required."
        );

    }


    await db
        .collection("payments")
        .doc(orderId)
        .set(
            data,
            {
                merge: true
            }
        );


    return true;

}


/* ==========================================================
   DELETE PAYMENT
========================================================== */

export async function deletePayment(
    orderId
) {

    if (!orderId) {

        return false;

    }


    await db
        .collection("payments")
        .doc(orderId)
        .delete();


    return true;

}


/* ==========================================================
   GET PAYMENT BY DOWNLOAD TOKEN HASH
========================================================== */

export async function getPaymentByTokenHash(
    tokenHash
) {

    if (!tokenHash) {

        return null;

    }


    const snapshot =
        await db
            .collection("payments")
            .where(
                "downloadTokenHash",
                "==",
                tokenHash
            )
            .limit(1)
            .get();


    if (snapshot.empty) {

        return null;

    }


    const doc =
        snapshot.docs[0];


    return {

        id:
            doc.id,

        ...doc.data()

    };

}


/* ==========================================================
   LOCK DOWNLOAD
========================================================== */

export async function lockDownload(
    orderId
) {

    await updatePayment(

        orderId,

        {

            downloadLock:
                true,

            updatedAt:
                new Date()

        }

    );

}


/* ==========================================================
   UNLOCK DOWNLOAD
========================================================== */

export async function unlockDownload(
    orderId
) {

    await updatePayment(

        orderId,

        {

            downloadLock:
                false,

            updatedAt:
                new Date()

        }

    );

}


/* ==========================================================
   GET USER ENTITLEMENT
==========================================================

   Firebase UID
        ↓
   payments collection
        ↓
   PAID payments only
        ↓
   BASIC / PREMIUM
        ↓
   effective plan
========================================================== */

export async function getUserEntitlement(
    userUid
) {

    if (!userUid) {

        return {

            plan:
                "free",

            lifetimeAccess:
                false,

            purchases:
                []

        };

    }


    const snapshot =
        await db
            .collection("payments")
            .where(
                "userUid",
                "==",
                userUid
            )
            .get();


    const purchases = [];

    let effectivePlan =
        "free";


    snapshot.forEach(
        (doc) => {

            const data =
                doc.data() || {};


            const status =
                String(
                    data.paymentStatus ||
                    data.payment_status ||
                    data.status ||
                    ""
                )
                    .trim()
                    .toUpperCase();


            /*
             * Only valid paid payments unlock access.
             */
            const isPaidStatus = [
                "PAID",
                "ACTIVE",
                "SUCCESS",
                "SUCCESSFUL",
                "COMPLETED"
            ].includes(status);

            if (!isPaidStatus) {
                return;
            }


            const bundlePlan =
                String(
                    data.bundlePlan ||
                    data.bundle_plan ||
                    data.plan ||
                    ""
                )
                    .trim()
                    .toLowerCase();


            if (
                bundlePlan !== "basic" &&
                bundlePlan !== "premium"
            ) {

                return;

            }


            /*
             * Premium automatically
             * includes Basic.
             */

            if (
                bundlePlan ===
                "premium"
            ) {

                effectivePlan =
                    "premium";

            }

            else if (
                effectivePlan ===
                "free"
            ) {

                effectivePlan =
                    "basic";

            }


            purchases.push({

                orderId:
                    data.orderId ||
                    doc.id,

                bundlePlan,

                amount:
                    Number(
                        data.amount || 0
                    ),

                paymentStatus:
                    "PAID",

                createdAt:
                    data.createdAt ||
                    null,

                paidAt:
                    data.paidAt ||
                    data.updatedAt ||
                    null

            });

        }
    );


    purchases.sort(
        (a, b) => {

            const timeA =
                timestampValue(
                    a.paidAt ||
                    a.createdAt
                );

            const timeB =
                timestampValue(
                    b.paidAt ||
                    b.createdAt
                );


            return (
                timeB -
                timeA
            );

        }
    );


    return {

        plan:
            effectivePlan,

        lifetimeAccess:
            effectivePlan === "premium" || effectivePlan === "basic",

        purchases

    };

}


/* ==========================================================
   FIREBASE TIMESTAMP HELPER
========================================================== */

function timestampValue(
    value
) {

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
        typeof value._seconds ===
        "number"
    ) {

        return (
            value._seconds *
            1000
        ) +
        Math.floor(
            value._nanoseconds ||
            0
        ) / 1000000;

    }


    const parsed =
        new Date(
            value
        ).getTime();


    return Number.isFinite(
        parsed
    )
        ? parsed
        : 0;

}
/* ==========================================================
   GET PAID PAYMENTS BY USER UID
========================================================== */

export async function getPaidPaymentsByUserUid(
    userUid
) {

    if (!userUid) {

        return [];

    }


    const snapshot =
        await db
            .collection("payments")
            .where(
                "userUid",
                "==",
                userUid
            )
            .get();


    const payments = [];


    snapshot.forEach(
        (doc) => {

            const data =
                doc.data() || {};


            const status =
                String(
                    data.paymentStatus ||
                    data.payment_status ||
                    data.status ||
                    ""
                )
                    .trim()
                    .toUpperCase();


            /*
             * ONLY PAID PAYMENTS
             */

            if (
                status !== "PAID"
            ) {

                return;

            }


            const plan =
                String(
                    data.bundlePlan ||
                    data.bundle_plan ||
                    data.plan ||
                    ""
                )
                    .trim()
                    .toLowerCase();


            /*
             * Only valid plans.
             */

            if (
                plan !== "basic" &&
                plan !== "premium"
            ) {

                return;

            }


            payments.push({

                id:
                    doc.id,

                orderId:
                    data.orderId ||
                    doc.id,

                userUid:
                    data.userUid ||
                    userUid,

                plan,

                bundlePlan:
                    plan,

                amount:
                    Number(
                        data.amount || 0
                    ),

                paymentStatus:
                    "PAID",

                createdAt:
                    data.createdAt ||
                    null,

                paidAt:
                    data.paidAt ||
                    data.updatedAt ||
                    null

            });

        }
    );


    /*
     * Latest payment first.
     */

    payments.sort(
        (a, b) => {

            const dateA =
                getTimestampValue(
                    a.paidAt ||
                    a.createdAt
                );


            const dateB =
                getTimestampValue(
                    b.paidAt ||
                    b.createdAt
                );


            return dateB - dateA;

        }
    );


    return payments;

}


/* ==========================================================
   FIREBASE TIMESTAMP → MILLISECONDS
========================================================== */

function getTimestampValue(
    value
) {

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
        typeof value._seconds ===
        "number"
    ) {

        return (
            value._seconds * 1000
        ) +
        (
            Number(
                value._nanoseconds || 0
            ) / 1000000
        );

    }


    const timestamp =
        new Date(
            value
        ).getTime();


    return Number.isFinite(
        timestamp
    )
        ? timestamp
        : 0;

}