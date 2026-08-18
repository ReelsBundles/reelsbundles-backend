import {
    getUserBundleLibrary,
    getUserBundle,
    getUserBundleFiles
} from "../services/user-bundle.service.js";

import {
    streamDriveFile,
    isDriveItemWithinRoot
} from "../services/google-drive-stream.service.js";

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
                    megaLink: item.megaLink || null,
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

        const allowed = await isDriveItemWithinRoot(
            fileId,
            access.folderId
        );

        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: "This file does not belong to the selected bundle."
            });
        }

        /*
         * We intentionally do not return a Drive URL. The server streams
         * the authorized Drive file directly to the authenticated user.
         */
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
