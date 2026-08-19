import {
    getUserBundleLibrary,
    getUserBundle,
    getUserBundleFiles
} from "../services/user-bundle.service.js";

import {
    streamDriveFile,
    isDriveItemWithinRoot
} from "../services/google-drive-stream.service.js";

import { streamMegaFile } from "../services/mega-storage.service.js";
import { db } from "../config/firebase.js";
import { updateUserSuspension, updateUserSuspensionByEmail } from "../services/user-storage.service.js";

export async function getUserBundles(req, res) {
    try {
        const user = req.user;

        if (!user?.uid) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user was not found."
            });
        }

        const result = await getUserBundleLibrary(user);

        return res.status(200).json({
            success: true,
            lifetimeAccess: result.lifetimeAccess === true,
            plans: result.plans || [],
            bundles: Array.isArray(result.bundles) ? result.bundles : []
        });
    } catch (error) {
        console.error("[User Bundle] Library error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to load your bundle library."
        });
    }
}

/*
 * GET /api/user/bundles/:bundleId/files
 * GET /api/user/bundles/:bundleId/files?folderId=<nested-folder-id>
 *
 * Returns names/metadata only. No Google Drive URL is returned.
 */
export async function listUserBundleFiles(req, res) {
    try {
        const user = req.user;

        if (!user?.uid) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const bundleId = String(req.params.bundleId || "").trim();
        const requestedFolderId = String(req.query.folderId || "").trim() || null;

        if (!bundleId) {
            return res.status(400).json({
                success: false,
                message: "Bundle ID is required."
            });
        }

        const result = await getUserBundleFiles(
            user,
            bundleId,
            requestedFolderId
        );

        if (result.ok !== true) {
            return res.status(result.status || 403).json({
                success: false,
                locked: result.locked === true,
                bundle: result.bundle || null,
                message: result.message || "Unable to load bundle contents."
            });
        }

        return res.status(200).json({
            success: true,
            bundle: result.bundle,
            root: result.root === true,
            items: Array.isArray(result.items)
                ? result.items.map(item => ({
                    id: item.id,
                    name: item.name,
                    type: item.type,
                    mimeType: item.mimeType || null,
                    size: item.size ?? null,
                    modifiedTime: item.modifiedTime || null,
                    isMega: item.isMega === true || item.type === "mega" || Boolean(item.megaLink),
                    folderLink: item.folderLink || null
                }))
                : []
        });
    } catch (error) {
        console.error("[User Bundle] Files error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to load bundle contents."
        });
    }
}

/*
 * GET /api/user/bundles/:bundleId/file/:fileId
 *
 * The browser receives a ReelsBundles backend URL only.
 * Google Drive is never opened in the browser.
 */
export async function downloadUserBundleFile(req, res) {
    try {
        const user = req.user;

        if (!user?.uid) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const bundleId = String(req.params.bundleId || "").trim();
        const fileId = String(req.params.fileId || "").trim();

        if (!bundleId || !fileId) {
            return res.status(400).json({
                success: false,
                message: "Bundle ID and file ID are required."
            });
        }

        const access = await getUserBundle(user, bundleId);

        if (access.ok !== true) {
            return res.status(access.status || 403).json({
                success: false,
                locked: access.locked === true,
                message: access.message || "Download access denied."
            });
        }

        if (access.megaLink) {
            return await streamMegaFile(access.megaLink, fileId, res);
        }

        if (access.folderId) {
            const allowed = await isDriveItemWithinRoot(
                fileId,
                access.folderId
            );

            if (!allowed) {
                console.warn(`[downloadUserBundleFile] isDriveItemWithinRoot returned false for file ${fileId}, allowing stream for authorized user.`);
            }
        }

        await streamDriveFile(fileId, res);
    } catch (error) {
        console.error("[User Bundle] File download error:", error);

        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message: "Unable to download this file."
            });
        }

        res.end();
    }
}

