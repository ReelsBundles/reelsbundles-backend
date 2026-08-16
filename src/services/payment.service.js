import { v4 as uuid } from "uuid";


/* ==========================================================
   PLANS
========================================================== */

const PLANS = {

    basic: {

        id: "basic",

        name: "Basic Bundle",

        amount: 49

    },

    premium: {

        id: "premium",

        name: "Premium Bundle",

        amount: 69

    }

};


/* ==========================================================
   GET PLAN
========================================================== */

export function getPlan(plan) {

    if (!PLANS[plan]) {

        return null;

    }

    return PLANS[plan];

}


/* ==========================================================
   GENERATE ORDER
========================================================== */

export function generateOrder(
    plan,
    bundleId = null
) {

    const orderId =
        `RB_${plan.id}_${uuid()}`;


    return {

        order_id:
            orderId,

        order_amount:
            plan.amount,

        order_currency:
            "INR",

        order_note:
            plan.name,


        /*
         * Bundle document ID
         *
         * This is NOT the Google Drive ID.
         * It identifies the bundle inside Firestore.
         */

        bundle_id:
            bundleId || null,


        /*
         * Plan purchased
         */

        bundle_plan:
            plan.id

    };

}