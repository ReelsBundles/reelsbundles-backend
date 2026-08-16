/* ==========================================================
   REELSBUNDLES BACKEND
   SERVER ENTRY POINT
   PHASE A3
========================================================== */


/* ==========================================================
   ENVIRONMENT
========================================================== */

import "dotenv/config";


/* ==========================================================
   APP
========================================================== */

import app from "./app.js";


/* ==========================================================
   PORT
========================================================== */

const PORT =
    Number(
        process.env.PORT
    ) || 3000;


/* ==========================================================
   START SERVER
========================================================== */

const server =
    app.listen(
        PORT,
        () => {

            console.log(
                "=========================================="
            );

            console.log(
                "🚀 ReelsBundles Backend"
            );

            console.log(
                `🌐 Port: ${PORT}`
            );

            console.log(
                `🔐 Environment: ${
                    process.env.NODE_ENV ||
                    "development"
                }`
            );

            console.log(
                "📦 API: /api"
            );

            console.log(
                "👤 User Bundles: /api/user/bundles"
            );

            console.log(
                "=========================================="
            );

        }
    );


/* ==========================================================
   SERVER ERROR
========================================================== */

server.on(
    "error",
    error => {

        console.error(
            "❌ Server failed to start:",
            error
        );


        if (
            error.code ===
            "EADDRINUSE"
        ) {

            console.error(
                `❌ Port ${PORT} is already in use.`
            );

        }


        process.exit(
            1
        );

    }
);


/* ==========================================================
   GRACEFUL SHUTDOWN
========================================================== */

function shutdown(
    signal
) {

    console.log(
        `\n🛑 ${signal} received. Shutting down...`
    );


    server.close(
        error => {

            if (
                error
            ) {

                console.error(
                    "❌ Error while shutting down:",
                    error
                );

                process.exit(
                    1
                );

            }


            console.log(
                "✅ Server closed successfully."
            );

            process.exit(
                0
            );

        }
    );

}


/* ==========================================================
   PROCESS SIGNALS
========================================================== */

process.on(
    "SIGTERM",
    () => {

        shutdown(
            "SIGTERM"
        );

    }
);


process.on(
    "SIGINT",
    () => {

        shutdown(
            "SIGINT"
        );

    }
);