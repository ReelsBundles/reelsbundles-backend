/* ==========================================================
   REELSBUNDLES
   SECURE DOWNLOAD CONTROLLER
========================================================== */

import {
    getUserBundle
} from "../services/user-bundle.service.js";

import {
    getBundle
} from "../services/bundle.service.js";

import {
    streamDriveFile
} from "../services/google-drive-stream.service.js";

import {
    saveDownloadLog
} from "../services/download-log.service.js";


/* ==========================================================
   SECURE DOWNLOAD
========================================================== */

export async function secureDownloadUserBundle(
    req,
    res
) {

    try {

        /* --------------------------------------------------
           AUTH USER
        -------------------------------------------------- */

        const user =
            req.user;


        if (
            !user?.uid
        ) {

            return res
                .status(401)
                .json({

                    success:
                        false,

                    message:
                        "Authentication required."

                });

        }


        /* --------------------------------------------------
           BUNDLE ID
        -------------------------------------------------- */

        const bundleId =
            String(
                req.params.bundleId ||
                ""
            ).trim();


        if (
            !bundleId
        ) {

            return res
                .status(400)
                .json({

                    success:
                        false,

                    message:
                        "Bundle ID is required."

                });

        }


        /* --------------------------------------------------
           EXISTING AUTHORIZATION
        -------------------------------------------------- */

        const access =
            await getUserBundle(
                user,
                bundleId
            );


        if (
            access?.ok !== true
        ) {

            return res
                .status(
                    access?.status ||
                    403
                )
                .json({

                    success:
                        false,

                    locked:
                        access?.locked ===
                        true,

                    message:
                        access?.message ||
                        "Download access denied."

                });

        }


        /* --------------------------------------------------
           GET RAW BUNDLE
           
           Existing bundle service decrypts
           the stored Drive ID server-side.
        -------------------------------------------------- */

        const bundle =
            await getBundle(
                bundleId
            );


        if (
            !bundle
        ) {

            return res
                .status(404)
                .json({

                    success:
                        false,

                    message:
                        "Bundle not found."

                });

        }


        /* --------------------------------------------------
           PLAN
        -------------------------------------------------- */

        const plan =
            String(
                bundle.plan ||
                ""
            )
                .trim()
                .toLowerCase();


        if (
            plan !== "basic" &&
            plan !== "premium"
        ) {

            return res
                .status(400)
                .json({

                    success:
                        false,

                    message:
                        "Invalid bundle plan."

                });

        }


        /* --------------------------------------------------
           ACTIVE CHECK
        -------------------------------------------------- */

        if (
            bundle.active !==
            true
        ) {

            return res
                .status(403)
                .json({

                    success:
                        false,

                    locked:
                        true,

                    message:
                        "This bundle is currently locked by the administrator."

                });

        }


        /* --------------------------------------------------
           GET DECRYPTED DRIVE FILE ID
        -------------------------------------------------- */

        const fileId =
            bundle?.[plan]?.fileId;


        if (
            !fileId
        ) {

            return res
                .status(404)
                .json({

                    success:
                        false,

                    message:
                        "Secure download file is not configured."

                });

        }


        console.log(
            "[Secure Download] Authorized:",
            {
                user:
                    user.uid,

                bundleId,

                plan
            }
        );

        /* --------------------------------------------------
           LOG DOWNLOAD
        -------------------------------------------------- */

        try {
            await saveDownloadLog({
                orderId: null,
                category: bundle.category || "reels",
                plan: plan || "basic",
                bundleId: bundle.id || bundleId,
                bundleName: bundle.name || bundle.title || "Reels Bundle",
                customerName: user.displayName || user.name || "Customer",
                customerEmail: user.email || "",
                customerPhone: user.phoneNumber || user.phone || "",
                amount: 0,
                ip: req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "127.0.0.1",
                userAgent: req.headers["user-agent"] || "Browser",
                status: "SUCCESS"
            });
        } catch (logErr) {
            console.warn("[secureDownloadUserBundle] saveDownloadLog warning:", logErr.message);
        }

        /* --------------------------------------------------
           STREAM
        -------------------------------------------------- */

        await streamDriveFile(
            fileId,
            res
        );

    }

    catch (
        error
    ) {

        console.error(
            "[Secure Download] Error:",
            error
        );


        if (
            res.headersSent
        ) {

            res.destroy(
                error
            );

            return;

        }


        return res
            .status(500)
            .json({

                success:
                    false,

                message:
                    "Unable to start secure download."

            });

    }

}