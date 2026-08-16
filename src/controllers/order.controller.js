/* ==========================================================
   REELSBUNDLES
   ADMIN ORDER CONTROLLER
========================================================== */

import {
    getOrders,
    deleteOrder,
    deleteAllOrders
} from "../services/order.service.js";

import {
    deletePayment
} from "../services/payment-storage.service.js";


/* ==========================================================
   LIST ORDERS
========================================================== */

export const listOrders = async (
    req,
    res
) => {

    try {

        const {

            page,

            limit,

            status,

            search

        } = req.query;


        const result =
            await getOrders({

                page,

                limit,

                status,

                search

            });


        return res.json({

            success: true,

            ...result

        });

    }

    catch (error) {

        console.error(
            "LIST ORDERS ERROR:",
            error
        );


        return res.status(
            500
        ).json({

            success: false,

            message:
                error.message ||
                "Unable to load orders."

        });

    }

};


/* ==========================================================
   DELETE ORDER
========================================================== */

export const removeOrder = async (
    req,
    res
) => {

    try {

        const {
            orderId
        } = req.params;


        /* ----------------------------------------------
           Validate Order ID
        ---------------------------------------------- */

        if (
            !orderId ||
            !String(orderId).trim()
        ) {

            return res.status(
                400
            ).json({

                success: false,

                message:
                    "Order ID is required."

            });

        }


        const cleanOrderId =
            String(
                orderId
            ).trim();


        /* ----------------------------------------------
           Delete payment record
        ---------------------------------------------- */

        await deletePayment(
            cleanOrderId
        );


        /* ----------------------------------------------
           Success
        ---------------------------------------------- */

        return res.json({

            success: true,

            message:
                "Order deleted successfully.",

            orderId:
                cleanOrderId

        });

    }

    catch (error) {

        console.error(
            "DELETE ORDER ERROR:",
            error
        );


        return res.status(
            500
        ).json({

            success: false,

            message:
                error.message ||
                "Unable to delete order."

        });

    }

};
/* ==========================================================
   DELETE ALL ORDERS
========================================================== */

export const removeAllOrders = async (req, res) => {

    try {

        const result =
            await deleteAllOrders();

        return res.json({
            success: true,
            message:
                `${result.deletedCount} order(s) deleted successfully.`,
            deletedCount:
                result.deletedCount
        });

    } catch (error) {

        console.error(
            "[Admin Orders] Delete all error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }

};