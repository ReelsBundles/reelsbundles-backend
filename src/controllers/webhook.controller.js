import crypto from "crypto";
import { updatePayment } from "../services/payment-storage.service.js";

export const cashfreeWebhook = async (req, res) => {
    try {
        const signature = req.headers["x-webhook-signature"];
        const timestamp = req.headers["x-webhook-timestamp"];

        if (!signature || !timestamp) {
            console.error("[Webhook] Missing Cashfree webhook signature or timestamp headers.");
            return res.status(400).json({
                success: false,
                message: "Missing signature/timestamp headers."
            });
        }

        const secretKey = process.env.CASHFREE_CLIENT_SECRET;
        if (!secretKey) {
            console.error("[Webhook] CASHFREE_CLIENT_SECRET is missing in environment variables.");
            return res.status(500).json({
                success: false,
                message: "Webhook configuration error."
            });
        }

        // Calculate expected signature using rawBody
        const rawBody = req.rawBody || "";
        const dataToSign = timestamp + rawBody;
        const expectedSignature = crypto
            .createHmac("sha256", secretKey)
            .update(dataToSign)
            .digest("base64");

        if (signature !== expectedSignature) {
            console.warn("[Webhook] Invalid Cashfree signature detected. Rejecting event.");
            return res.status(400).json({
                success: false,
                message: "Invalid webhook signature."
            });
        }

        const event = req.body;
        console.log("[Webhook] Valid Cashfree signature verified. Processing event:", event?.type);

        if (event?.type === "PAYMENT_SUCCESS_WEBHOOK" && event?.data?.order?.order_id) {
            await updatePayment(
                event.data.order.order_id,
                {
                    paymentStatus: "PAID",
                    updatedAt: new Date()
                }
            );
        }

        return res.status(200).json({
            success: true
        });
    } catch (error) {
        console.error("[Webhook] Error processing Cashfree webhook:", error);
        return res.status(500).json({
            success: false
        });
    }
};