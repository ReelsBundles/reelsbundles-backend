import { File } from "megajs";
import mime from "mime-types";

export async function listMegaFolder(megaLink) {
    if (!megaLink) return [];

    let cleanLink = String(megaLink).trim();
    if (!cleanLink.startsWith("http://") && !cleanLink.startsWith("https://")) {
        cleanLink = "https://" + cleanLink;
    }

    try {
        const file = File.fromURL(cleanLink);
        
        await new Promise((resolve, reject) => {
            file.loadAttributes((err, f) => {
                if (err) return reject(err);
                resolve(f);
            });
        });

        const items = [];

        if (Array.isArray(file.children) && file.children.length > 0) {
            file.children.forEach(child => {
                const isFolder = Boolean(child.directory);
                const mimeType = isFolder
                    ? "application/vnd.google-apps.folder"
                    : (mime.lookup(child.name) || "video/mp4");

                items.push({
                    id: child.downloadId || child.nodeId || child.name,
                    name: child.name || "Untitled",
                    type: isFolder ? "folder" : "file",
                    mimeType,
                    size: isFolder ? null : (child.size || null),
                    modifiedTime: child.timestamp ? new Date(child.timestamp * 1000).toISOString() : null,
                    megaLink: cleanLink
                });
            });
        } else if (file.name) {
            const mimeType = mime.lookup(file.name) || "video/mp4";
            items.push({
                id: file.downloadId || file.nodeId || file.name,
                name: file.name || "MEGA File",
                type: "file",
                mimeType,
                size: file.size || null,
                modifiedTime: file.timestamp ? new Date(file.timestamp * 1000).toISOString() : null,
                megaLink: cleanLink
            });
        }

        return items;
    } catch (error) {
        console.warn("[Mega Storage] Folder list warning:", error.message);
        return [];
    }
}
