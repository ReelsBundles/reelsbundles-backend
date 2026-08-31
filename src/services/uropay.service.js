/* ==========================================================
   REELSBUNDLES BACKEND — UROPAY PAYMENT SERVICE
   OFFICIAL UROPAY MERCHANT API v1 INTEGRATION
   HTTPS://API.UROPAI.IN/V1
========================================================== */

import crypto from "crypto";
import axios from "axios";

const UROPAY_BASE_URL = "https://api.uropai.in/v1";

/* ==========================================================
   GET UROPAY CREDENTIALS
========================================================== */
export function getUroPayCredentials() {
    const envMode = (process.env.UROPAY_ENV || "TEST").toUpperCase();

    let apiKey = "";
    let apiSecret = "";

    if (envMode === "PRODUCTION") {
        apiKey = process.env.UROPAY_PRODUCTION_API_KEY || process.env.UROPAY_API_KEY || "";
        apiSecret = process.env.UROPAY_PRODUCTION_API_SECRET || process.env.UROPAY_API_SECRET || "";
    } else {
        apiKey = process.env.UROPAY_TEST_API_KEY || process.env.UROPAY_API_KEY || "";
        apiSecret = process.env.UROPAY_TEST_API_SECRET || process.env.UROPAY_API_SECRET || "";
    }

    return {
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        env: envMode
    };
}

/* ==========================================================
   HMAC-SHA256 REQUEST SIGNING
   CANONICAL STRING: ${method}\n${path}\n${timestamp}\n${nonce}\n${queryString}\n${rawBody}
========================================================== */
export function signUroPayRequest(method, path, queryString = "", rawBody = "", apiKey = "", apiSecret = "") {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomUUID();

    const canonicalString = [
        method.toUpperCase(),
        path,
        timestamp,
        nonce,
        queryString || "",
        rawBody || ""
    ].join("\n");

    const signature = crypto
        .createHmac("sha256", apiSecret)
        .update(canonicalString)
        .digest("hex");

    return {
        "X-Api-Key": apiKey,
        "X-Timestamp": timestamp,
        "X-Nonce": nonce,
        "X-Signature": signature
    };
}

/* ==========================================================
   CREATE UROPAY ORDER (POST /v1/orders)
========================================================== */
export async function createUroPayOrder(orderData) {
    const { apiKey, apiSecret, env } = getUroPayCredentials();

    if (!apiKey || !apiSecret) {
        throw new Error(`UroPay API Key or Secret is missing for ${env} environment.`);
    }

    const path = "/v1/orders";
    const bodyObj = {
        tenantOrderRef: String(orderData.tenantOrderRef || orderData.orderId),
        amount: Number(orderData.amount),
        currency: orderData.currency || "INR",
        customerEmail: orderData.customerEmail || undefined,
        customerPhone: orderData.customerPhone || undefined,
        returnUrl: orderData.returnUrl || undefined,
        webhookUrl: orderData.webhookUrl || undefined,
        metaData: orderData.metaData || undefined
    };

    const rawBody = JSON.stringify(bodyObj);
    const headers = {
        ...signUroPayRequest("POST", path, "", rawBody, apiKey, apiSecret),
        "Content-Type": "application/json"
    };

    console.log(`[UroPay Service] Creating order on ${UROPAY_BASE_URL}${path} (${env} Mode):`, bodyObj.tenantOrderRef);

    try {
        const response = await axios.post(`${UROPAY_BASE_URL}${path}`, rawBody, { headers });
        const resData = response.data;

        if ((resData.code === 201 || resData.code === 200) && resData.data) {
            console.log(`[UroPay Service] Order Created Successfully:`, resData.data.id, "| openUrl:", resData.data.openUrl);
            return resData.data;
        }

        throw new Error(resData.message || "Failed to create UroPay order.");
    } catch (error) {
        const errObj = error.response?.data;
        const msg = errObj?.message || error.message || "UroPay API Order Creation Error";
        console.error("[UroPay Service] Error creating order:", msg, errObj || "");
        const err = new Error(msg);
        err.statusCode = error.response?.status || 400;
        throw err;
    }
}

/* ==========================================================
   VERIFY UROPAY ORDER STATUS (GET /v1/orders/{orderId})
========================================================== */
export async function verifyUroPayOrder(uropayOrderId) {
    const { apiKey, apiSecret, env } = getUroPayCredentials();

    if (!apiKey || !apiSecret) {
        throw new Error(`UroPay API Key or Secret is missing for ${env} environment.`);
    }

    const path = `/v1/orders/${encodeURIComponent(uropayOrderId)}`;
    const headers = signUroPayRequest("GET", path, "", "", apiKey, apiSecret);

    console.log(`[UroPay Service] Fetching order status on ${UROPAY_BASE_URL}${path}`);

    try {
        const response = await axios.get(`${UROPAY_BASE_URL}${path}`, { headers });
        const resData = response.data;

        if (resData.code === 200 && resData.data) {
            console.log(`[UroPay Service] Order Status fetched:`, resData.data.id, "| Status:", resData.data.status);
            return resData.data;
        }

        throw new Error(resData.message || "Order not found on UroPay.");
    } catch (error) {
        const errObj = error.response?.data;
        const msg = errObj?.message || error.message || "UroPay Order Fetch Error";
        console.error("[UroPay Service] Error fetching order status:", msg);
        const err = new Error(msg);
        err.statusCode = error.response?.status || 404;
        throw err;
    }
}

/* ==========================================================
   VERIFY UROPAY WEBHOOK SIGNATURE
   CANONICAL STRING: POST\n/tenant-webhook\n${timestamp}\n${nonce}\n\n${rawBody}
========================================================== */
export function verifyUroPayWebhookSignature(headers, rawBody = "") {
    const { apiSecret } = getUroPayCredentials();
    if (!apiSecret) return false;

    const timestamp = headers["x-timestamp"] || headers["X-Timestamp"] || "";
    const nonce = headers["x-nonce"] || headers["X-Nonce"] || "";
    const signature = headers["x-signature"] || headers["X-Signature"] || "";

    if (!timestamp || !nonce || !signature) return false;

    const canonicalString = [
        "POST",
        "/tenant-webhook",
        timestamp,
        nonce,
        "",
        rawBody
    ].join("\n");

    const expected = crypto
        .createHmac("sha256", apiSecret)
        .update(canonicalString)
        .digest("hex");

    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(signature, "hex");

    if (expectedBuf.length !== actualBuf.length) return false;

    return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
