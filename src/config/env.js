/* ==========================================================
   REELSBUNDLES BACKEND
   ENVIRONMENT CONFIG
   PHASE A3
========================================================== */

import dotenv from "dotenv";


/* ==========================================================
   LOAD .ENV
========================================================== */

dotenv.config();


/* ==========================================================
   HELPERS
========================================================== */

function getEnv(
    name,
    fallback = undefined
) {

    const value =
        process.env[name];


    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {

        return fallback;

    }


    return value;

}


/* ==========================================================
   BOOLEAN
========================================================== */

function getBoolean(
    name,
    fallback = false
) {

    const value =
        getEnv(
            name
        );


    if (
        value === undefined
    ) {

        return fallback;

    }


    return (
        String(value)
            .trim()
            .toLowerCase()
    ) === "true";

}


/* ==========================================================
   NUMBER
========================================================== */

function getNumber(
    name,
    fallback = undefined
) {

    const value =
        getEnv(
            name
        );


    if (
        value === undefined
    ) {

        return fallback;

    }


    const number =
        Number(value);


    return Number.isFinite(
        number
    )
        ? number
        : fallback;

}


/* ==========================================================
   FRONTEND URL
========================================================== */

const FRONTEND_URL =
    getEnv(
        "FRONTEND_URL",
        "https://reelsbundles.github.io"
    );


const BACKEND_URL =
    getEnv(
        "BACKEND_URL",
        "https://reelsbundles-backend.onrender.com"
    );


/* ==========================================================
   ALLOWED ORIGINS
========================================================== */

const ALLOWED_ORIGINS =
    getEnv(
        "ALLOWED_ORIGINS",
        FRONTEND_URL || ""
    )
        .split(",")
        .map(
            origin =>
                origin.trim()
        )
        .filter(Boolean);


/* ==========================================================
   ENV CONFIG
========================================================== */

const env = {

    /* ------------------------------------------------------
       SERVER
    ------------------------------------------------------ */

    PORT:
        getNumber(
            "PORT",
            3000
        ),


    NODE_ENV:
        getEnv(
            "NODE_ENV",
            "development"
        ),


    FRONTEND_URL,


    BACKEND_URL,


    ALLOWED_ORIGINS,


    /* ------------------------------------------------------
       CASHFREE
    ------------------------------------------------------ */

    CASHFREE_CLIENT_ID:
        getEnv(
            "CASHFREE_CLIENT_ID"
        ),


    CASHFREE_CLIENT_SECRET:
        getEnv(
            "CASHFREE_CLIENT_SECRET"
        ),


    CASHFREE_ENV:
        getEnv(
            "CASHFREE_ENV",
            "sandbox"
        ),


    /* ------------------------------------------------------
       SMTP
    ------------------------------------------------------ */

    SMTP_USER:
        getEnv(
            "SMTP_USER"
        ),


    SMTP_APP_PASSWORD:
        getEnv(
            "SMTP_APP_PASSWORD"
        ),


    SMTP_FROM_NAME:
        getEnv(
            "SMTP_FROM_NAME",
            "ReelsBundles"
        ),


    /* ------------------------------------------------------
       SECURITY
    ------------------------------------------------------ */

    TRUST_PROXY:
        getBoolean(
            "TRUST_PROXY",
            true
        ),


    /* ------------------------------------------------------
       DOWNLOAD SECURITY
    ------------------------------------------------------ */

    DOWNLOAD_LOG_ENABLED:
        getBoolean(
            "DOWNLOAD_LOG_ENABLED",
            true
        ),


    /* ------------------------------------------------------
       DOWNLOAD ACCESS
    ------------------------------------------------------

       IMPORTANT:

       Lifetime access is NOT implemented by putting
       a permanent token in the URL.

       User ownership is checked through Firebase
       authentication + backend entitlement.

    ------------------------------------------------------ */

    LIFETIME_ACCESS:
        getBoolean(
            "LIFETIME_ACCESS",
            true
        ),


    /* ------------------------------------------------------
       DOWNLOAD LIMIT

       null = no artificial lifetime download limit.

       Admin/backend authorization can still revoke
       access at any time.
    ------------------------------------------------------ */

    DOWNLOAD_LIMIT:
        getNumber(
            "DOWNLOAD_LIMIT",
            null
        )

};


/* ==========================================================
   PRODUCTION VALIDATION
========================================================== */

if (
    env.NODE_ENV ===
    "production"
) {

    const requiredProductionVariables = [

        "FRONTEND_URL",

        "CASHFREE_CLIENT_ID",

        "CASHFREE_CLIENT_SECRET",

        "SMTP_USER",

        "SMTP_APP_PASSWORD"

    ];


    const missing =
        requiredProductionVariables.filter(
            variable =>
                !getEnv(
                    variable
                )
        );


    if (
        missing.length > 0
    ) {

        throw new Error(
            `Missing required production environment variables: ${missing.join(", ")}`
        );

    }

}


/* ==========================================================
   EXPORT
========================================================== */

export default env;