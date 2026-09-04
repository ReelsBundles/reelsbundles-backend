import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../config/firebase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../../data");
const PAYMENTS_FILE = path.join(DATA_DIR, "payments.json");

function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
}

export function loadLocalPayments() {
    try {
        if (!fs.existsSync(PAYMENTS_FILE)) {
            ensureDirectoryExistence(PAYMENTS_FILE);
            fs.writeFileSync(PAYMENTS_FILE, "[]", "utf-8");
            return [];
        }
        const raw = fs.readFileSync(PAYMENTS_FILE, "utf-8");
        return JSON.parse(raw || "[]");
    } catch (err) {
        console.warn("[PAYMENT STORAGE] Load local payments error:", err.message);
        return [];
    }
}

export function saveLocalPayments(payments) {
    try {
        ensureDirectoryExistence(PAYMENTS_FILE);
        fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(payments, null, 2), "utf-8");
        return true;
    } catch (err) {
        console.warn("[PAYMENT STORAGE] Save local payments error:", err.message);
        return false;
    }
}


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

    // 1. Save to local persistent storage
    const payments = loadLocalPayments();
    const idx = payments.findIndex(p => p.orderId === paymentData.orderId || p.id === paymentData.orderId);
    if (idx >= 0) {
        payments[idx] = { ...payments[idx], ...paymentData, updatedAt: new Date().toISOString() };
    } else {
        payments.unshift({
            id: paymentData.orderId,
            ...paymentData,
            createdAt: paymentData.createdAt || new Date().toISOString()
        });
    }
    saveLocalPayments(payments);

    // 2. Attempt Firestore sync safely
    try {
        if (db) {
            await db
                .collection("payments")
                .doc(paymentData.orderId)
                .set(
                    paymentData,
                    {
                        merge: true
                    }
                );
        }
    } catch (err) {
        console.warn("[PAYMENT STORAGE] Firestore savePayment warning (saved locally):", err.message);
    }

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

    try {
        if (db) {
            const doc =
                await db
                    .collection("payments")
                    .doc(orderId)
                    .get();

            if (doc.exists) {
                return {
                    id: doc.id,
                    ...doc.data()
                };
            }
        }
    } catch (err) {
        console.warn("[PAYMENT STORAGE] Firestore getPayment warning (fallback to local):", err.message);
    }

    const localPayments = loadLocalPayments();
    return localPayments.find(p => p.orderId === orderId || p.id === orderId) || null;

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

    const payments = loadLocalPayments();
    const idx = payments.findIndex(p => p.orderId === orderId || p.id === orderId);
    if (idx >= 0) {
        payments[idx] = { ...payments[idx], ...data, updatedAt: new Date().toISOString() };
        saveLocalPayments(payments);
    }

    try {
        if (db) {
            await db
                .collection("payments")
                .doc(orderId)
                .set(
                    data,
                    {
                        merge: true
                    }
                );
        }
    } catch (err) {
        console.warn("[PAYMENT STORAGE] Firestore updatePayment warning (updated locally):", err.message);
    }

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

    const payments = loadLocalPayments().filter(p => p.orderId !== orderId && p.id !== orderId);
    saveLocalPayments(payments);

    try {
        if (db) {
            await db
                .collection("payments")
                .doc(orderId)
                .delete();
        }
    } catch (err) {
        console.warn("[PAYMENT STORAGE] Firestore deletePayment warning:", err.message);
    }

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


    let snapshotDocs = [];
    try {
        if (db) {
            const snapshot =
                await db
                    .collection("payments")
                    .where(
                        "userUid",
                        "==",
                        userUid
                    )
                    .get();
            snapshot.forEach(doc => snapshotDocs.push({ id: doc.id, data: doc.data() || {} }));
        }
    } catch (err) {
        console.warn("[PAYMENT STORAGE] Firestore getUserEntitlement warning (fallback to local):", err.message);
    }

    if (snapshotDocs.length === 0) {
        const localPayments = loadLocalPayments();
        localPayments.filter(p => p.userUid === userUid || p.firebaseUid === userUid || p.uid === userUid).forEach(p => {
            snapshotDocs.push({ id: p.id || p.orderId, data: p });
        });
    }

    const purchases = [];

    let effectivePlan =
        "free";

    snapshotDocs.forEach(
        (docItem) => {

            const data =
                docItem.data || {};


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

    let snapshotDocs = [];
    try {
        if (db) {
            const snapshot =
                await db
                    .collection("payments")
                    .where(
                        "userUid",
                        "==",
                        userUid
                    )
                    .get();
            snapshot.forEach(doc => snapshotDocs.push({ id: doc.id, data: doc.data() || {} }));
        }
    } catch (err) {
        console.warn("[PAYMENT STORAGE] Firestore getPaidPaymentsByUserUid warning (fallback to local):", err.message);
    }

    if (snapshotDocs.length === 0) {
        const localPayments = loadLocalPayments();
        localPayments.filter(p => p.userUid === userUid || p.firebaseUid === userUid || p.uid === userUid).forEach(p => {
            snapshotDocs.push({ id: p.id || p.orderId, data: p });
        });
    }

    const payments = [];

    snapshotDocs.forEach(
        (docItem) => {

            const data =
                docItem.data || {};


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