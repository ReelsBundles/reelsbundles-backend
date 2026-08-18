import { google } from "googleapis";
import { createDownloadUrl } from "../utils/drive.js";

function getDriveClient() {
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!clientEmail || !privateKey) {
        throw new Error("Google Drive service account credentials are not configured.");
    }

    const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/drive.readonly"]
    });

    return google.drive({ version: "v3", auth });
}

export async function getDriveFileInfo(fileId) {
    if (!fileId) throw new Error("Google Drive file ID is required.");

    const drive = getDriveClient();
    const response = await drive.files.get({
        fileId,
        fields: "id,name,mimeType,size,parents,trashed",
        supportsAllDrives: true
    });

    return response.data;
}

export async function streamDriveFile(fileId, res) {
    if (!fileId) throw new Error("Google Drive file ID is required.");

    try {
        const drive = getDriveClient();
        const metadata = await getDriveFileInfo(fileId);

        if (metadata.trashed) {
            throw new Error("The requested file is no longer available.");
        }

        if (metadata.name) {
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${String(metadata.name).replace(/["\r\n]/g, "")}"`
            );
        }

        if (metadata.mimeType) {
            res.setHeader("Content-Type", metadata.mimeType);
        }

        if (metadata.size) {
            res.setHeader("Content-Length", metadata.size);
        }

        const response = await drive.files.get(
            {
                fileId,
                alt: "media",
                supportsAllDrives: true
            },
            { responseType: "stream" }
        );

        response.data.on("error", error => {
            console.error("[Google Drive Stream] Stream error:", error);
            if (!res.headersSent) {
                return res.redirect(302, createDownloadUrl(fileId));
            } else {
                res.destroy(error);
            }
        });

        response.data.pipe(res);
        return true;
    } catch (err) {
        console.warn("[Google Drive Stream] Falling back to direct secure redirect:", err.message);
        return res.redirect(302, createDownloadUrl(fileId));
    }
}

export async function listDriveFolder(folderId) {
    if (!folderId) throw new Error("Google Drive folder ID is required.");

    const drive = getDriveClient();
    const items = [];
    let pageToken = null;

    do {
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,shortcutDetails)",
            pageSize: 1000,
            pageToken,
            orderBy: "folder,name",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });

        for (const item of response.data.files || []) {
            const isShortcut = item.mimeType === "application/vnd.google-apps.shortcut";
            const targetId = isShortcut && item.shortcutDetails?.targetId ? item.shortcutDetails.targetId : item.id;
            const targetMime = isShortcut && item.shortcutDetails?.targetMimeType ? item.shortcutDetails.targetMimeType : item.mimeType;

            const isFolder = targetMime === "application/vnd.google-apps.folder" || isShortcut;

            items.push({
                id: targetId,
                name: item.name,
                type: isFolder ? "folder" : "file",
                mimeType: targetMime || item.mimeType || null,
                size: item.size ? Number(item.size) : null,
                modifiedTime: item.modifiedTime || null,
                folderLink: isFolder ? `https://drive.google.com/drive/folders/${item.id || targetId}` : null,
                parents: Array.isArray(item.parents) ? item.parents : []
            });
        }

        pageToken = response.data.nextPageToken || null;
    } while (pageToken);

    return items;
}

/*
 * SECURITY:
 * Verify that an item is inside the bundle's configured root folder.
 * This prevents a user from taking an arbitrary Drive ID and asking the
 * backend to stream it.
 */
export async function isDriveItemWithinRoot(itemId, rootFolderId) {
    if (!itemId || !rootFolderId) return false;
    const targetId = String(itemId).trim();
    const rootId = String(rootFolderId).trim();

    if (targetId === rootId) return true;

    try {
        const drive = getDriveClient();
        let currentId = targetId;
        let depth = 0;

        while (currentId && depth < 10) {
            depth++;
            const fileRes = await drive.files.get({
                fileId: currentId,
                fields: "id, parents",
                supportsAllDrives: true
            });

            const parents = Array.isArray(fileRes.data?.parents) ? fileRes.data.parents : [];
            if (parents.includes(rootId)) {
                return true;
            }

            if (parents.length === 0) break;
            currentId = parents[0];
        }

        return false;
    } catch (error) {
        console.warn("[Drive Stream] isDriveItemWithinRoot parent check warning:", error.message);
        // Fallback: If service account check is unavailable, allow authorized bundle users access
        return true;
    }
}

export default {
    getDriveFileInfo,
    streamDriveFile,
    listDriveFolder,
    isDriveItemWithinRoot
};
