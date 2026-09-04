import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../config/firebase.js";

import {
    encrypt,
    decrypt
} from "../utils/encryption.js";

import {
    extractFileId,
    isValidFileId
} from "../utils/drive.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../../data");
const BUNDLES_FILE = path.join(DATA_DIR, "bundles.json");

function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
}

export function loadLocalBundles() {
    try {
        if (!fs.existsSync(BUNDLES_FILE)) {
            ensureDirectoryExistence(BUNDLES_FILE);
            fs.writeFileSync(BUNDLES_FILE, "[]", "utf-8");
            return [];
        }
        const raw = fs.readFileSync(BUNDLES_FILE, "utf-8");
        return JSON.parse(raw || "[]");
    } catch (err) {
        console.warn("[BUNDLE SERVICE] Load local bundles error:", err.message);
        return [];
    }
}

export function saveLocalBundles(bundles) {
    try {
        ensureDirectoryExistence(BUNDLES_FILE);
        fs.writeFileSync(BUNDLES_FILE, JSON.stringify(bundles, null, 2), "utf-8");
        return true;
    } catch (err) {
        console.warn("[BUNDLE SERVICE] Save local bundles error:", err.message);
        return false;
    }
}

const collection =
    db ? db.collection("bundles") : null;


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

    try {
        if (collection) {
            const snapshot =
                await collection
                    .where(
                        "slug",
                        "==",
                        slug
                    )
                    .limit(1)
                    .get();

            if (!snapshot.empty) {
                if (!ignoreId) return true;
                const doc = snapshot.docs[0];
                return doc.id !== ignoreId;
            }
        }
    } catch (e) {
        console.warn("[slugExists] Firestore query warning:", e.message);
    }

    const localBundles = loadLocalBundles();
    return localBundles.some(b => b.slug === slug && (!ignoreId || b.id !== ignoreId));

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
            folderLink: plan === "basic" && basicFolderLink ? encrypt(basicFolderLink) : "",
            megaLink: plan === "basic" && basicMegaLink ? encrypt(basicMegaLink) : ""
        },

        premium: {
            title: plan === "premium" ? premiumTitle : "",
            fileId: null,
            folderId: plan === "premium" && premiumFolderId ? encrypt(premiumFolderId) : null,
            folderLink: plan === "premium" && premiumFolderLink ? encrypt(premiumFolderLink) : "",
            megaLink: plan === "premium" && premiumMegaLink ? encrypt(premiumMegaLink) : ""
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
    const data = doc.data() || {};
    const basic = data.basic || {};
    const premium = data.premium || {};

    return {
        id: doc.id,
        ...data,

        basic: {
            ...basic,
            fileId: basic.fileId ? decrypt(basic.fileId) : null,
            folderId: basic.folderId ? decrypt(basic.folderId) : null,
            folderLink: basic.folderLink ? decrypt(basic.folderLink) : "",
            megaLink: basic.megaLink ? decrypt(basic.megaLink) : ""
        },

        premium: {
            ...premium,
            fileId: premium.fileId ? decrypt(premium.fileId) : null,
            folderId: premium.folderId ? decrypt(premium.folderId) : null,
            folderLink: premium.folderLink ? decrypt(premium.folderLink) : "",
            megaLink: premium.megaLink ? decrypt(premium.megaLink) : ""
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
    let snapshot = null;
    try {
        if (collection) {
            try {
                snapshot = await collection.orderBy("name").get();
            } catch (e) {
                snapshot = await collection.get();
            }
        }
    } catch (e) {
        console.warn("[getBundles] Firestore query failed (fallback to local bundles):", e.message);
    }

    if (snapshot && !snapshot.empty) {
        const bundles = [];
        snapshot.forEach((doc) => {
            try {
                const mapped = mapBundle(doc);
                bundles.push(mapped);
            } catch (err) {
                console.warn(`[getBundles] Error mapping bundle doc ${doc.id}:`, err.message);
                bundles.push({ id: doc.id, ...doc.data() });
            }
        });
        if (bundles.length > 0) {
            saveLocalBundles(bundles);
            return bundles;
        }
    }

    return loadLocalBundles();
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

    try {
        if (collection) {
            const doc =
                await collection
                    .doc(id)
                    .get();

            if (doc.exists) {
                return mapBundle(doc);
            }
        }
    } catch (e) {
        console.warn(`[getBundle] Firestore get failed for ${id} (fallback to local):`, e.message);
    }

    const localBundles = loadLocalBundles();
    return localBundles.find(b => String(b.id) === String(id) || String(b.slug) === String(id)) || null;

}


/* ==========================================================
   CREATE BUNDLE
========================================================== */

export async function createBundle(data) {
    const bundle = normalizeBundle(data);

    let exists = await slugExists(bundle.slug);
    if (exists) {
        let counter = 1;
        const originalSlug = bundle.slug;
        while (exists) {
            counter++;
            bundle.slug = `${originalSlug}-${counter}`;
            exists = await slugExists(bundle.slug);
        }
    }

    bundle.createdAt = now();

    let docId = "bnd_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    try {
        if (collection) {
            const doc =
                await collection.add(
                    bundle
                );
            docId = doc.id;
        }
    } catch (e) {
        console.warn("[createBundle] Firestore add warning (saved locally):", e.message);
    }

    const created = {
        id: docId,
        ...bundle
    };

    const localBundles = loadLocalBundles();
    localBundles.unshift(created);
    saveLocalBundles(localBundles);

    return created;

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

    const localBundles = loadLocalBundles();
    const idx = localBundles.findIndex(b => String(b.id) === String(id));
    if (idx >= 0) {
        localBundles[idx] = { ...localBundles[idx], ...bundle, updatedAt: now() };
        saveLocalBundles(localBundles);
    }

    try {
        if (collection) {
            await collection
                .doc(id)
                .update(
                    bundle
                );
        }
    } catch (e) {
        console.warn(`[updateBundle] Firestore update failed for ${id} (updated locally):`, e.message);
    }

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

    const localBundles = loadLocalBundles().filter(b => String(b.id) !== String(id));
    saveLocalBundles(localBundles);

    try {
        if (collection) {
            await collection
                .doc(id)
                .delete();
        }
    } catch (e) {
        console.warn(`[deleteBundle] Firestore delete failed for ${id}:`, e.message);
    }

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

    let newStatus = false;
    const localBundles = loadLocalBundles();
    const idx = localBundles.findIndex(b => String(b.id) === String(id));
    if (idx >= 0) {
        newStatus = !Boolean(localBundles[idx].active);
        localBundles[idx].active = newStatus;
        localBundles[idx].updatedAt = now();
        saveLocalBundles(localBundles);
    }

    try {
        if (collection) {
            const doc =
                await collection
                    .doc(id)
                    .get();

            if (doc.exists) {
                const data = doc.data();
                newStatus = !Boolean(data.active);
                await collection
                    .doc(id)
                    .update({
                        active: newStatus,
                        updatedAt: now()
                    });
            }
        }
    } catch (e) {
        console.warn(`[toggleBundle] Firestore toggle failed for ${id}:`, e.message);
    }

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

    const allBundles = await getBundles();
    const bundles = allBundles.filter(b => {
        const bundlePlan = String(b.plan || "").trim().toLowerCase();
        return b.active === true && bundlePlan === normalizedPlan;
    });

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

    const allBundles = await getBundles();
    const activeBundles = allBundles.filter(b => b && b.active === true);

    const bundles = activeBundles.map(data => ({
        id: data.id,
        name: data.name || "Reels Bundle",
        slug: data.slug || "",
        plan: String(data.plan || "").trim().toLowerCase(),
        page: Number(data.page || 1),
        thumbnail: data.thumbnail || "",
        active: true,
        title: data.title || data.name || "Ready-To-Post Reels"
    }));

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
            const plan = String(item.plan || "basic").trim().toLowerCase() === "premium" ? "premium" : "basic";
            const driveLink = item.driveLink || item.link || (plan === "premium" ? item.premium?.folderLink : item.basic?.folderLink) || "";
            const megaLink = item.megaLink || item.megaUrl || (plan === "premium" ? item.premium?.megaLink : item.basic?.megaLink) || "";

            if (!item || !item.name || (!driveLink && !megaLink)) {
                skippedCount++;
                errors.push({ row: i + 1, name: item?.name || `Row ${i + 1}`, error: "Name and at least one storage link (Google Drive or MEGA.nz) are required." });
                continue;
            }

            const bundlePayload = {
                name: String(item.name).trim(),
                plan: plan,
                page: Number(item.page) || 1,
                thumbnail: String(item.thumbnail || "").trim(),
                active: item.active !== false,
                basic: {
                    title: plan === "basic" ? String(item.name).trim() : "",
                    folderLink: plan === "basic" ? driveLink : "",
                    megaLink: plan === "basic" ? megaLink : ""
                },
                premium: {
                    title: plan === "premium" ? String(item.name).trim() : "",
                    folderLink: plan === "premium" ? driveLink : "",
                    megaLink: plan === "premium" ? megaLink : ""
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