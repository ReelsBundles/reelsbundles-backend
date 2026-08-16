/* ==========================================================
   REELSBUNDLES
   USER DOWNLOAD UTILITIES
   PHASE A3
========================================================== */


/* ==========================================================
   GOOGLE DRIVE
========================================================== */

const DRIVE_BASE_URL =
    "https://drive.google.com/drive/folders/";


/* ==========================================================
   BUILD GOOGLE DRIVE FOLDER URL
========================================================== */

/*
 * IMPORTANT:
 *
 * user-bundle.service.js already decrypts the
 * encrypted Google Drive file/folder ID.
 *
 * Therefore this function receives the
 * DECRYPTED file ID.
 *
 * Do NOT decrypt it again here.
 */

export function buildGoogleDriveFolderUrl(
    fileId
) {

    if (
        !fileId ||
        typeof fileId !== "string"
    ) {

        return null;

    }


    const cleanFileId =
        fileId.trim();


    if (
        !cleanFileId
    ) {

        return null;

    }


    return (
        `${DRIVE_BASE_URL}${encodeURIComponent(
            cleanFileId
        )}`
    );

}


/* ==========================================================
   OPTIONAL DIRECT DOWNLOAD URL
========================================================== */

/*
 * This is kept as a utility for future secure
 * download implementation.
 *
 * It is NOT used by the current Phase A3
 * bundle-library flow.
 */

export function buildGoogleDriveDirectUrl(
    fileId
) {

    if (
        !fileId ||
        typeof fileId !== "string"
    ) {

        return null;

    }


    const cleanFileId =
        fileId.trim();


    if (
        !cleanFileId
    ) {

        return null;

    }


    return (
        "https://drive.google.com/uc" +
        "?export=download" +
        `&id=${encodeURIComponent(
            cleanFileId
        )}`
    );

}