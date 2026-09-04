import { File } from "megajs";
import mime from "mime-types";

function matchesFolderId(child, targetId) {
    if (!child || !targetId) return false;
    const cleanTarget = String(targetId).trim().toLowerCase();

    if (child.name && String(child.name).trim().toLowerCase() === cleanTarget) {
        return true;
    }

    if (child.nodeId && String(child.nodeId).trim().toLowerCase() === cleanTarget) {
        return true;
    }

    if (child.downloadId) {
        const dId = Array.isArray(child.downloadId) ? child.downloadId.join(",") : String(child.downloadId);
        if (dId.toLowerCase().includes(cleanTarget) || cleanTarget.includes(dId.toLowerCase())) {
            return true;
        }
    }

    return false;
}

function findMegaNode(node, targetId) {
    if (!node) return null;
    if (!targetId) return node;

    if (matchesFolderId(node, targetId)) {
        return node;
    }

    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            const found = findMegaNode(child, targetId);
            if (found) return found;
        }
    }

    return null;
}

export function getItemId(item) {
    if (!item) return "file";
    if (item.downloadId) {
        return Array.isArray(item.downloadId) ? (item.downloadId[1] || item.downloadId[0]) : String(item.downloadId);
    }
    if (item.nodeId) return String(item.nodeId);
    return String(item.name || "file");
}

function matchesMegaItem(node, targetId) {
    if (!node || !targetId) return false;
    const cleanTarget = String(targetId).trim();
    const cleanTargetLower = cleanTarget.toLowerCase();

    // Direct root / virtual identifier match
    if (cleanTargetLower === "root" || cleanTargetLower === "download" || cleanTargetLower.startsWith("mega_")) {
        return true;
    }

    // Match nodeId (MEGA internal handle h)
    if (node.nodeId && String(node.nodeId).trim() === cleanTarget) {
        return true;
    }

    // Match downloadId
    if (node.downloadId) {
        if (Array.isArray(node.downloadId)) {
            if (node.downloadId.some(d => String(d).trim() === cleanTarget)) return true;
        } else if (String(node.downloadId).trim() === cleanTarget) {
            return true;
        }
    }

    // Match computed getItemId
    if (getItemId(node) === cleanTarget) {
        return true;
    }

    // Match filename
    if (node.name && String(node.name).trim().toLowerCase() === cleanTargetLower) {
        return true;
    }

    return false;
}

export function findMegaFile(node, targetId) {
    if (!node) return null;

    // Direct match on current node if it's a downloadable file
    if (!node.directory && matchesMegaItem(node, targetId)) {
        return node;
    }

    // Search children if this is a directory
    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            const found = findMegaFile(child, targetId);
            if (found) return found;
        }
    }

    // If node is a single file without children and targetId is root/virtual
    if (!node.directory && (!targetId || targetId === "root" || targetId.startsWith("mega_"))) {
        return node;
    }

    return null;
}

export async function listMegaFolder(megaLink, requestedFolderId = null) {
    if (!megaLink) return [];

    let cleanLink = String(megaLink).trim();
    if (!cleanLink.startsWith("http://") && !cleanLink.startsWith("https://")) {
        cleanLink = "https://" + cleanLink;
    }

    try {
        const rootFile = File.fromURL(cleanLink);

        await new Promise((resolve, reject) => {
            rootFile.loadAttributes((err, f) => {
                if (err) return reject(err);
                resolve(f);
            });
        });

        const targetNode = findMegaNode(rootFile, requestedFolderId) || rootFile;
        const items = [];

        if (Array.isArray(targetNode.children) && targetNode.children.length > 0) {
            targetNode.children.forEach(child => {
                const isFolder = Boolean(child.directory);
                const mimeType = isFolder
                    ? "application/vnd.google-apps.folder"
                    : (mime.lookup(child.name) || "video/mp4");

                items.push({
                    id: getItemId(child),
                    name: child.name || "Untitled",
                    type: isFolder ? "folder" : "file",
                    mimeType,
                    size: isFolder ? null : (child.size || null),
                    modifiedTime: child.timestamp ? new Date(child.timestamp * 1000).toISOString() : null,
                    isMega: true
                });
            });
        } else if (!targetNode.directory) {
            // Single file MEGA link
            const mimeType = mime.lookup(targetNode.name) || "application/octet-stream";
            items.push({
                id: getItemId(targetNode),
                name: targetNode.name || "Reels Package",
                type: "file",
                mimeType,
                size: targetNode.size || null,
                modifiedTime: targetNode.timestamp ? new Date(targetNode.timestamp * 1000).toISOString() : null,
                isMega: true
            });
        } else if (targetNode.name && targetNode !== rootFile) {
            const isFolder = Boolean(targetNode.directory);
            const mimeType = isFolder
                ? "application/vnd.google-apps.folder"
                : (mime.lookup(targetNode.name) || "video/mp4");

            items.push({
                id: getItemId(targetNode),
                name: targetNode.name || "MEGA Item",
                type: isFolder ? "folder" : "file",
                mimeType,
                size: isFolder ? null : (targetNode.size || null),
                modifiedTime: targetNode.timestamp ? new Date(targetNode.timestamp * 1000).toISOString() : null,
                isMega: true
            });
        }

        return items;
    } catch (error) {
        console.warn("[Mega Storage] Folder list warning:", error.message);
        return [];
    }
}

export async function streamMegaFile(megaLink, targetFileId, res, fileName) {
    if (!megaLink) {
        throw new Error("MEGA link is required.");
    }

    let cleanLink = String(megaLink).trim();
    if (!cleanLink.startsWith("http://") && !cleanLink.startsWith("https://")) {
        cleanLink = "https://" + cleanLink;
    }

    let rootFile;
    try {
        rootFile = File.fromURL(cleanLink);
    } catch (parseErr) {
        console.warn("[Mega Storage] Invalid MEGA URL format:", parseErr.message);
        if (!res.headersSent) {
            return res.status(400).json({
                success: false,
                message: "Invalid storage URL configured."
            });
        }
        return res.end();
    }

    try {
        await new Promise((resolve, reject) => {
            rootFile.loadAttributes((err, f) => {
                if (err) return reject(err);
                resolve(f);
            });
        });
    } catch (loadErr) {
        console.warn("[Mega Storage] Load attributes error:", loadErr.message);
        if (!res.headersSent) {
            return res.status(404).json({
                success: false,
                message: "Unable to access file from storage."
            });
        }
        return res.end();
    }

    const targetNode = findMegaFile(rootFile, targetFileId);

    if (!targetNode || targetNode.directory) {
        const sanitizedUrl = cleanLink.split("#")[0];
        console.warn(`[Mega Storage] File node ${targetFileId} not found in ${sanitizedUrl}`);
        if (!res.headersSent) {
            return res.status(404).json({
                success: false,
                message: "Requested file not found in storage."
            });
        }
        return res.end();
    }

    const safeName = (fileName || targetNode.name || "download.mp4").replace(/[\\/:*?"<>|]/g, "_");
    const mimeType = mime.lookup(safeName) || "application/octet-stream";

    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    res.setHeader("Content-Type", mimeType);
    if (targetNode.size) {
        res.setHeader("Content-Length", targetNode.size);
    }

    const downloadStream = targetNode.download();

    downloadStream.on("error", (err) => {
        console.error("[Mega Storage] Download stream error:", err.message);
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message: "Failed to stream file from storage."
            });
        }
        res.end();
    });

    res.on("close", () => {
        if (typeof downloadStream.destroy === "function") {
            downloadStream.destroy();
        }
    });

    downloadStream.pipe(res);
}
