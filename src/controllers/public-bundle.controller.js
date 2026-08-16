"use strict";

import {
    getBundles
} from "../services/bundle.service.js";

/* ==========================================================
   PUBLIC / USER BUNDLE LIST
   ========================================================== */

export async function listPublicBundles(
    req,
    res
) {
    try {

        const bundles =
            await getBundles();

        /*
         * Only ACTIVE bundles are visible
         * on the user side.
         */
        const activeBundles =
            bundles.filter(
                bundle =>
                    bundle &&
                    bundle.active === true
            );

        /*
         * NEVER expose:
         *
         * basic.fileId
         * premium.fileId
         *
         * Those are private download credentials.
         *
         * User side receives only information
         * required to create cards.
         */
        const safeBundles =
            activeBundles.map(
                bundle => {

                    const plan =
                        String(
                            bundle.plan || ""
                        )
                            .trim()
                            .toLowerCase();

                    const selected =
                        plan === "premium"
                            ? bundle.premium
                            : bundle.basic;

                    return {
                        id:
                            bundle.id,

                        name:
                            bundle.name || "",

                        slug:
                            bundle.slug || "",

                        plan,

                        page:
                            bundle.page ?? null,

                        thumbnail:
                            bundle.thumbnail || "",

                        active:
                            true,

                        title:
                            selected?.title || ""
                    };
                }
            );

        return res.json({
            success: true,
            bundles: safeBundles
        });

    } catch (error) {

        console.error(
            "[Public Bundles] Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to load bundles."
        });
    }
}