/* ==========================================================
   REELSBUNDLES BACKEND — UROPAY PAYMENT SERVICE
   OFFICIAL UROPAY MERCHANT API v1 INTEGRATION
   HTTPS://API.UROPAI.IN/V1
========================================================== */

import crypto from "crypto";
import axios from "axios";

const UROPAY_BASE_URL = "https://api.uropai.in";

/* ==========================================================
   HELPERS & CREDENTIAL LOADING
========================================================== */
function cleanCredential(raw) {
    if (raw === undefined || raw === null) return "";
    return String(raw).replace(/^["']|["']$/g, "").trim();
}

function checkWhitespace(raw) {
    if (!raw) return { hasLeading: false, hasTrailing: false, hasNewline: false };
    const str = String(raw);
    return {
        hasLeading: /^\s/.test(str),
        hasTrailing: /\s$/.test(str),
        hasNewline: /[\r\n]/.test(str)
    };
}

export function getUroPayCredentials() {
    const envMode = (process.env.UROPAY_ENV || "TEST").toUpperCase();

    // Checked variable names for API Key
    const keyCandidates = [
        { name: "UROPAY_TEST_API_KEY", val: process.env.UROPAY_TEST_API_KEY },
        { name: "UROPAY_API_KEY", val: process.env.UROPAY_API_KEY },
        { name: "UROPAY_TEST_KEY", val: process.env.UROPAY_TEST_KEY },
        { name: "UROPAY_KEY", val: process.env.UROPAY_KEY },
        { name: "UROPAY_PRODUCTION_API_KEY", val: process.env.UROPAY_PRODUCTION_API_KEY }
    ];

    // Checked variable names for API Secret
    const secretCandidates = [
        { name: "UROPAY_TEST_API_SECRET", val: process.env.UROPAY_TEST_API_SECRET },
        { name: "UROPAY_API_SECRET", val: process.env.UROPAY_API_SECRET },
        { name: "UROPAY_TEST_SECRET", val: process.env.UROPAY_TEST_SECRET },
        { name: "UROPAY_SECRET", val: process.env.UROPAY_SECRET },
        { name: "UROPAY_PRODUCTION_API_SECRET", val: process.env.UROPAY_PRODUCTION_API_SECRET }
    ];

    let foundKeyObj = keyCandidates.find(c => c.val && c.val.trim() !== "");
    let foundSecretObj = secretCandidates.find(c => c.val && c.val.trim() !== "");

    const rawApiKey = foundKeyObj ? foundKeyObj.val : "";
    const rawApiSecret = foundSecretObj ? foundSecretObj.val : "";

    const apiKey = cleanCredential(rawApiKey);
    const apiSecret = cleanCredential(rawApiSecret);

    const keyWs = checkWhitespace(rawApiKey);
    const secretWs = checkWhitespace(rawApiSecret);

    const secretFingerprint = apiSecret
        ? crypto.createHash("sha256").update(apiSecret).digest("hex")
        : "";

    return {
        env: envMode,
        apiKey,
        apiSecret,
        keyVarName: foundKeyObj ? foundKeyObj.name : "NONE",
        secretVarName: foundSecretObj ? foundSecretObj.name : "NONE",
        keyWhitespace: keyWs,
        secretWhitespace: secretWs,
        secretFingerprint
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
        headers: {
            "X-Api-Key": apiKey,
            "X-Timestamp": timestamp,
            "X-Nonce": nonce,
            "X-Signature": signature
        },
        timestamp,
        nonce,
        canonicalString,
        signature
    };
}

/* ==========================================================
   CREATE UROPAY ORDER (POST /v1/orders)
========================================================== */
export async function createUroPayOrder(orderData) {
    const creds = getUroPayCredentials();

    if (!creds.apiKey || !creds.apiSecret) {
        throw new Error(`UroPay API Key or Secret is missing in environment (Checked: UROPAY_TEST_API_KEY, UROPAY_API_KEY, UROPAY_TEST_KEY).`);
    }

    const path = "/v1/orders";
    const bodyObj = {
        tenantOrderRef: String(orderData.tenantOrderRef || orderData.orderId),
        amount: Number(orderData.amount),
        currency: orderData.currency || "INR"
    };

    if (orderData.customerEmail) bodyObj.customerEmail = orderData.customerEmail;
    if (orderData.customerPhone) bodyObj.customerPhone = orderData.customerPhone;
    if (orderData.returnUrl) bodyObj.returnUrl = orderData.returnUrl;
    if (orderData.webhookUrl) bodyObj.webhookUrl = orderData.webhookUrl;
    if (orderData.metaData) bodyObj.metaData = orderData.metaData;

    // RAW BODY CREATED EXACTLY ONCE
    const rawBody = JSON.stringify(bodyObj);

    // SIGNED WITH EXACT RAW BODY STRING
    const signingResult = signUroPayRequest("POST", path, "", rawBody, creds.apiKey, creds.apiSecret);
    const headers = {
        ...signingResult.headers,
        "Content-Type": "application/json"
    };

    const fullUrl = `${UROPAY_BASE_URL}${path}`;
    console.log(`[UroPay Service] Posting order to ${fullUrl} (${creds.env} Mode): ${bodyObj.tenantOrderRef}`);

    try {
        // TRANSMIT THE EXACT RAW BODY STRING USED IN SIGNING
        const response = await axios.post(fullUrl, rawBody, { headers });
        const resData = response.data;

        if ((resData.code === 201 || resData.code === 200) && resData.data) {
            console.log(`[UroPay Service] Order Created Successfully: ${resData.data.id} | openUrl: ${resData.data.openUrl}`);
            return resData.data;
        }

        throw new Error(resData.message || "Failed to create UroPay order.");
    } catch (error) {
        const errData = error.response?.data;
        const statusCode = error.response?.status || 400;
        const msg = errData?.message || error.message || "UroPay API Order Creation Error";
        console.error(`[UroPay Service] Error (${statusCode}):`, msg, errData || "");

        const err = new Error(msg);
        err.statusCode = statusCode;
        err.responseData = errData;
        err.signingDetails = {
            method: "POST",
            fullUrl,
            signedPath: path,
            timestamp: signingResult.timestamp,
            nonce: signingResult.nonce,
            rawBodyLength: rawBody.length,
            rawBodySha256: crypto.createHash("sha256").update(rawBody).digest("hex"),
            canonicalSha256: crypto.createHash("sha256").update(signingResult.canonicalString).digest("hex"),
            signatureLength: signingResult.signature.length
        };
        throw err;
    }
}

/* ==========================================================
   VERIFY UROPAY ORDER STATUS (GET /v1/orders/{orderId})
========================================================== */
export async function verifyUroPayOrder(uropayOrderId) {
    const creds = getUroPayCredentials();

    if (!creds.apiKey || !creds.apiSecret) {
        throw new Error(`UroPay API Key or Secret is missing in environment.`);
    }

    const path = `/v1/orders/${encodeURIComponent(uropayOrderId)}`;
    const signingResult = signUroPayRequest("GET", path, "", "", creds.apiKey, creds.apiSecret);

    try {
        const response = await axios.get(`${UROPAY_BASE_URL}${path}`, { headers: signingResult.headers });
        const resData = response.data;

        if (resData.code === 200 && resData.data) {
            return resData.data;
        }

        throw new Error(resData.message || "Order not found on UroPay.");
    } catch (error) {
        const errData = error.response?.data;
        const msg = errData?.message || error.message || "UroPay Order Fetch Error";
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
    const creds = getUroPayCredentials();
    if (!creds.apiSecret) return false;

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
        .createHmac("sha256", creds.apiSecret)
        .update(canonicalString)
        .digest("hex");

    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(signature, "hex");

    if (expectedBuf.length !== actualBuf.length) return false;

    return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/* ==========================================================
   SAFE DIAGNOSTICS & MINIMAL TEST ORDER RUNNER
========================================================== */
export async function getUroPayDiagnostics() {
    const creds = getUroPayCredentials();
    const serverTimeISO = new Date().toISOString();
    const serverTimeUnix = Math.floor(Date.now() / 1000);

    const apiKeyPrefix = creds.apiKey ? creds.apiKey.slice(0, 4) : "";
    const apiKeySuffix = creds.apiKey ? creds.apiKey.slice(-4) : "";

    const diagData = {
        serverTimeISO,
        serverTimeUnix,
        environmentMode: creds.env,
        apiKey: {
            present: Boolean(creds.apiKey),
            variableNameUsed: creds.keyVarName,
            length: creds.apiKey.length,
            startsWithTest: creds.apiKey.startsWith("test_"),
            prefix: apiKeyPrefix,
            suffix: apiKeySuffix,
            hasLeadingWhitespace: creds.keyWhitespace.hasLeading,
            hasTrailingWhitespace: creds.keyWhitespace.hasTrailing,
            hasNewline: creds.keyWhitespace.hasNewline
        },
        apiSecret: {
            present: Boolean(creds.apiSecret),
            variableNameUsed: creds.secretVarName,
            length: creds.apiSecret.length,
            sha256Fingerprint: creds.secretFingerprint,
            hasLeadingWhitespace: creds.secretWhitespace.hasLeading,
            hasTrailingWhitespace: creds.secretWhitespace.hasTrailing,
            hasNewline: creds.secretWhitespace.hasNewline
        }
    };

    return diagData;
}

export async function runUroPayMinimalTestOrder() {
    const testRef = `diag_test_${Date.now()}`;
    const payload = {
        tenantOrderRef: testRef,
        amount: 1,
        currency: "INR"
    };

    const rawBody = JSON.stringify(payload);
    const creds = getUroPayCredentials();
    const path = "/v1/orders";
    const signing = signUroPayRequest("POST", path, "", rawBody, creds.apiKey, creds.apiSecret);

    const bodySha256 = crypto.createHash("sha256").update(rawBody).digest("hex");
    const canonicalSha256 = crypto.createHash("sha256").update(signing.canonicalString).digest("hex");

    const preFlightDetails = {
        method: "POST",
        fullUrl: `${UROPAY_BASE_URL}${path}`,
        signedPath: path,
        queryString: "EMPTY",
        timestamp: signing.timestamp,
        nonce: signing.nonce,
        rawBodyLength: rawBody.length,
        rawBodySha256: bodySha256,
        canonicalStringSha256: canonicalSha256,
        signatureLength: signing.signature.length
    };

    try {
        const orderRes = await createUroPayOrder(payload);
        return {
            success: true,
            preFlightDetails,
            order: orderRes
        };
    } catch (error) {
        return {
            success: false,
            preFlightDetails,
            errorStatusCode: error.statusCode || error.response?.status || 500,
            errorMessage: error.message,
            responseData: error.responseData || null,
            traceId: error.response?.headers?.["x-trace-id"] || error.response?.headers?.["traceid"] || null
        };
    }
}
