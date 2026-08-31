import {
    getPlan,
    generateOrder
} from "../services/payment.service.js";

import {
    createCashfreeOrder,
    verifyCashfreeOrder
} from "../services/cashfree.service.js";

import {
    savePayment,
    getPayment,
    updatePayment
} from "../services/payment-storage.service.js";

import {
    generateDownloadToken,
    hashDownloadToken,
    getTokenExpiry
} from "../utils/token.js";


import {
    getCouponByCode,
    fetchCouponsAsync,
    incrementCouponUsage
} from "../services/coupon-storage.service.js";


/* ==========================================================
   CREATE PAYMENT ORDER
========================================================== */

export const createOrder = async (
    req,
    res
) => {

    try {

        const {
            plan,
            fullName,
            phone,
            couponCode
        } = req.body;


        /* --------------------------------------------------
           AUTHENTICATED USER REQUIRED
        -------------------------------------------------- */

        if (!req.user?.uid) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required."

            });

        }


        /* --------------------------------------------------
           VALIDATE PLAN
        -------------------------------------------------- */

        const selectedPlan =
            getPlan(plan);


        if (!selectedPlan) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid Plan."

            });

        }


        /* --------------------------------------------------
           GENERATE INTERNAL ORDER & APPLY COUPON
        -------------------------------------------------- */

        const order =
            generateOrder(
                selectedPlan
            );

        if (couponCode) {
            await fetchCouponsAsync();
            const coupon = getCouponByCode(couponCode);
            if (coupon && coupon.active && (!coupon.expiryDate || new Date(coupon.expiryDate) >= new Date())) {
                let discount = 0;
                if (coupon.discountType === 'percentage') {
                    discount = Math.round((selectedPlan.amount * coupon.discountValue) / 100);
                    if (coupon.maxDiscount && discount > coupon.maxDiscount) discount = coupon.maxDiscount;
                } else if (coupon.discountType === 'flat') {
                    discount = coupon.discountValue;
                }
                order.order_amount = Math.max(1, selectedPlan.amount - discount);
                await incrementCouponUsage(coupon.code);
            }
        }


        /*
         * NEVER trust frontend identity.
         */

        order.customer_id =
            req.user.uid;


        order.customer_name =
            req.user.name ||
            fullName ||
            "ReelsBundles Customer";


        order.customer_email =
            req.user.email ||
            "";


        order.customer_phone =
            phone ||
            "";


        /* --------------------------------------------------
           CREATE CASHFREE ORDER
        -------------------------------------------------- */

        const payment =
            await createCashfreeOrder(
                order
            );


        /* --------------------------------------------------
           CHECK EXISTING PAYMENT
        -------------------------------------------------- */

        const existingPayment =
            await getPayment(
                payment.order_id
            );


        if (existingPayment) {

            /*
             * Do not allow another user
             * to reuse this order.
             */

            if (
                existingPayment.userUid &&
                existingPayment.userUid !==
                    req.user.uid
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "Payment order belongs to another user."

                });

            }


            return res.json({

                success: true,

                environment:
                    process.env.CASHFREE_ENV === "PRODUCTION"
                        ? "production"
                        : "sandbox",

                order,

                payment

            });

        }


        /* --------------------------------------------------
           SECURE DOWNLOAD TOKEN
        -------------------------------------------------- */

        const downloadToken =
            generateDownloadToken();


        const downloadTokenHash =
            hashDownloadToken(
                downloadToken
            );


        const expiresAt =
            getTokenExpiry(
                10
            );


        /* --------------------------------------------------
           SAVE PAYMENT
        -------------------------------------------------- */

        await savePayment({

            orderId:
                payment.order_id,

            cfOrderId:
                payment.cf_order_id ||
                null,

            amount:
                payment.order_amount,

            currency:
                payment.order_currency ||
                "INR",

            paymentStatus:
                payment.order_status ||
                "ACTIVE",


            /*
             * CRITICAL:
             * Firebase UID ownership.
             */

            userUid:
                req.user.uid,


            /*
             * CRITICAL:
             * Purchased plan.
             */

            bundlePlan:
                selectedPlan.id,


            customerName:
                payment
                    .customer_details
                    ?.customer_name ||
                order.customer_name ||
                "",


            customerEmail:
                payment
                    .customer_details
                    ?.customer_email ||
                order.customer_email ||
                "",


            customerPhone:
                payment
                    .customer_details
                    ?.customer_phone ||
                order.customer_phone ||
                "",


            downloadTokenHash,


            downloadCount:
                0,


            maxDownloads:
                1,


            downloadLock:
                false,


            expiresAt,


            createdAt:
                new Date()

        });


        /* --------------------------------------------------
           RESPONSE
        -------------------------------------------------- */

        return res.json({

            success: true,

            environment:
                process.env.CASHFREE_ENV === "PRODUCTION"
                    ? "production"
                    : "sandbox",

            order,

            payment,

            download: {

                token:
                    downloadToken,

                expiresAt

            }

        });

    }

    catch (error) {

        console.error(
            "CREATE ORDER ERROR:",
            error
        );


        const statusCode =
            error.statusCode ||
            error.status ||
            400;

        return res.status(statusCode).json({

            success: false,

            message:
                error.message ||
                "Unable to create payment order."

        });

    }

};


