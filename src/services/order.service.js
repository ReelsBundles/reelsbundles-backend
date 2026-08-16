/* ==========================================================
   REELSBUNDLES
   ORDER SERVICE
========================================================== */

import { db } from "../config/firebase.js";


/* ==========================================================
   GET ORDERS
========================================================== */

export async function getOrders(options = {}) {

    const {
        page = 1,
        limit = 10,
        status = "",
        search = ""
    } = options;


    const currentPage =
        Math.max(
            Number(page) || 1,
            1
        );


    const pageLimit =
        Math.max(
            Number(limit) || 10,
            1
        );


    /* ------------------------------------------------------
       GET ALL PAYMENTS
    ------------------------------------------------------ */

    const snapshot =
        await db
            .collection("payments")
            .get();


    let orders = [];


    snapshot.forEach((doc) => {

        const data =
            doc.data() || {};


        orders.push({

            id: doc.id,

            ...data

        });

    });


    /* ------------------------------------------------------
       STATUS FILTER
       Handles:
       PAID
       paid
       Paid
       ------------------------------------------------------ */

    if (status) {

        const wantedStatus =
            String(status)
                .trim()
                .toUpperCase();


        orders =
            orders.filter((order) => {

                const orderStatus =
                    String(
                        order.paymentStatus ||
                        order.status ||
                        ""
                    )
                    .trim()
                    .toUpperCase();


                return (
                    orderStatus ===
                    wantedStatus
                );

            });

    }


    /* ------------------------------------------------------
       SEARCH FILTER
    ------------------------------------------------------ */

    if (search) {

        const keyword =
            String(search)
                .trim()
                .toLowerCase();


        if (keyword) {

            orders =
                orders.filter((order) => {

                    const email =
                        String(
                            order.email ||
                            ""
                        )
                        .toLowerCase();


                    const orderId =
                        String(
                            order.orderId ||
                            order.id ||
                            ""
                        )
                        .toLowerCase();


                    const name =
                        String(
                            order.customerName ||
                            order.name ||
                            ""
                        )
                        .toLowerCase();


                    const phone =
                        String(
                            order.phone ||
                            order.customerPhone ||
                            ""
                        )
                        .toLowerCase();


                    return (

                        email.includes(
                            keyword
                        )

                        ||

                        orderId.includes(
                            keyword
                        )

                        ||

                        name.includes(
                            keyword
                        )

                        ||

                        phone.includes(
                            keyword
                        )

                    );

                });

        }

    }


    /* ------------------------------------------------------
       SORT — NEWEST FIRST
       No Firestore orderBy required
    ------------------------------------------------------ */

    orders.sort((a, b) => {

        const dateA =
            getTimestamp(
                a.createdAt
            );


        const dateB =
            getTimestamp(
                b.createdAt
            );


        return dateB - dateA;

    });


    /* ------------------------------------------------------
       TOTAL
    ------------------------------------------------------ */

    const total =
        orders.length;


    /* ------------------------------------------------------
       PAGINATION
    ------------------------------------------------------ */

    const start =
        (currentPage - 1) *
        pageLimit;


    const end =
        start +
        pageLimit;


    const paginatedOrders =
        orders.slice(
            start,
            end
        );


    const totalPages =
        Math.max(
            Math.ceil(
                total /
                pageLimit
            ),
            1
        );


    /* ------------------------------------------------------
       RESULT
    ------------------------------------------------------ */

    return {

        total,

        page:
            currentPage,

        limit:
            pageLimit,

        totalPages,

        orders:
            paginatedOrders

    };

}


/* ==========================================================
   TIMESTAMP HELPER
========================================================== */

function getTimestamp(value) {

    if (!value) {
        return 0;
    }


    /* Firestore Timestamp */

    if (
        typeof value.toMillis ===
        "function"
    ) {

        return value.toMillis();

    }


    /* Firestore Timestamp object */

    if (
        typeof value._seconds ===
        "number"
    ) {

        return (
            value._seconds * 1000
        ) +
        (
            Math.floor(
                value._nanoseconds || 0
            ) / 1000000
        );

    }


    /* JavaScript Date */

    if (
        value instanceof Date
    ) {

        return value.getTime();

    }


    /* String / Number */

    const parsed =
        new Date(value)
            .getTime();


    if (
        Number.isFinite(parsed)
    ) {

        return parsed;

    }


    return 0;

}
/* ==========================================================
   DELETE SINGLE ORDER
========================================================== */

export async function deleteOrder(orderId) {

    if (!orderId) {
        throw new Error("Order ID is required.");
    }

    const docRef = db
        .collection("payments")
        .doc(orderId);

    const doc = await docRef.get();

    if (!doc.exists) {
        throw new Error("Order not found.");
    }

    await docRef.delete();

    return true;
}


/* ==========================================================
   DELETE ALL ORDERS
========================================================== */

export async function deleteAllOrders() {

    const snapshot = await db
        .collection("payments")
        .get();

    if (snapshot.empty) {
        return {
            deletedCount: 0
        };
    }

    const batch = db.batch();

    snapshot.forEach((doc) => {
        batch.delete(doc.ref);
    });

    await batch.commit();

    return {
        deletedCount: snapshot.size
    };
}