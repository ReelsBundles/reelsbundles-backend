/* ==========================================================
   REELSBUNDLES
   ADMIN ORDER ROUTES
========================================================== */

import express from "express";
import { adminAuth } from "../middleware/auth.middleware.js";

import {
    listOrders,
    removeOrder,
    removeAllOrders
} from "../controllers/order.controller.js";


const router =
    express.Router();

router.use(adminAuth);


/* ==========================================================
   GET ORDERS
   GET /api/admin/orders
========================================================== */

router.get(
    "/",
    listOrders
);

/* ==========================================================
   DELETE ALL ORDERS
   DELETE /api/admin/orders/all
========================================================== */

router.delete(
    "/all",
    removeAllOrders
);

router.delete(
    "/:orderId",
    removeOrder
);


/* ==========================================================
   EXPORT
========================================================== */

export default router;