import env from "../config/env.js";


/* ==========================================================
   CASHFREE CONFIG
========================================================== */

const CASHFREE_BASE_URL =
    env.CASHFREE_ENV === "PRODUCTION"
        ? "https://api.cashfree.com/pg"
        : "https://sandbox.cashfree.com/pg";


const CASHFREE_API_VERSION =
    "2025-01-01";


/* ==========================================================
   VALIDATE CONFIG
========================================================== */

function validateCashfreeConfig() {

    if (!env.CASHFREE_CLIENT_ID) {

        throw new Error(
            "CASHFREE_CLIENT_ID is missing in .env"
        );

    }


    if (!env.CASHFREE_CLIENT_SECRET) {

        throw new Error(
            "CASHFREE_CLIENT_SECRET is missing in .env"
        );

    }

}


/* ==========================================================
   CASHFREE HEADERS
========================================================== */

function getHeaders() {

    validateCashfreeConfig();


    return {

        "Content-Type":
            "application/json",

        "Accept":
            "application/json",

        "x-client-id":
            env.CASHFREE_CLIENT_ID,

        "x-client-secret":
            env.CASHFREE_CLIENT_SECRET,

        "x-api-version":
            CASHFREE_API_VERSION,

        "x-request-id":
            `RB-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 10)}`

    };

}


/* ==========================================================
   CREATE CASHFREE ORDER
========================================================== */

export async function createCashfreeOrder(
    order
) {

    try {

        validateCashfreeConfig();


        if (!order) {

            throw new Error(
                "Payment order data is missing."
            );

        }


        if (!order.order_id) {

            throw new Error(
                "Cashfree order ID is missing."
            );

        }


        if (
            !order.order_amount ||
            Number(order.order_amount) <= 0
        ) {

            throw new Error(
                "Invalid payment amount."
            );

        }


        /* --------------------------------------------------
           Customer details (Strict Cashfree API Sanitation)
        -------------------------------------------------- */

        const rawCustomerId = order.customer_id || `RB_${order.order_id}`;
        const customerId = String(rawCustomerId).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50) || `RB_${Date.now()}`;

        const rawName = order.customer_name || "ReelsBundles Customer";
        const customerName = String(rawName).replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 100) || "ReelsBundles Customer";

        const rawEmail = order.customer_email || "";
        const customerEmail = (rawEmail && rawEmail.includes("@")) ? rawEmail.trim() : "reelsbundles.support@gmail.com";


        const rawPhone =
            order.customer_phone ||
            "";

        let phoneDigits =
            String(rawPhone)
                .replace(/[^\d]/g, "");

        if (
            phoneDigits.length === 12 &&
            phoneDigits.startsWith("91")
        ) {

            phoneDigits =
                phoneDigits.slice(2);

        }

        if (
            phoneDigits.length === 11 &&
            phoneDigits.startsWith("0")
        ) {

            phoneDigits =
                phoneDigits.slice(1);

        }

        if (
            phoneDigits.length > 10
        ) {

            phoneDigits =
                phoneDigits.slice(-10);

        }

        const customerPhone =
            phoneDigits.length === 10
                ? phoneDigits
                : "9999999999";


        /* --------------------------------------------------
           Cashfree payload
        -------------------------------------------------- */

        const payload = {

            order_id:
                order.order_id,

            order_amount:
                Number(order.order_amount),

            order_currency:
                order.order_currency ||
                "INR",

            order_note:
                order.order_note ||
                "ReelsBundles Order",


            customer_details: {

                customer_id:
                    customerId,

                customer_name:
                    customerName,

                customer_email:
                    customerEmail,

                customer_phone:
                    customerPhone

            },


            order_meta: {

                return_url:
                    `${env.FRONTEND_URL}/success.html?order_id={order_id}`,

                notify_url:
                    `${env.BACKEND_URL || env.FRONTEND_URL}/api/webhook/cashfree`

            }

        };


        console.log(
            "[Cashfree] Creating order:",
            order.order_id
        );


        /* --------------------------------------------------
           API REQUEST
        -------------------------------------------------- */

        const response =
            await fetch(
                `${CASHFREE_BASE_URL}/orders`,
                {

                    method:
                        "POST",

                    headers:
                        getHeaders(),

                    body:
                        JSON.stringify(
                            payload
                        )

                }
            );


        const responseText =
            await response.text();


        let data;


        try {

            data =
                responseText
                    ? JSON.parse(
                        responseText
                    )
                    : {};

        } catch {

            data = {

                message:
                    responseText ||
                    "Invalid Cashfree response."

            };

        }


        /* --------------------------------------------------
           CASHFREE ERROR
        -------------------------------------------------- */

        if (!response.ok) {

            console.error(
                "[Cashfree] Create order failed:",
                response.status,
                data
            );


            let message =
                data?.message ||
                data?.error_description ||
                data?.error ||
                `Cashfree API error (${response.status})`;

            if (String(message).toLowerCase().includes("authentication failed") || response.status === 401) {
                message = "Payment Gateway Credentials Error: The CASHFREE_CLIENT_ID or CASHFREE_CLIENT_SECRET configured in Render environment variables is invalid or belongs to Sandbox while CASHFREE_ENV=PRODUCTION. Please update your Live Production API keys in Render Settings.";
            }

            const err = new Error(message);
            err.statusCode = response.status;
            throw err;

        }


        /* --------------------------------------------------
           SUCCESS
        -------------------------------------------------- */

        console.log(
            "[Cashfree] Order created:",
            order.order_id
        );


        return {

            ...data,

            order_id:
                data.order_id ||
                order.order_id,

            order_amount:
                data.order_amount ||
                order.order_amount,

            order_currency:
                data.order_currency ||
                order.order_currency ||
                "INR",

            order_status:
                data.order_status ||
                "ACTIVE"

        };

    } catch (error) {

        console.error(
            "[Cashfree] CREATE ORDER ERROR:",
            error
        );


        throw error;

    }

}


