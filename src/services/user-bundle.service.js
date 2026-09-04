import { db } from "../config/firebase.js";
import { getBundles } from "./bundle.service.js";
import {
    listDriveFolder,
    isDriveItemWithinRoot
} from "./google-drive-stream.service.js";
import { listMegaFolder } from "./mega-storage.service.js";
import { extractFileId } from "../utils/drive.js";
import { loadLocalPayments } from "./payment-storage.service.js";

const paymentsCollection = db ? db.collection("payments") : null;

function normalizeEmail(value) {
    let email = String(value || "").trim().toLowerCase();
    if (!email) return "";
    return email
        .replace(/\.con$/i, ".com")
        .replace(/\.gamil\.com$/i, "@gmail.com")
        .replace(/\.cm$/i, ".com");
}

function normalizePlan(value) {
    const plan = String(value || "").trim().toLowerCase();
    if (plan === "basic") return "basic";
    if (plan === "premium" || plan === "pro" || plan === "paid") return "premium";
    return null;
}

function isPaid(payment) {
    const status = String(
        payment?.paymentStatus ||
        payment?.payment_status ||
        payment?.status ||
        ""
    ).trim().toUpperCase();
    return ["PAID", "ACTIVE", "SUCCESS", "SUCCESSFUL", "COMPLETED"].includes(status);
}

function resolvePaymentPlan(payment) {
    const directPlan = normalizePlan(
        payment?.bundlePlan || payment?.bundle_plan || payment?.plan
    );
    if (directPlan) return directPlan;

    const amount = Number(
        payment?.amount ??
        payment?.order_amount ??
        payment?.orderAmount ??
        0
    );

    if (amount === 49) return "basic";
    if (amount === 69) return "premium";
    return null;
}

function normalizePhone(value) {
    return String(value || "")
        .replace(/[^0-9+]/g, "")
        .replace(/^00/, "+");
}

function paymentBelongsToUser(payment, user) {
    if (!payment || !user) return false;

    const paymentUid =
        payment.firebaseUid ||
        payment.userUid ||
        payment.uid ||
        null;

    if (paymentUid && user.uid && paymentUid === user.uid) return true;

    const paymentEmail = normalizeEmail(
        payment.customerEmail || payment.email
    );
    const userEmail = normalizeEmail(user.email);

    if (paymentEmail && userEmail && paymentEmail === userEmail) return true;

    const paymentPhone = normalizePhone(
        payment.customerPhone || payment.phone
    );
    const userPhone = normalizePhone(
        user.phoneNumber || user.phone
    );

    if (paymentPhone && userPhone && paymentPhone === userPhone) return true;

    return false;
}

async function getUserEntitledPlans(user) {
    if (!user?.uid) return [];

    const plans = new Set();
    let docs = [];

    try {
        if (paymentsCollection) {
            const snapshot = await paymentsCollection.get();
            snapshot.forEach(doc => docs.push(doc.data() || {}));
        }
    } catch (err) {
        console.warn("[getUserEntitledPlans] Firestore payments lookup warning (fallback to local):", err.message);
    }

    if (docs.length === 0) {
        docs = loadLocalPayments();
    }

    docs.forEach(payment => {
        if (!isPaid(payment)) return;
        if (!paymentBelongsToUser(payment, user)) return;

        const plan = resolvePaymentPlan(payment);
        if (plan) plans.add(plan);
    });

    return [...plans];
}

function formatThumbnailUrl(value) {
    if (!value) return null;
    let str = String(value).trim();
    if (!str) return null;

    if (str.startsWith("data:image/")) {
        return str;
    }

    if (/^(www\.|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\/)/i.test(str)) {
        str = "https://" + str;
    }

    const driveMatch = str.match(/(?:file\/d\/|id=|folders\/|d\/)([a-zA-Z0-9_-]{20,})/i);
    if (driveMatch && driveMatch[1]) {
        return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w800`;
    }

    if (/^[a-zA-Z0-9_-]{25,}$/.test(str)) {
        return `https://drive.google.com/thumbnail?id=${str}&sz=w800`;
    }

    const ytMatch = str.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([a-zA-Z0-9_-]{11})/i);
    if (ytMatch && ytMatch[1]) {
        return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
    }

    if (str.includes("dropbox.com")) {
        return str.replace("dl=0", "raw=1");
    }

    return str;
}

function safeBundle(bundle, isUnlocked = false) {
    const plan = normalizePlan(bundle?.plan);
    const planData = bundle?.[plan] || {};
    const active = bundle?.active === true;

    const rawThumb =
        bundle?.thumbnail ||
        bundle?.thumbnailUrl ||
        bundle?.imageUrl ||
        bundle?.basic?.thumbnail ||
        bundle?.premium?.thumbnail ||
        null;

    const megaLink = isUnlocked ? (planData.megaLink || bundle?.megaLink || null) : null;

    return {
        id: bundle.id,
        name: bundle.name || "Reels Bundle",
        slug: bundle.slug || null,
        page: bundle.page ?? null,
        plan,
        title:
            planData.title ||
            bundle.title ||
            `${plan === "premium" ? "Premium" : "Basic"} Reels Bundle`,
        description:
            planData.description ||
            bundle.description ||
            "Ready-to-post Instagram reels bundle.",
        thumbnail: formatThumbnailUrl(rawThumb),
        active,
        locked: !active,
        status: active ? "ACTIVE" : "LOCKED",
        unlocked: isUnlocked,
        hasMega: Boolean(megaLink)
    };
}

