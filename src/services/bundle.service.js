import { db } from "../config/firebase.js";

import {
    encrypt,
    decrypt
} from "../utils/encryption.js";

import {
    extractFileId,
    isValidFileId
} from "../utils/drive.js";


const collection =
    db.collection("bundles");


/* ==========================================================
   HELPERS
========================================================== */

function now() {

    return new Date();

}


/* ==========================================================
   CREATE SLUG
========================================================== */

function createSlug(name) {

    return String(name || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

}


/* ==========================================================
   CHECK SLUG EXISTS
========================================================== */

async function slugExists(
    slug,
    ignoreId = null
) {

    const snapshot =
        await collection
            .where(
                "slug",
                "==",
                slug
            )
            .limit(1)
            .get();


    if (snapshot.empty) {

        return false;

    }


    if (!ignoreId) {

        return true;

    }


    const doc =
        snapshot.docs[0];


    return doc.id !== ignoreId;

}


/* ==========================================================
   NORMALIZE BUNDLE
========================================================== */

function normalizeBundle(data) {
    if (!data) {
        throw new Error("Bundle data is required.");
    }

    const plan = String(data.plan || "").trim().toLowerCase();

    if (plan !== "basic" && plan !== "premium") {
        throw new Error("Invalid bundle plan.");
    }

    const basicTitle = String(data.basic?.title || data.title || data.name || "").trim();
    const premiumTitle = String(data.premium?.title || data.title || data.name || "").trim();

    /*
     * ADMIN INPUT:
     * Only ONE Google Drive folder link is required for the selected plan.
     * No file link / ZIP / sub-folder is required.
     *
     * We accept both folderLink and folderId for compatibility with the
     * existing admin form. If a full Drive folder URL is supplied,
     * extractFileId() converts it to the folder ID.
     */
    const basicFolderLink = String(
        data.basic?.folderLink || data.basic?.folderId || ""
    ).trim();

    const premiumFolderLink = String(
        data.premium?.folderLink || data.premium?.folderId || ""
    ).trim();

    const basicMegaLink = String(
        data.basic?.megaLink || data.basic?.megaUrl || data.megaLink || ""
    ).trim();

    const premiumMegaLink = String(
        data.premium?.megaLink || data.premium?.megaUrl || data.megaLink || ""
    ).trim();

    let basicFolderId = "";
    let premiumFolderId = "";

    if (plan === "basic") {
        if (!basicTitle) {
            throw new Error("Basic bundle title is required.");
        }

        if (!basicFolderLink && !basicMegaLink) {
            throw new Error("At least one storage link (Google Drive or MEGA.nz) is required for Basic plan.");
        }

        if (basicFolderLink) {
            basicFolderId = extractFileId(basicFolderLink);
            if (!isValidFileId(basicFolderId)) {
                throw new Error("Invalid Basic Google Drive Folder Link.");
            }
        }
    }

    if (plan === "premium") {
        if (!premiumTitle) {
            throw new Error("Premium bundle title is required.");
        }

        if (!premiumFolderLink && !premiumMegaLink) {
            throw new Error("At least one storage link (Google Drive or MEGA.nz) is required for Premium plan.");
        }

        if (premiumFolderLink) {
            premiumFolderId = extractFileId(premiumFolderLink);
            if (!isValidFileId(premiumFolderId)) {
                throw new Error("Invalid Premium Google Drive Folder Link.");
            }
        }
    }

    return {
        name: String(data.name || "").trim(),
        slug: createSlug(data.name),
        plan,
        page: Number(data.page) || 0,
        thumbnail: String(data.thumbnail || "").trim(),

        basic: {
            title: plan === "basic" ? basicTitle : "",
            fileId: null,
            folderId: plan === "basic" && basicFolderId ? encrypt(basicFolderId) : null,
            folderLink: plan === "basic" ? basicFolderLink : "",
            megaLink: plan === "basic" ? basicMegaLink : ""
        },

        premium: {
            title: plan === "premium" ? premiumTitle : "",
            fileId: null,
            folderId: plan === "premium" && premiumFolderId ? encrypt(premiumFolderId) : null,
            folderLink: plan === "premium" ? premiumFolderLink : "",
            megaLink: plan === "premium" ? premiumMegaLink : ""
        },

        active: Boolean(data.active),
        updatedAt: now()
    };
}

/* ==========================================================
   MAP FIRESTORE DOCUMENT
   ----------------------------------------------------------
   Converts Firestore bundle document into application object.
========================================================== */

function mapBundle(doc) {

    const data =
        doc.data() || {};


    const basic =
        data.basic || {};


    const premium =
        data.premium || {};


    return {

        id:
            doc.id,


        ...data,


        basic: {

            ...basic,


            fileId:
                basic.fileId
                    ? decrypt(
                        basic.fileId
                    )
                    : null,


            folderId:
                basic.folderId
                    ? decrypt(
                        basic.folderId
                    )
                    : null

        },


        premium: {

            ...premium,


            fileId:
                premium.fileId
                    ? decrypt(
                        premium.fileId
                    )
                    : null,


            folderId:
                premium.folderId
                    ? decrypt(
                        premium.folderId
                    )
                    : null

        }

    };

}
/* ==========================================================
   GET ALL BUNDLES
   ----------------------------------------------------------
   Returns bundle information with decrypted Drive IDs
   internally for trusted backend usage.

   IMPORTANT:
   Google Drive IDs are NEVER exposed directly to
   the public/user API.
========================================================== */

export async function getBundles() {

    const snapshot =
        await collection
            .orderBy("name")
            .get();


    const bundles = [];


    snapshot.forEach(
        (doc) => {

            const data =
                doc.data() || {};


            const mapped =
                mapBundle(doc);


            bundles.push(
                mapped
            );

        }
    );


    return bundles;

}
/* ==========================================================
   GET SINGLE BUNDLE
========================================================== */

export async function getBundle(
    id
) {

    if (!id) {

        return null;

    }


    const doc =
        await collection
            .doc(id)
            .get();


    if (!doc.exists) {

        return null;

    }


    return mapBundle(doc);

}


/* ==========================================================
   CREATE BUNDLE
========================================================== */

export async function createBundle(
    data
) {

    const bundle =
        normalizeBundle(
            data
        );


    const exists =
        await slugExists(
            bundle.slug
        );


    if (exists) {

        throw new Error(
            "Bundle already exists."
        );

    }


    bundle.createdAt =
        now();


    const doc =
        await collection.add(
            bundle
        );


    return {

        id:
            doc.id,

        ...bundle

    };

}


/* ==========================================================
   UPDATE BUNDLE
========================================================== */

export async function updateBundle(
    id,
    data
) {

    if (!id) {

        throw new Error(
            "Bundle ID is required."
        );

    }


    const doc =
        await collection
            .doc(id)
            .get();


    if (!doc.exists) {

        throw new Error(
            "Bundle not found."
        );

    }


    const bundle =
        normalizeBundle(
            data
        );


    const exists =
        await slugExists(
            bundle.slug,
            id
        );


    if (exists) {

        throw new Error(
            "Bundle name already exists."
        );

    }


    await collection
        .doc(id)
        .update(
            bundle
        );


    return {

        id,

        ...bundle

    };

}


/* ==========================================================
   REPLACE GOOGLE DRIVE LINKS
========================================================== */

export async function replaceBundleLinks(
    id,
    basicLink,
    premiumLink
) {
    if (!id) {
        throw new Error("Bundle ID is required.");
    }

    const update = {
        updatedAt: now()
    };

    if (basicLink) {
        const basicFolderId = extractFileId(basicLink);
        if (!isValidFileId(basicFolderId)) {
            throw new Error("Invalid Basic Google Drive Folder Link");
        }
        update["basic.folderId"] = encrypt(basicFolderId);
        update["basic.fileId"] = null;
    }

    if (premiumLink) {
        const premiumFolderId = extractFileId(premiumLink);
        if (!isValidFileId(premiumFolderId)) {
            throw new Error("Invalid Premium Google Drive Folder Link");
        }
        update["premium.folderId"] = encrypt(premiumFolderId);
        update["premium.fileId"] = null;
    }

    if (Object.keys(update).length === 1) {
        throw new Error("At least one Google Drive Folder Link is required.");
    }

    await collection.doc(id).update(update);
}

/* ==========================================================
   UPDATE STATUS
========================================================== */

export async function updateBundleStatus(
    id,
    active
) {

    if (!id) {

        throw new Error(
            "Bundle ID is required."
        );

    }


    await collection
        .doc(id)
        .update({

            active:
                Boolean(
                    active
                ),

            updatedAt:
                now()

        });

}


/* ==========================================================
   CHECK BUNDLE EXISTS
========================================================== */

export async function bundleExists(
    id
) {

    if (!id) {

        return false;

    }


    const doc =
        await collection
            .doc(id)
            .get();


    return doc.exists;

}


/* ==========================================================
   DELETE BUNDLE
========================================================== */

export async function deleteBundle(
    id
) {

    if (!id) {

        throw new Error(
            "Bundle ID is required."
        );

    }


    const doc =
        await collection
            .doc(id)
            .get();


    if (!doc.exists) {

        throw new Error(
            "Bundle not found."
        );

    }


    await collection
        .doc(id)
        .delete();


    return true;

}


/* ==========================================================
   TOGGLE ACTIVE / INACTIVE
========================================================== */

export async function toggleBundle(
    id
) {

    if (!id) {

        throw new Error(
            "Bundle ID is required."
        );

    }


    const doc =
        await collection
            .doc(id)
            .get();


    if (!doc.exists) {

        throw new Error(
            "Bundle not found."
        );

    }


    const data =
        doc.data();


    const newStatus =
        !Boolean(
            data.active
        );


    await collection
        .doc(id)
        .update({

            active:
                newStatus,

            updatedAt:
                now()

        });


    return newStatus;

}


/* ==========================================================
   SEARCH BUNDLES
========================================================== */

export async function searchBundles(
    keyword
) {

    const allBundles =
        await getBundles();


    const q =
        String(
            keyword || ""
        )
            .trim()
            .toLowerCase();


    if (!q) {

        return allBundles;

    }


    return allBundles.filter(
        bundle => {

            const name =
                String(
                    bundle.name || ""
                )
                    .toLowerCase();


            const slug =
                String(
                    bundle.slug || ""
                )
                    .toLowerCase();


            return (
                name.includes(q) ||
                slug.includes(q)
            );

        }
    );

}


/* ==========================================================
   GET BUNDLES BY PLAN
==========================================================

   IMPORTANT DOWNLOAD FIX

   OLD:

   .where("plan", "==", plan)
   .where("active", "==", true)
   .orderBy("page")

   This could require a Firestore composite index.

   NEW:

   1. Read ACTIVE bundles only.
   2. Filter plan in JavaScript.
   3. Sort by page in JavaScript.

   This keeps the Admin bundle structure intact and avoids
   the compound Firestore query for the download flow.

========================================================== */

export async function getBundlesByPlan(
    plan
) {

    const normalizedPlan =
        String(
            plan || ""
        )
            .trim()
            .toLowerCase();


    if (
        normalizedPlan !== "basic" &&
        normalizedPlan !== "premium"
    ) {

        return [];

    }


    /*
     * IMPORTANT:
     *
     * Only one Firestore filter.
     *
     * Firestore automatically handles the single-field
     * index for "active".
     */

    const snapshot =
        await collection
            .where(
                "active",
                "==",
                true
            )
            .get();


    const bundles = [];


    snapshot.forEach(
        doc => {

            const data =
                doc.data();


            const bundlePlan =
                String(
                    data.plan || ""
                )
                    .trim()
                    .toLowerCase();


            /*
             * Filter purchased plan locally.
             */

            if (
                bundlePlan !==
                normalizedPlan
            ) {

                return;

            }


            bundles.push(
                mapBundle(doc)
            );

        }
    );


    /*
     * Sort AFTER Firestore query.
     *
     * No Firestore orderBy is required.
     */

    bundles.sort(
        (
            a,
            b
        ) => {

            const pageA =
                Number(
                    a.page
                ) || 0;


            const pageB =
                Number(
                    b.page
                ) || 0;


            if (
                pageA !==
                pageB
            ) {

                return (
                    pageA -
                    pageB
                );

            }


            return String(
                a.name || ""
            )
                .localeCompare(
                    String(
                        b.name || ""
                    )
                );

        }
    );


    return bundles;

}


/* ==========================================================
   GET BUNDLES BY PAGE
========================================================== */

export async function getBundlesByPage(
    page
) {

    const requestedPage =
        Number(
            page
        );


    if (
        !Number.isFinite(
            requestedPage
        )
    ) {

        return [];

    }


    const snapshot =
        await collection
            .where(
                "page",
                "==",
                requestedPage
            )
            .where(
                "active",
                "==",
                true
            )
            .get();


    const bundles = [];


    snapshot.forEach(
        doc => {

            bundles.push(
                mapBundle(doc)
            );

        }
    );


    return bundles;

}


/* ==========================================================
   DASHBOARD STATS
========================================================== */

export async function getBundleStats() {

    const bundles =
        await getBundles();


    return {

        total:
            bundles.length,

        active:
            bundles.filter(
                b =>
                    b.active
            ).length,

        inactive:
            bundles.filter(
                b =>
                    !b.active
            ).length,

        basic:
            bundles.filter(
                b =>
                    String(
                        b.plan || ""
                    )
                        .toLowerCase() ===
                    "basic"
            ).length,

        premium:
            bundles.filter(
                b =>
                    String(
                        b.plan || ""
                    )
                        .toLowerCase() ===
                    "premium"
            ).length

    };

}


/* ==========================================================
   GET ACTIVE DOWNLOAD BUNDLE
========================================================== */

export async function getActiveDownloadBundle(plan) {
    const normalizedPlan = String(plan || "").trim().toLowerCase();

    if (normalizedPlan !== "basic" && normalizedPlan !== "premium") {
        throw new Error("Invalid download plan.");
    }

    const bundles = await getBundlesByPlan(normalizedPlan);

    if (!bundles || bundles.length === 0) {
        throw new Error(`No active ${normalizedPlan} bundle is available.`);
    }

    const bundle = bundles[0];
    const planData = bundle?.[normalizedPlan] || {};

    return {
        id: bundle.id,
        name: bundle.name,
        slug: bundle.slug,
        plan: normalizedPlan,
        active: bundle.active === true,
        page: bundle.page,
        title: planData.title || bundle.name || "Reels Bundle",
        thumbnail: bundle.thumbnail || null
    };
}

/* ==========================================================
   GET PUBLIC ACTIVE BUNDLES
==========================================================

   IMPORTANT:

   Admin can add/update/delete bundles.

   User dashboard automatically receives
   active bundles.

   Secure Google Drive IDs are NEVER returned.
========================================================== */

export async function getPublicActiveBundles() {

    const snapshot =
        await collection
            .where(
                "active",
                "==",
                true
            )
            .get();


    const bundles = [];


    snapshot.forEach(
        (doc) => {

            const data =
                doc.data() || {};


            bundles.push({

                id:
                    doc.id,

                name:
                    data.name ||
                    "Reels Bundle",

                slug:
                    data.slug ||
                    "",

                plan:
                    String(
                        data.plan || ""
                    )
                        .trim()
                        .toLowerCase(),

                page:
                    Number(
                        data.page || 1
                    ),

                thumbnail:
                    data.thumbnail ||
                    "",

                active:
                    data.active === true,

                title:
                    data.title ||
                    data.name ||
                    "Ready-To-Post Reels"

            });

        }
    );


    /* --------------------------------------------------
       SORT
    -------------------------------------------------- */

    bundles.sort(
        (a, b) => {

            const pageA =
                Number(
                    a.page || 1
                );


            const pageB =
                Number(
                    b.page || 1
                );


            if (
                pageA !== pageB
            ) {

                return (
                    pageA -
                    pageB
                );

            }


            return String(
                a.name || ""
            )
                .localeCompare(
                    String(
                        b.name || ""
                    )
                );

        }
    );


    return bundles;

}


/* ==========================================================
   BULK CREATE BUNDLES
========================================================== */

export async function createBulkBundles(items) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error("No bundles provided for bulk creation.");
    }

    let createdCount = 0;
    let skippedCount = 0;
    const errors = [];
    const createdBundles = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
            if (!item || !item.name || (!item.driveLink && !item.basic?.folderLink && !item.premium?.folderLink)) {
                skippedCount++;
                errors.push({ row: i + 1, name: item?.name || `Row ${i + 1}`, error: "Name and Drive Link are required." });
                continue;
            }

            const plan = String(item.plan || "basic").trim().toLowerCase() === "premium" ? "premium" : "basic";
            const driveLink = item.driveLink || item.link || (plan === "premium" ? item.premium?.folderLink : item.basic?.folderLink) || "";

            const bundlePayload = {
                name: String(item.name).trim(),
                plan: plan,
                page: Number(item.page) || 1,
                thumbnail: String(item.thumbnail || "").trim(),
                active: item.active !== false,
                basic: {
                    title: plan === "basic" ? String(item.name).trim() : "",
                    folderLink: plan === "basic" ? driveLink : ""
                },
                premium: {
                    title: plan === "premium" ? String(item.name).trim() : "",
                    folderLink: plan === "premium" ? driveLink : ""
                }
            };

            const created = await createBundle(bundlePayload);
            createdCount++;
            createdBundles.push(created);
        } catch (err) {
            skippedCount++;
            errors.push({ row: i + 1, name: item?.name || `Row ${i + 1}`, error: err.message });
        }
    }

    return {
        totalProcessed: items.length,
        createdCount,
        skippedCount,
        errors,
        createdBundles
    };
}


/* ==========================================================
   DELETE ALL BUNDLES
========================================================== */

export async function deleteAllBundles() {
    const snapshot = await collection.get();
    if (snapshot.empty) {
        return { deletedCount: 0 };
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });

    await batch.commit();
    return { deletedCount: snapshot.size };
}