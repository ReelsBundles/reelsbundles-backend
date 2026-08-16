"use strict";

import {
    getPaidPaymentsByUserUid
} from "../services/payment-storage.service.js";

import {
    getBundles
} from "../services/bundle.service.js";


/* ==========================================================
   RESOLVE USER ENTITLEMENT
========================================================== */

function resolveEntitlement(
    payments
) {

    let hasBasic =
        false;

    let hasPremium =
        false;

    payments.forEach(
        payment => {

            const plan =
                String(
                    payment.bundlePlan ||
                    payment.plan ||
                    payment.bundle_plan ||
                    ""
                )
                    .trim()
                    .toLowerCase();

            if (
                plan === "premium"
            ) {

                hasPremium =
                    true;

            }

            if (
                plan === "basic"
            ) {

                hasBasic =
                    true;

            }

        }
    );


    /*
     * Premium includes Basic.
     */

    if (hasPremium) {

        return "premium";

    }


    if (hasBasic) {

        return "basic";

    }


    return "free";

}


/* ==========================================================
   CHECK BUNDLE ACCESS
========================================================== */

function isBundleUnlocked(
    bundlePlan,
    entitlement
) {

    const plan =
        String(
            bundlePlan || ""
        )
            .trim()
            .toLowerCase();


    if (
        entitlement === "premium"
    ) {

        return (
            plan === "basic" ||
            plan === "premium"
        );

    }


    if (
        entitlement === "basic"
    ) {

        return (
            plan === "basic"
        );

    }


    return false;

}


/* ==========================================================
   USER LIBRARY
========================================================== */

export const getUserLibrary = async (
    req,
    res
) => {

    try {

        const user =
            req.user;


        if (
            !user?.uid
        ) {

            return res.status(401).json({

                success:
                    false,

                message:
                    "User authentication required."

            });

        }


        /* --------------------------------------------------
           GET USER PAYMENTS
        -------------------------------------------------- */

        const payments =
            await getPaidPaymentsByUserUid(
                user.uid
            );


        /* --------------------------------------------------
           RESOLVE ENTITLEMENT
        -------------------------------------------------- */

        const entitlement =
            resolveEntitlement(
                payments
            );


        /* --------------------------------------------------
           GET LIVE ADMIN BUNDLES
        -------------------------------------------------- */

        const allBundles =
            await getBundles();


        const activeBundles =
            allBundles.filter(
                bundle =>
                    bundle &&
                    bundle.active === true
            );


        /* --------------------------------------------------
           SAFE USER BUNDLE LIST
        -------------------------------------------------- */

        const bundles =
            activeBundles.map(
                bundle => {

                    const plan =
                        String(
                            bundle.plan || ""
                        )
                            .trim()
                            .toLowerCase();

                    const planData =
                        bundle[plan] ||
                        {};

                    const unlocked =
                        isBundleUnlocked(
                            plan,
                            entitlement
                        );

                    return {

                        id:
                            bundle.id,

                        name:
                            bundle.name ||
                            "Reels Bundle",

                        slug:
                            bundle.slug ||
                            null,

                        page:
                            bundle.page ??
                            null,

                        plan,

                        title:
                            planData.title ||
                            bundle.name ||
                            "Reels Bundle",

                        thumbnail:
                            bundle.thumbnail ||
                            null,

                        active:
                            true,

                        unlocked

                    };

                }
            );


        /* --------------------------------------------------
           COUNTERS
        -------------------------------------------------- */

        const unlockedCount =
            bundles.filter(
                bundle =>
                    bundle.unlocked === true
            ).length;


        const lockedCount =
            bundles.length -
            unlockedCount;


        /* --------------------------------------------------
           RESPONSE
        -------------------------------------------------- */

        return res.json({

            success:
                true,

            user: {

                uid:
                    user.uid,

                email:
                    user.email || "",

                name:
                    user.name || ""

            },

            entitlement,

            purchases:
                payments.map(
                    payment => ({

                        orderId:
                            payment.orderId ||
                            payment.id,

                        plan:
                            payment.bundlePlan ||
                            payment.plan ||
                            payment.bundle_plan ||
                            null,

                        amount:
                            payment.amount ??
                            null,

                        paymentStatus:
                            "PAID",

                        createdAt:
                            payment.createdAt ||
                            null

                    })
                ),

            stats: {

                total:
                    bundles.length,

                unlocked:
                    unlockedCount,

                locked:
                    lockedCount

            },

            bundles

        });

    }
    catch (error) {

        console.error(
            "[User Library] Error:",
            error
        );


        return res.status(500).json({

            success:
                false,

            message:
                "Unable to load your bundle library."

        });

    }

};