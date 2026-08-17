import { db } from "../config/firebase.js";
import { getBundles } from "./bundle.service.js";
import {
    listDriveFolder,
    isDriveItemWithinRoot
} from "./google-drive-stream.service.js";

const paymentsCollection = db.collection("payments");

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

    const snapshot = await paymentsCollection.get();
    const plans = new Set();

    snapshot.forEach(doc => {
        const payment = doc.data() || {};
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
        unlocked: isUnlocked
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

    const finalPlans = [...normalizedPlans].sort(
        (a, b) => a === b ? 0 : a === "basic" ? -1 : 1
    );

    const allBundles = await getBundles();
    const entitlementSet = new Set(finalPlans);

    const bundles = Array.isArray(allBundles)
        ? allBundles
            .map(bundle => {
                const plan = normalizePlan(bundle?.plan);
                const isUnlocked = entitlementSet.has(plan) && bundle?.active === true;
                const safe = safeBundle(bundle, isUnlocked);
                return {
                    ...safe,
                    unlocked: isUnlocked
                };
            })
            .filter(bundle =>
                bundle &&
                (bundle.plan === "basic" || bundle.plan === "premium")
            )
            .sort((a, b) => {
                if (a.plan !== b.plan) return a.plan === "basic" ? -1 : 1;
                const pageDiff = (Number(a.page) || 0) - (Number(b.page) || 0);
                if (pageDiff !== 0) return pageDiff;
                return String(a.name || "").localeCompare(String(b.name || ""));
            })
        : [];

    return {
        lifetimeAccess: finalPlans.length > 0,
        plans: finalPlans,
        bundles
    };
}

function getAuthorizedFolderId(bundle, plan) {
    const planData = bundle?.[plan] || {};
    return planData.folderId || planData.fileId || null;
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

    const folderId = getAuthorizedFolderId(bundle, plan);

    if (!folderId) {
        return {
            ok: false,
            status: 404,
            message: "Google Drive folder is not configured for this bundle."
        };
    }

    return {
        ok: true,
        bundle,
        plan,
        folderId
    };
}

export async function getUserBundle(user, bundleId) {
    const access = await authorizeBundle(user, bundleId);

    if (!access.ok) return access;

    return {
        ok: true,
        status: 200,
        bundle: safeBundle(access.bundle),
        folderId: access.folderId
    };
}

/*
 * Secure folder listing.
 * The Drive folder ID is accepted only by the backend and is never
 * converted into a drive.google.com URL.
 */
export async function getUserBundleFiles(user, bundleId, requestedFolderId = null) {
    const access = await authorizeBundle(user, bundleId);
    if (!access.ok) return access;

    const folderId = requestedFolderId || access.folderId;

    if (requestedFolderId) {
        const allowed = await isDriveItemWithinRoot(
            requestedFolderId,
            access.folderId
        );

        if (!allowed) {
            return {
                ok: false,
                status: 403,
                message: "This folder does not belong to the selected bundle."
            };
        }
    }

    /*
     * For the root folder, use the configured bundle folder.
     * For nested folders, the controller only accepts an ID that came
     * from the already-authorized bundle browsing flow. The Drive API
     * itself enforces service-account access to the folder.
     */
    const items = await listDriveFolder(folderId);

    return {
        ok: true,
        status: 200,
        bundle: safeBundle(access.bundle),
        items,
        root: !requestedFolderId
    };
}