/* ==========================================================
   VERIFY PAYMENT
========================================================== */

export const verifyOrder = async (
    req,
    res
) => {

    try {

        /* --------------------------------------------------
           AUTH REQUIRED
        -------------------------------------------------- */

        if (!req.user?.uid) {

            return res.status(401).json({
                success: false,
                message:
                    "Authentication required."
            });

        }


        /* --------------------------------------------------
           ORDER ID
        -------------------------------------------------- */

        const {
            orderId
        } = req.params;


        if (!orderId) {

            return res.status(400).json({
                success: false,
                message:
                    "Order ID is required."
            });

        }


        console.log(
            "[Payment] Verifying order:",
            orderId
        );


        /* --------------------------------------------------
           FIND LOCAL PAYMENT
        -------------------------------------------------- */

        const storedPayment =
            await getPayment(
                orderId
            );


        if (!storedPayment) {

            return res.status(404).json({
                success: false,
                message:
                    "Payment order not found."
            });

        }


        /* --------------------------------------------------
           OWNERSHIP CHECK
        -------------------------------------------------- */

        if (
            storedPayment.userUid !==
            req.user.uid
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "You are not allowed to verify this payment order."
            });

        }


        /* --------------------------------------------------
           VERIFY WITH CASHFREE
        -------------------------------------------------- */

        console.log(
            "[Payment] Checking Cashfree:",
            orderId
        );


        const payment =
            await verifyCashfreeOrder(
                orderId
            );


        console.log(
            "[Payment] Cashfree status:",
            payment?.order_status
        );


        /* --------------------------------------------------
           PAYMENT MUST BE PAID
        -------------------------------------------------- */

        if (
            String(
                payment?.order_status ||
                ""
            ).toUpperCase() !==
            "PAID"
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Payment not completed.",
                orderStatus:
                    payment?.order_status ||
                    null
            });

        }


        /* --------------------------------------------------
           FRESH DOWNLOAD TOKEN
        -------------------------------------------------- */

        const downloadToken =
            generateDownloadToken();


        const downloadTokenHash =
            hashDownloadToken(
                downloadToken
            );


        /* --------------------------------------------------
           TOKEN EXPIRY
           10 MINUTES
        -------------------------------------------------- */

        const expiresAt =
            getTokenExpiry(
                10
            );


        /* --------------------------------------------------
           PURCHASED PLAN
        -------------------------------------------------- */

        const bundlePlan =
            storedPayment.bundlePlan ||
            storedPayment.bundle_plan ||
            "basic";


        /* --------------------------------------------------
           UPDATE VERIFIED PAYMENT
        -------------------------------------------------- */

        await updatePayment(
            orderId,
            {

                paymentStatus:
                    "PAID",

                cfOrderId:
                    payment.cf_order_id ||
                    storedPayment.cfOrderId ||
                    null,

                amount:
                    payment.order_amount ||
                    storedPayment.amount,

                currency:
                    payment.order_currency ||
                    storedPayment.currency ||
                    "INR",

                userUid:
                    storedPayment.userUid,

                bundlePlan,

                downloadTokenHash,

                downloadCount:
                    0,

                maxDownloads:
                    storedPayment.maxDownloads ||
                    1,

                downloadLock:
                    false,

                expiresAt,

                paidAt:
                    new Date(),

                updatedAt:
                    new Date()

            }
        );


        /* --------------------------------------------------
           SUCCESS RESPONSE
        -------------------------------------------------- */

        console.log(
            "[Payment] Payment verified successfully:",
            orderId
        );

        console.log(
            "[Payment] Download token created:",
            Boolean(downloadToken)
        );

        console.log(
            "[Payment] Download expiry:",
            expiresAt
        );


        return res.json({

            success: true,

            payment: {

                order_id:
                    payment.order_id,

                order_amount:
                    payment.order_amount,

                order_currency:
                    payment.order_currency,

                order_status:
                    payment.order_status

            },

            order: {

                order_id:
                    payment.order_id,

                order_amount:
                    payment.order_amount,

                order_status:
                    payment.order_status,

                order_note:
                    payment.order_note

            },

            download: {

                token:
                    downloadToken,

                expiresAt

            }

        });

    }

    catch (
        error
    ) {

        console.error(
            "[Payment] VERIFY ORDER ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                error?.message ||
                "Payment verification failed."

        });

    }

};