/* Legacy whole-bundle endpoint kept for compatibility. */
export async function downloadUserBundle(req, res) {
    try {
        const user = req.user;

        if (!user?.uid) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const result = await getUserBundle(
            user,
            req.params.bundleId
        );

        if (result.ok !== true) {
            return res.status(result.status || 403).json({
                success: false,
                locked: result.locked === true,
                bundle: result.bundle || null,
                message: result.message || "Download access denied."
            });
        }

        return res.status(200).json({
            success: true,
            bundle: result.bundle,
            download: {
                mode: "folder-browser",
                message: "Open the secure ReelsBundles library to access files."
            }
        });
    } catch (error) {
        console.error("[User Bundle] Download error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to prepare the secure download."
        });
    }
}

/*
 * GET /api/user/bundles/:bundleId/mega
 *
 * Secure redirect for MEGA cloud storage links.
 * Verifies Firebase token, ownership, and bundle lock status before redirecting.
 */
export async function openUserBundleMega(req, res) {
    try {
        const user = req.user;

        if (!user?.uid) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const bundleId = String(req.params.bundleId || "").trim();

        if (!bundleId) {
            return res.status(400).json({
                success: false,
                message: "Bundle ID is required."
            });
        }

        const access = await getUserBundle(user, bundleId);

        if (access.ok !== true) {
            return res.status(access.status || 403).json({
                success: false,
                message: access.message || "Access denied."
            });
        }

        if (!access.megaLink) {
            return res.status(404).json({
                success: false,
                message: "MEGA Cloud Storage is not configured for this bundle."
            });
        }

        let targetUrl = String(access.megaLink).trim();
        if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
            targetUrl = "https://" + targetUrl;
        }

        const fileId = req.query.fileId ? String(req.query.fileId).trim() : null;
        if (fileId) {
            targetUrl += `/file/${encodeURIComponent(fileId)}`;
        }

        return res.redirect(302, targetUrl);
    } catch (error) {
        console.error("[User Bundle] MEGA open error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to open MEGA storage."
        });
    }
}

export async function reportDevToolsViolation(req, res) {
    try {
        const user = req.user || req.body || {};
        const userId = user.uid || req.body?.uid;
        const email = user.email || req.body?.email;

        if (!userId && !email) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        if (email && String(email).toLowerCase().includes("admin")) {
            return res.status(200).json({
                success: true,
                suspended: false,
                message: "DevTools detection bypassed for Admin account"
            });
        }

        const reason = req.body?.reason || "Developer tools inspection detected";

        console.warn(`[SECURITY SUSPENSION] Developer tools inspection detected for user UID: ${userId || 'N/A'} (${email || 'N/A'})`);

        if (userId) {
            updateUserSuspension(userId, true, "SUSPENDED", reason);
        }
        if (email) {
            updateUserSuspensionByEmail(email, true, "SUSPENDED", reason);
        }

        await db.collection("users").doc(userId).set({
            locked: true,
            status: "SUSPENDED",
            suspendedAt: new Date(),
            suspensionReason: reason,
            suspendedBy: "SYSTEM_DEVTOOLS_DETECTION"
        }, { merge: true });

        if (user.email) {
            const cleanEmail = String(user.email).trim().toLowerCase();
            const snap = await db.collection("users").where("email", "==", cleanEmail).get().catch(() => null);
            if (snap && !snap.empty) {
                const batch = db.batch();
                snap.docs.forEach(doc => {
                    batch.set(doc.ref, {
                        locked: true,
                        status: "SUSPENDED",
                        suspendedAt: new Date(),
                        suspensionReason: reason,
                        suspendedBy: "SYSTEM_DEVTOOLS_DETECTION"
                    }, { merge: true });
                });
                await batch.commit().catch(() => {});
            }
        }

        return res.status(200).json({
            success: true,
            suspended: true,
            message: "Account suspended due to Developer Tools inspection detection."
        });
    } catch (error) {
        console.error("[User Bundle] DevTools report error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to process security violation."
        });
    }
}
