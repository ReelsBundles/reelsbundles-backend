export function validateBundle(data) {
    const errors = [];

    if (!data || !String(data.name || "").trim()) {
        errors.push("Bundle name is required.");
    }

    const plan = String(data?.plan || "").trim().toLowerCase();

    if (plan !== "basic" && plan !== "premium") {
        errors.push("Valid bundle plan is required.");
        return errors;
    }

    if (!Number.isFinite(Number(data.page)) || Number(data.page) < 1) {
        errors.push("Valid page is required.");
    }

    if (!String(data.thumbnail || "").trim()) {
        errors.push("Thumbnail URL is required.");
    }

    const isDriveLink = value => {
        const link = String(value || "").trim();
        return Boolean(
            link &&
            (link.includes("drive.google.com") ||
             link.includes("docs.google.com"))
        );
    };

    if (plan === "basic") {
        if (!String(data.basic?.title || "").trim()) {
            errors.push("Basic bundle title is required.");
        }

        const folderLink = String(
            data.basic?.folderLink ||
            data.basic?.folderId ||
            ""
        ).trim();

        if (!isDriveLink(folderLink)) {
            errors.push("Invalid Basic Google Drive Folder Link.");
        }
    }

    if (plan === "premium") {
        if (!String(data.premium?.title || "").trim()) {
            errors.push("Premium bundle title is required.");
        }

        const folderLink = String(
            data.premium?.folderLink ||
            data.premium?.folderId ||
            ""
        ).trim();

        if (!isDriveLink(folderLink)) {
            errors.push("Invalid Premium Google Drive Folder Link.");
        }
    }

    return errors;
}
