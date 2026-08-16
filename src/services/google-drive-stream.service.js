import { google } from "googleapis";

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
        if (!res.headersSent) res.status(500).end();
        else res.destroy(error);
    });

    response.data.pipe(res);
    return true;
}

export async function listDriveFolder(folderId) {
    if (!folderId) throw new Error("Google Drive folder ID is required.");

    const drive = getDriveClient();
    const items = [];
    let pageToken = null;

    do {
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)",
            pageSize: 1000,
            pageToken,
            orderBy: "folder,name",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });

        for (const item of response.data.files || []) {
            const isFolder = item.mimeType === "application/vnd.google-apps.folder";

            items.push({
                id: item.id,
                name: item.name,
                type: isFolder ? "folder" : "file",
                mimeType: item.mimeType || null,
                size: item.size ? Number(item.size) : null,
                modifiedTime: item.modifiedTime || null,
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
    const targetItemId = String(itemId).trim();
    const targetRootId = String(rootFolderId).trim();
    if (targetItemId === targetRootId) return false;

    try {
        const drive = getDriveClient();

        // 1. Fetch subfolders of rootFolderId (depth 2)
        const subRes1 = await drive.files.list({
            q: `'${targetRootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: "files(id)",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });

        const depth2Folders = (subRes1.data.files || []).map(f => f.id);
        const folders = [targetRootId, ...depth2Folders];

        // 2. Fetch sub-subfolders (depth 3) if there are any depth 2 folders
        if (depth2Folders.length > 0) {
            const q3 = `(${depth2Folders.map(id => `'${id}' in parents`).join(" or ")}) and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
            const subRes2 = await drive.files.list({
                q: q3,
                fields: "files(id)",
                supportsAllDrives: true,
                includeItemsFromAllDrives: true
            });
            folders.push(...(subRes2.data.files || []).map(f => f.id));
        }

        // Check if target is a valid folder in hierarchy
        if (folders.includes(targetItemId)) {
            return true;
        }

        // 3. Fetch all files inside these folders to check
        const qFiles = `(${folders.map(id => `'${id}' in parents`).join(" or ")}) and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
        const filesRes = await drive.files.list({
            q: qFiles,
            fields: "files(id)",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            pageSize: 1000
        });

        const fileSet = new Set((filesRes.data.files || []).map(f => f.id));
        return fileSet.has(targetItemId);
    } catch (error) {
        console.error("[Drive Stream] isDriveItemWithinRoot security error:", error);
        return false;
    }
}

export default {
    getDriveFileInfo,
    streamDriveFile,
    listDriveFolder,
    isDriveItemWithinRoot
};
