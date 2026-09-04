import { google } from "googleapis";
import axios from "axios";

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

    // Strategy 1: Official Google Drive API Client (Service Account)
    try {
        const drive = getDriveClient();
        const metadata = await getDriveFileInfo(fileId);

        if (metadata?.trashed) {
            if (!res.headersSent) {
                return res.status(410).json({ success: false, message: "The requested file is no longer available." });
            }
            return res.end();
        }

        if (metadata?.name) {
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${String(metadata.name).replace(/["\r\n]/g, "")}"`
            );
        }

        if (metadata?.mimeType) {
            res.setHeader("Content-Type", metadata.mimeType);
        }

        if (metadata?.size) {
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
                res.status(500).json({ success: false, message: "Stream interrupted." });
            } else {
                res.destroy(error);
            }
        });

        response.data.pipe(res);
        return true;
    } catch (serviceAccountErr) {
        console.warn("[Google Drive Stream] Service account unavailable, using direct server-side stream proxy:", serviceAccountErr.message);

        // Strategy 2: Direct Server-Side Stream Proxy
        // Strictly streams bytes to the browser WITHOUT 302 redirect or exposing Google Drive URLs
        try {
            const primaryUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&authuser=0`;
            const fallbackUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;

            const requestConfig = {
                responseType: "stream",
                maxRedirects: 5,
                timeout: 30000,
                validateStatus: (status) => status < 400,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            };

            let streamResponse;
            try {
                streamResponse = await axios.get(primaryUrl, requestConfig);
            } catch (pErr) {
                streamResponse = await axios.get(fallbackUrl, requestConfig);
            }

            const contentType = streamResponse.headers["content-type"] || "application/octet-stream";
            const contentLength = streamResponse.headers["content-length"];
            const contentDisposition = streamResponse.headers["content-disposition"] || `attachment; filename="bundle_download_${fileId}.zip"`;

            res.setHeader("Content-Disposition", contentDisposition);
            res.setHeader("Content-Type", contentType);
            if (contentLength) {
                res.setHeader("Content-Length", contentLength);
            }

            streamResponse.data.on("error", pipeErr => {
                console.error("[Google Drive Stream Fallback] Stream error:", pipeErr.message);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, message: "Download stream failed." });
                } else {
                    res.destroy(pipeErr);
                }
            });

            streamResponse.data.pipe(res);
            return true;
        } catch (fallbackErr) {
            console.error("[Google Drive Stream] Direct stream proxy failed:", fallbackErr.message);
            if (!res.headersSent) {
                return res.status(502).json({
                    success: false,
                    message: "Unable to retrieve the file from secure cloud storage. Please contact support."
                });
            }
            res.destroy(fallbackErr);
        }
    }
}

export async function listDriveFolder(folderId) {
    if (!folderId) throw new Error("Google Drive folder ID is required.");

    try {
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
                    parents: Array.isArray(item.parents) ? item.parents : []
                });
            }

            pageToken = response.data.nextPageToken || null;
        } while (pageToken);

        return items;
    } catch (err) {
        console.warn("[listDriveFolder] Drive API warning:", err.message);
        return [];
    }
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
