import {
    getBundlesByPlan
} from "./bundle.service.js";


/* ==========================================================
   NORMALIZE PLAN
========================================================== */

function normalizePlan(plan) {

    return String(
        plan || ""
    )
        .trim()
        .toLowerCase();

}


/* ==========================================================
   BUILD GOOGLE DRIVE URL
========================================================== */

function buildGoogleDriveUrl(fileId) {

    if (!fileId) {

        return null;

    }


    const value =
        String(
            fileId
        ).trim();


    if (!value) {

        return null;

    }


    /*
     * If Admin/service already returned
     * a complete Google Drive URL,
     * use it directly.
     */

    if (
        value.startsWith(
            "https://drive.google.com/"
        ) ||
        value.startsWith(
            "http://drive.google.com/"
        )
    ) {

        return value;

    }


    /*
     * Google Drive folder/file ID.
     *
     * Bundle service stores the extracted
     * Drive ID, so create the folder URL.
     */

    return (
        "https://drive.google.com/drive/folders/" +
        encodeURIComponent(
            value
        )
    );

}


/* ==========================================================
   FIND BUNDLE
========================================================== */

function findBundle(
    bundles,
    category
) {

    if (
        !Array.isArray(
            bundles
        ) ||
        bundles.length === 0
    ) {

        return null;

    }


    /*
     * No category supplied:
     *
     * Use first active bundle.
     */

    if (
        category === undefined ||
        category === null ||
        String(category).trim() === ""
    ) {

        return bundles[0];

    }


    const categoryValue =
        String(
            category
        )
            .trim()
            .toLowerCase();


    /*
     * Category can be:
     *
     * 1. Firestore document ID
     * 2. Bundle slug
     * 3. Page number
     * 4. Bundle name
     */

    const found =
        bundles.find(
            bundle => {

                const id =
                    String(
                        bundle.id || ""
                    )
                        .trim()
                        .toLowerCase();


                const slug =
                    String(
                        bundle.slug || ""
                    )
                        .trim()
                        .toLowerCase();


                const page =
                    String(
                        bundle.page ?? ""
                    )
                        .trim()
                        .toLowerCase();


                const name =
                    String(
                        bundle.name || ""
                    )
                        .trim()
                        .toLowerCase();


                return (

                    id ===
                    categoryValue

                    ||

                    slug ===
                    categoryValue

                    ||

                    page ===
                    categoryValue

                    ||

                    name ===
                    categoryValue

                );

            }
        );


    return found || null;

}


/* ==========================================================
   GET DOWNLOAD LINK
========================================================== */

