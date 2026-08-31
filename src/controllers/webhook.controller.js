import { updatePayment, getPayment } from "../services/payment-storage.service.js";
import { verifyUroPayWebhookSignature } from "../services/uropay.service.js";

const processedEvents = new Set();

export const uropayWebhook = async (req, res) => {
    try {
        const rawBody = req.rawBody || "";

        // Verify HMAC-SHA256 signature using official UroPay algorithm
        const isSignatureValid = verifyUroPayWebhookSignature(req.headers, rawBody);
        if (!isSignatureValid) {
            console.warn("[Webhook] Invalid UroPay webhook signature detected. Rejecting event.");
            return res.status(400).json({
                success: false,
                message: "Invalid webhook signature."
            });
        }

        const event = req.body || {};
        console.log("[Webhook] Valid UroPay webhook signature verified. Processing event:", event?.eventId, "| Status:", event?.status);

        // Idempotency: Prevent duplicate delivery processing
        if (event?.eventId) {
            if (processedEvents.has(event.eventId)) {
                console.log(`[Webhook] Duplicate eventId '${event.eventId}' safely acknowledged.`);
                return res.status(200).json({ success: true, message: "Duplicate event acknowledged." });
            }
            processedEvents.add(event.eventId);
            if (processedEvents.size > 1000) {
                const firstItem = processedEvents.values().next().value;
                processedEvents.delete(firstItem);
            }
        }

        const orderRef = event?.tenantOrderRef || event?.orderId;
        const uropayStatus = String(event?.status || "").toUpperCase();

        if (orderRef) {
            const storedPayment = await getPayment(orderRef);
            if (storedPayment) {
                if (["PAID", "SUCCESS", "COMPLETED", "CAPTURED"].includes(uropayStatus)) {
                    await updatePayment(orderRef, {
                        paymentStatus: "PAID",
                        uropayOrderId: event.orderId || storedPayment.uropayOrderId || null,
                        webhookEventId: event.eventId || null,
                        amount: event.amount_captured || event.amount || storedPayment.amount,
                        paidAt: storedPayment.paidAt || new Date(),
                        updatedAt: new Date()
                    });
                    console.log(`[Webhook] Payment order '${orderRef}' updated to PAID via UroPay webhook.`);
                } else if (["FAILED", "EXPIRED", "CANCELLED"].includes(uropayStatus)) {
                    await updatePayment(orderRef, {
                        paymentStatus: uropayStatus,
                        webhookEventId: event.eventId || null,
                        updatedAt: new Date()
                    });
                    console.log(`[Webhook] Payment order '${orderRef}' status updated to ${uropayStatus}.`);
                }
            }
        }

        return res.status(200).json({
            success: true
        });
    } catch (error) {
        console.error("[Webhook] Error processing UroPay webhook:", error);
        return res.status(500).json({
            success: false,
            message: "Webhook processing error."
        });
    }
};

export const cashfreeWebhook = uropayWebhook;