/* ==========================================================
   VERIFY CASHFREE ORDER
========================================================== */

export async function verifyCashfreeOrder(
    orderId
) {

    try {

        validateCashfreeConfig();


        if (!orderId) {

            throw new Error(
                "Order ID is required."
            );

        }


        console.log(
            "[Cashfree] Verifying order:",
            orderId
        );


        /* --------------------------------------------------
           API REQUEST
        -------------------------------------------------- */

        const response =
            await fetch(
                `${CASHFREE_BASE_URL}/orders/${encodeURIComponent(orderId)}`,
                {

                    method:
                        "GET",

                    headers:
                        getHeaders()

                }
            );


        const responseText =
            await response.text();


        let data;


        try {

            data =
                responseText
                    ? JSON.parse(
                        responseText
                    )
                    : {};

        } catch {

            data = {

                message:
                    responseText ||
                    "Invalid Cashfree response."

            };

        }


        /* --------------------------------------------------
           ERROR
        -------------------------------------------------- */

        if (!response.ok) {

            console.error(
                "[Cashfree] Verify order failed:",
                response.status,
                data
            );


            const message =
                data?.message ||
                data?.error_description ||
                data?.error ||
                `Cashfree verification error (${response.status})`;


            throw new Error(
                message
            );

        }


        /* --------------------------------------------------
           SUCCESS
        -------------------------------------------------- */

        console.log(
            "[Cashfree] Order status:",
            data?.order_status
        );


        return data;

    } catch (error) {

        console.error(
            "[Cashfree] VERIFY ORDER ERROR:",
            error
        );


        throw error;

    }

}


/* ==========================================================
   GET CASHFREE ENVIRONMENT
========================================================== */

export function getCashfreeEnvironment() {

    return (
        env.CASHFREE_ENV ||
        "SANDBOX"
    );

}


/* ==========================================================
   GET CASHFREE BASE URL
========================================================== */

export function getCashfreeBaseUrl() {

    return CASHFREE_BASE_URL;

}