export async function getDownloadLink(
    category,
    plan
) {

    try {

        /* --------------------------------------------------
           Normalize Plan
        -------------------------------------------------- */

        const normalizedPlan =
            normalizePlan(
                plan
            );


        /* --------------------------------------------------
           Validate Plan
        -------------------------------------------------- */

        if (
            normalizedPlan !==
                "basic" &&
            normalizedPlan !==
                "premium"
        ) {

            return {

                success:
                    false,

                status:
                    400,

                message:
                    "Invalid download plan."

            };

        }


        console.log(
            "[Download Service] Requested plan:",
            normalizedPlan
        );


        console.log(
            "[Download Service] Requested category:",
            category || "default"
        );


        /* --------------------------------------------------
           GET ACTIVE BUNDLES
        --------------------------------------------------

           IMPORTANT:

           bundle.service.js now handles the Firestore
           query safely.

           Only ACTIVE bundles belonging to the purchased
           plan are returned.
        -------------------------------------------------- */

        const bundles =
            await getBundlesByPlan(
                normalizedPlan
            );


        console.log(
            "[Download Service] Active bundles found:",
            Array.isArray(
                bundles
            )
                ? bundles.length
                : 0
        );


        /* --------------------------------------------------
           NO BUNDLE
        -------------------------------------------------- */

        if (
            !Array.isArray(
                bundles
            ) ||
            bundles.length === 0
        ) {

            return {

                success:
                    false,

                status:
                    404,

                message:
                    `No active ${normalizedPlan} bundle is available.`

            };

        }


        /* --------------------------------------------------
           SELECT BUNDLE
        -------------------------------------------------- */

        const bundle =
            findBundle(
                bundles,
                category
            );


        /* --------------------------------------------------
           CATEGORY WAS REQUESTED BUT NOT FOUND
        -------------------------------------------------- */

        if (
            category !== undefined &&
            category !== null &&
            String(
                category
            ).trim() !== "" &&
            !bundle
        ) {

            return {

                success:
                    false,

                status:
                    404,

                message:
                    "Requested bundle was not found or is inactive."

            };

        }


        /* --------------------------------------------------
           SAFETY FALLBACK
        -------------------------------------------------- */

        const selectedBundle =
            bundle ||
            bundles[0];


        if (!selectedBundle) {

            return {

                success:
                    false,

                status:
                    404,

                message:
                    "Bundle not found."

            };

        }


        console.log(
            "[Download Service] Selected bundle:",
            {
                id:
                    selectedBundle.id,

                name:
                    selectedBundle.name,

                slug:
                    selectedBundle.slug,

                page:
                    selectedBundle.page,

                plan:
                    selectedBundle.plan
            }
        );


        /* --------------------------------------------------
           GET PURCHASED PLAN DATA
        -------------------------------------------------- */

        const planData =
            selectedBundle[
                normalizedPlan
            ];


        if (!planData) {

            return {

                success:
                    false,

                status:
                    403,

                message:
                    `This bundle does not contain a ${normalizedPlan} download.`

            };

        }


        /* --------------------------------------------------
           GET DRIVE FILE ID
        -------------------------------------------------- */

        const fileId =
            planData.fileId;


        if (!fileId) {

            console.error(
                "[Download Service] Missing Drive file ID:",
                {
                    bundleId:
                        selectedBundle.id,

                    plan:
                        normalizedPlan
                }
            );


            return {

                success:
                    false,

                status:
                    404,

                message:
                    `Google Drive link is not configured for the ${normalizedPlan} bundle.`

            };

        }


        /* --------------------------------------------------
           BUILD DRIVE URL
        -------------------------------------------------- */

        const url =
            buildGoogleDriveUrl(
                fileId
            );


        if (!url) {

            return {

                success:
                    false,

                status:
                    404,

                message:
                    "Google Drive download link is invalid."

            };

        }


        console.log(
            "[Download Service] Drive URL prepared successfully."
        );


        /* --------------------------------------------------
           SUCCESS
        -------------------------------------------------- */

        return {

            success:
                true,

            status:
                200,

            url,

            bundle: {

                id:
                    selectedBundle.id,

                name:
                    selectedBundle.name,

                slug:
                    selectedBundle.slug,

                page:
                    selectedBundle.page,

                plan:
                    normalizedPlan,

                title:
                    planData.title ||
                    selectedBundle.name,

                thumbnail:
                    selectedBundle.thumbnail ||
                    null

            }

        };

    } catch (error) {

        console.error(
            "[Download Service] Error:",
            error
        );


        return {

            success:
                false,

            status:
                500,

            message:
                error?.message ||
                "Unable to prepare download."

        };

    }

}


/* ==========================================================
   GET ACTIVE DOWNLOAD BUNDLE
========================================================== */

export async function getActiveDownloadBundle(
    plan
) {

    try {

        const normalizedPlan =
            normalizePlan(
                plan
            );


        if (
            normalizedPlan !==
                "basic" &&
            normalizedPlan !==
                "premium"
        ) {

            throw new Error(
                "Invalid download plan."
            );

        }


        const bundles =
            await getBundlesByPlan(
                normalizedPlan
            );


        if (
            !Array.isArray(
                bundles
            ) ||
            bundles.length === 0
        ) {

            throw new Error(
                `No active ${normalizedPlan} bundle is available.`
            );

        }


        const bundle =
            bundles[0];


        return {

            id:
                bundle.id,

            name:
                bundle.name,

            slug:
                bundle.slug,

            page:
                bundle.page,

            plan:
                normalizedPlan,

            active:
                bundle.active,

            thumbnail:
                bundle.thumbnail ||
                null,

            basic:
                bundle.basic ||
                null,

            premium:
                bundle.premium ||
                null

        };

    } catch (error) {

        console.error(
            "[Download Service] getActiveDownloadBundle error:",
            error
        );


        throw error;

    }

}


/* ==========================================================
   END OF FILE
========================================================== */