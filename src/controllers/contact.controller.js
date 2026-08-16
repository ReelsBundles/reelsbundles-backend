import {
    sendSupportRequest
} from "../services/contact.service.js";


/**
 * POST /api/contact
 *
 * Receive contact form submission
 * and send it to ReelsBundles support.
 */
export const submitContactForm = async (req, res) => {

    try {

        const {
            name,
            email,
            subject,
            message
        } = req.body || {};


        /*
         * Required fields
         */
        if (
            !name ||
            !email ||
            !subject ||
            !message
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Name, email, subject and message are required."

            });

        }


        /*
         * Clean values
         */
        const cleanName =
            String(name).trim();

        const cleanEmail =
            String(email).trim().toLowerCase();

        const cleanSubject =
            String(subject).trim();

        const cleanMessage =
            String(message).trim();


        /*
         * Length protection
         */
        if (cleanName.length < 2) {

            return res.status(400).json({

                success: false,

                message:
                    "Please enter a valid name."

            });

        }


        if (cleanName.length > 100) {

            return res.status(400).json({

                success: false,

                message:
                    "Name is too long."

            });

        }


        if (cleanSubject.length < 2) {

            return res.status(400).json({

                success: false,

                message:
                    "Please enter a valid subject."

            });

        }


        if (cleanSubject.length > 200) {

            return res.status(400).json({

                success: false,

                message:
                    "Subject is too long."

            });

        }


        if (cleanMessage.length < 5) {

            return res.status(400).json({

                success: false,

                message:
                    "Please enter a little more detail."

            });

        }


        if (cleanMessage.length > 5000) {

            return res.status(400).json({

                success: false,

                message:
                    "Message is too long."

            });

        }


        /*
         * Email validation
         */
        const emailRegex =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


        if (!emailRegex.test(cleanEmail)) {

            return res.status(400).json({

                success: false,

                message:
                    "Please enter a valid email address."

            });

        }


        /*
         * Send email in background (non-blocking) to prevent HTTP connection resets/hangs
         */
        sendSupportRequest({

            name: cleanName,

            email: cleanEmail,

            subject: cleanSubject,

            message: cleanMessage

        }).catch(err => {
            console.error("❌ Background support email failed to send:", err.message);
        });


        /*
         * Success
         */
        return res.status(200).json({

            success: true,

            message:
                "Thanks! We've received your message. Our support team will reply within 24 hours."

        });


    } catch (error) {

        console.error(
            "❌ Contact form error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Unable to send your message right now. Please try again later."

        });

    }

};