export async function getUserBundleLibrary(user) {
    const entitledPlansRaw = await getUserEntitledPlans(user);
    const normalizedPlans = new Set(
        entitledPlansRaw
            .map(normalizePlan)
            .filter(Boolean)
    );

    /* Premium includes Basic access in the existing project flow. */
    if (normalizedPlans.has("premium")) {
        normalizedPlans.add("basic");
    }

    const finalPlans = [...normalizedPlans];
    const allBundles = await getBundles();

    const bundles = allBundles.map(bundle => {
        const plan = normalizePlan(bundle.plan);
        const unlocked = Boolean(plan && normalizedPlans.has(plan));
        return safeBundle(bundle, unlocked);
    });

    return {
        lifetimeAccess: finalPlans.length > 0,
        plans: finalPlans,
        bundles
    };
}

function getAuthorizedStorageLinks(bundle, plan) {
    const planData = bundle?.[plan] || {};
    let folderId = planData.folderId || planData.fileId || bundle?.folderId || bundle?.fileId || bundle?.basic?.folderId || bundle?.premium?.folderId || null;
    let folderLink = planData.folderLink || bundle?.folderLink || bundle?.basic?.folderLink || bundle?.premium?.folderLink || null;
    let megaLink = planData.megaLink || bundle?.megaLink || bundle?.basic?.megaLink || bundle?.premium?.megaLink || null;

    if (!folderId && folderLink) {
        folderId = extractFileId(folderLink);
    }

    return { folderId, folderLink, megaLink };
}

async function authorizeBundle(user, bundleId) {
    const entitledPlans = new Set(await getUserEntitledPlans(user));
    if (entitledPlans.has("premium")) entitledPlans.add("basic");
    const allBundles = await getBundles();

    const bundle = allBundles.find(item => String(item.id) === String(bundleId));

    if (!bundle) {
        return {
            ok: false,
            status: 404,
            message: "Bundle not found."
        };
    }

    const plan = normalizePlan(bundle.plan);

    if (!plan || !entitledPlans.has(plan)) {
        return {
            ok: false,
            status: 403,
            message: "You do not own this bundle plan."
        };
    }

    if (bundle.active !== true) {
        return {
            ok: false,
            status: 403,
            locked: true,
            bundle: safeBundle(bundle),
            message: "This bundle is currently locked by the administrator."
        };
    }

    const storage = getAuthorizedStorageLinks(bundle, plan);

    if (!storage.folderId && !storage.folderLink && !storage.megaLink) {
        return {
            ok: false,
            status: 404,
            message: "No cloud storage links are configured for this bundle."
        };
    }

    return {
        ok: true,
        bundle,
        plan,
        folderId: storage.folderId,
        folderLink: storage.folderLink,
        megaLink: storage.megaLink
    };
}

export async function getUserBundle(user, bundleId) {
    const access = await authorizeBundle(user, bundleId);

    if (!access.ok) return access;

    return {
        ok: true,
        status: 200,
        bundle: safeBundle(access.bundle, true),
        folderId: access.folderId,
        megaLink: access.megaLink
    };
}

/*
 * Secure folder listing.
 * Supports Google Drive folders and MEGA Cloud links.
 */
export async function getUserBundleFiles(user, bundleId, requestedFolderId = null) {
    const access = await authorizeBundle(user, bundleId);
    if (!access.ok) return access;

    let items = [];
    const rootFolderId = access.folderId || (access.folderLink ? extractFileId(access.folderLink) : null);
    const targetFolderId = requestedFolderId || rootFolderId;

    if (targetFolderId) {
        try {
            if (requestedFolderId && rootFolderId) {
                const allowed = await isDriveItemWithinRoot(
                    requestedFolderId,
                    rootFolderId
                );
                if (!allowed) {
                    console.warn(`[getUserBundleFiles] isDriveItemWithinRoot returned false for ${requestedFolderId}, falling back to direct fetch.`);
                }
            }
            items = await listDriveFolder(targetFolderId);
        } catch (e) {
            console.warn("[getUserBundleFiles] Drive fetch error:", e.message);
        }
    }

    // Fallback Drive item if drive list is empty or service account unavailable, ONLY for drive bundles
    if (items.length === 0 && (access.folderId || access.folderLink) && !access.megaLink && !requestedFolderId) {
        const driveFileId = access.folderId || (access.folderLink ? extractFileId(access.folderLink) : `bundle_${access.bundle.id}`);
        items.push({
            id: driveFileId,
            name: `${access.bundle.name || 'Reels Bundle'} (Full Package Download)`,
            type: "file",
            mimeType: "application/zip",
            size: null
        });
    }
    // Append MEGA Cloud storage items if MEGA link is configured for this bundle
    if (access.megaLink) {
        try {
            const megaItems = await listMegaFolder(access.megaLink, requestedFolderId);
            if (Array.isArray(megaItems) && megaItems.length > 0) {
                items.push(...megaItems);
            } else if (!requestedFolderId) {
                items.unshift({
                    id: `mega_${access.bundle.id}`,
                    name: `${access.bundle.name || 'Reels Bundle'} (MEGA Package Download)`,
                    type: "file",
                    mimeType: "application/zip",
                    size: null,
                    isMega: true
                });
            }
        } catch (err) {
            console.warn("[getUserBundleFiles] MEGA fetch warning:", err.message);
            if (!requestedFolderId) {
                items.unshift({
                    id: `mega_${access.bundle.id}`,
                    name: `${access.bundle.name || 'Reels Bundle'} (MEGA Package Download)`,
                    type: "file",
                    mimeType: "application/zip",
                    size: null,
                    isMega: true
                });
            }
        }
    }

    return {
        ok: true,
        status: 200,
        bundle: safeBundle(access.bundle, true),
        items,
        root: !requestedFolderId
    };
}
