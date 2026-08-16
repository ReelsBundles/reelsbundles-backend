import nodemailer from "nodemailer";

const SUPPORT_EMAIL =
    process.env.SUPPORT_EMAIL || "reelsbundles.support@gmail.com";

const SMTP_HOST =
    process.env.SMTP_HOST || "smtp.gmail.com";

const SMTP_PORT =
    Number(process.env.SMTP_PORT || 465);

const SMTP_SECURE =
    String(process.env.SMTP_SECURE || "true") === "true";

const SMTP_USER =
    process.env.SMTP_USER;

const SMTP_PASS =
    process.env.SMTP_PASS || process.env.SMTP_APP_PASSWORD;


const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,

    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
    },

    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000
});


/**
 * Verify SMTP configuration
 */
export const verifyContactEmailService = async () => {

    if (!SMTP_USER || !SMTP_PASS) {

        console.warn(
            "⚠️ Contact email SMTP credentials are not configured."
        );

        return false;
    }

    try {

        await transporter.verify();

        console.log(
            "✅ Contact email SMTP connection verified."
        );

        return true;

    } catch (error) {

        console.error(
            "❌ Contact email SMTP verification failed:",
            error.message
        );

        return false;
    }
};


/**
 * Send support request
 */
export const sendSupportRequest = async ({
    name,
    email,
    subject,
    message
}) => {

    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim();
    const cleanSubject = String(subject).trim();
    const cleanMessage = String(message).trim();


    /*
     * Email sent to support team
     */
    await transporter.sendMail({

        from: `"ReelsBundles Support" <${SMTP_USER}>`,

        to: SUPPORT_EMAIL,

        replyTo: cleanEmail,

        subject: `[Contact] ${cleanSubject}`,

        text: `
New ReelsBundles Support Request

Name:
${cleanName}

Email:
${cleanEmail}

Subject:
${cleanSubject}

Message:
${cleanMessage}

--------------------------------
This message was submitted through the ReelsBundles Contact Form.
        `.trim(),

        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222;">

                <h2>New ReelsBundles Support Request</h2>

                <hr>

                <p>
                    <strong>Name:</strong><br>
                    ${escapeHtml(cleanName)}
                </p>

                <p>
                    <strong>Email:</strong><br>
                    ${escapeHtml(cleanEmail)}
                </p>

                <p>
                    <strong>Subject:</strong><br>
                    ${escapeHtml(cleanSubject)}
                </p>

                <p>
                    <strong>Message:</strong><br>
                    ${escapeHtml(cleanMessage).replace(/\n/g, "<br>")}
                </p>

                <hr>

                <p style="color:#777;font-size:13px;">
                    Submitted through the ReelsBundles Contact Form.
                </p>

            </div>
        `.trim()
    });


    /*
     * Automatic acknowledgement to customer
     */
    await transporter.sendMail({

        from: `"ReelsBundles Support" <${SMTP_USER}>`,

        to: cleanEmail,

        replyTo: SUPPORT_EMAIL,

        subject: "We received your ReelsBundles support request",

        text: `
Hi ${cleanName},

Thanks for contacting ReelsBundles.

We've received your support request and our support team will review it.

We aim to reply within 24 hours.

If you don't see our reply, please check your spam or junk folder.

Regards,
ReelsBundles Support
${SUPPORT_EMAIL}
        `.trim(),

        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222;">

                <h2>Thanks for contacting ReelsBundles!</h2>

                <p>
                    Hi ${escapeHtml(cleanName)},
                </p>

                <p>
                    We've received your support request and our
                    support team will review it.
                </p>

                <p>
                    <strong>
                        We aim to reply within 24 hours.
                    </strong>
                </p>

                <p>
                    If you don't see our reply, please check your
                    spam or junk folder.
                </p>

                <br>

                <p>
                    Regards,<br>
                    <strong>ReelsBundles Support</strong><br>
                    ${SUPPORT_EMAIL}
                </p>

            </div>
        `.trim()
    });

};


/**
 * Basic HTML escaping
 *
 * Prevents user-submitted data from becoming
 * executable HTML inside the email.
 */
function escapeHtml(value) {

    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}