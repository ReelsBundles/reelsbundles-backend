import nodemailer from "nodemailer";

import env from "../config/env.js";


const transporter =
    nodemailer.createTransport({

        service: "gmail",

        auth: {

            user:
                env.SMTP_USER,

            pass:
                env.SMTP_APP_PASSWORD

        }

    });


export const verifyEmailTransport =
    async () => {

        await transporter.verify();

        console.log(
            "✅ ReelsBundles email SMTP connected."
        );

    };


export const sendPasswordResetEmail =
    async ({
        to,
        resetLink,
        displayName = ""
    }) => {

        const safeName =
            displayName ||
            "there";


        const mailOptions = {

            from: {

                name:
                    env.SMTP_FROM_NAME ||
                    "ReelsBundles Support",

                address:
                    env.SMTP_USER

            },

            to,

            subject:
                "Reset your ReelsBundles password",

            text:
`Hi ${safeName},

We received a request to reset your ReelsBundles password.

Reset your password:
${resetLink}

If you did not request this password reset, you can safely ignore this email.

This link is for your ReelsBundles account only.

Regards,
ReelsBundles Support
reelsbundles.support@gmail.com`,

            html: `
<!DOCTYPE html>

<html>
<head>
    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>Reset Password | ReelsBundles</title>
</head>

<body
    style="
        margin:0;
        padding:0;
        background:#080812;
        font-family:Arial,Helvetica,sans-serif;
        color:#ffffff;
    "
>

<table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    style="padding:40px 15px;"
>

<tr>
<td align="center">

<table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    style="
        max-width:560px;
        background:#11111e;
        border-radius:18px;
        overflow:hidden;
    "
>

<tr>
<td
    style="
        padding:32px;
        text-align:center;
    "
>

<h1
    style="
        margin:0;
        color:#b05cff;
        font-size:28px;
    "
>
    ReelsBundles
</h1>

<p
    style="
        color:#aaaaBB;
        font-size:14px;
        margin-top:8px;
    "
>
    200,000+ Ready-To-Post Instagram Reels
</p>

</td>
</tr>


<tr>
<td
    style="
        padding:10px 35px 35px;
    "
>

<h2
    style="
        color:#ffffff;
        font-size:24px;
    "
>
    Reset your password
</h2>

<p
    style="
        color:#c7c7d4;
        line-height:1.7;
        font-size:15px;
    "
>
    Hi ${safeName},
</p>

<p
    style="
        color:#c7c7d4;
        line-height:1.7;
        font-size:15px;
    "
>
    We received a request to reset your
    ReelsBundles account password.
</p>

<p
    style="
        color:#c7c7d4;
        line-height:1.7;
        font-size:15px;
    "
>
    Click the button below to create a new password.
</p>

<p
    style="
        text-align:center;
        margin:30px 0;
    "
>

<a
    href="${resetLink}"
    style="
        display:inline-block;
        padding:14px 28px;
        border-radius:10px;
        background:linear-gradient(
            135deg,
            #8b5cf6,
            #ec4899
        );
        color:#ffffff;
        text-decoration:none;
        font-weight:bold;
    "
>
    Reset Password
</a>

</p>

<p
    style="
        color:#8d8d9e;
        line-height:1.6;
        font-size:13px;
    "
>
    If you did not request this password reset,
    you can safely ignore this email.
</p>

<hr
    style="
        border:0;
        border-top:1px solid #29293a;
        margin:30px 0;
    "
>

<p
    style="
        color:#777789;
        font-size:12px;
        line-height:1.6;
    "
>
    ReelsBundles Support<br>
    reelsbundles.support@gmail.com
</p>

</td>
</tr>

</table>

</td>
</tr>

</table>

</body>
</html>
`

        };


        const info =
            await transporter.sendMail(
                mailOptions
            );


        console.log(
            "✅ Password reset email sent:",
            info.messageId
        );


        return info;

    };