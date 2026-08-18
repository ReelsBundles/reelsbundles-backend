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

function getItemId(item) {
    if (item.downloadId) {
        return Array.isArray(item.downloadId) ? (item.downloadId[1] || item.downloadId[0]) : item.downloadId;
    }
    if (item.nodeId) return item.nodeId;
    return item.name;
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
                    megaLink: cleanLink,
                    isMega: true
                });
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
                megaLink: cleanLink,
                isMega: true
            });
        }

        return items;
    } catch (error) {
        console.warn("[Mega Storage] Folder list warning:", error.message);
        return [];
    }
}
