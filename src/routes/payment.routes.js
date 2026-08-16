import { Router } from "express";

import {
    createOrder,
    verifyOrder
} from "../controllers/payment.controller.js";

import {
    firebaseUserAuth
} from "../middleware/auth.middleware.js";


const router =
    Router();


/* ==========================================================
   PAYMENT HEALTH
========================================================== */

router.get(
    "/health",
    (req, res) => {

        return res.json({

            success: true,

            service:
                "payment"

        });

    }
);


/* ==========================================================
   CREATE ORDER
   LOGIN REQUIRED
========================================================== */

router.post(
    "/create-order",

    firebaseUserAuth,

    createOrder
);


/* ==========================================================
   VERIFY ORDER
   LOGIN REQUIRED

   IMPORTANT:
   Only the Firebase user who created
   the order can verify it.
========================================================== */

router.get(
    "/verify/:orderId",

    firebaseUserAuth,

    verifyOrder
);


export default router;