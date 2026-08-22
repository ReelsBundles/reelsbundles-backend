import {
    getActiveNotifications,
    getAllNotifications,
    createNotification,
    updateNotification,
    deleteNotification
} from "../services/notification-storage.service.js";

// Public: Get active notifications for users
export function handleGetPublicNotifications(req, res) {
    try {
        const notifications = getActiveNotifications();
        return res.status(200).json({
            success: true,
            count: notifications.length,
            notifications
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to fetch notifications"
        });
    }
}

// Admin: Get all notifications
export function handleGetAdminNotifications(req, res) {
    try {
        const notifications = getAllNotifications();
        return res.status(200).json({
            success: true,
            count: notifications.length,
            notifications
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to fetch admin notifications"
        });
    }
}

// Admin: Create notification
export function handleCreateAdminNotification(req, res) {
    try {
        const data = req.body || {};
        if (!data.title || !data.message) {
            return res.status(400).json({
                success: false,
                message: "Notification title and message are required."
            });
        }
        const created = createNotification(data);
        return res.status(201).json({
            success: true,
            message: "Notification created successfully",
            notification: created
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to create notification"
        });
    }
}

// Admin: Update notification
export function handleUpdateAdminNotification(req, res) {
    try {
        const { id } = req.params;
        const data = req.body || {};
        const updated = updateNotification(id, data);
        if (!updated) {
            return res.status(404).json({
                success: false,
                message: "Notification not found"
            });
        }
        return res.status(200).json({
            success: true,
            message: "Notification updated successfully",
            notification: updated
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to update notification"
        });
    }
}

// Admin: Delete notification
export function handleDeleteAdminNotification(req, res) {
    try {
        const { id } = req.params;
        const success = deleteNotification(id);
        if (!success) {
            return res.status(404).json({
                success: false,
                message: "Notification not found"
            });
        }
        return res.status(200).json({
            success: true,
            message: "Notification deleted successfully"
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to delete notification"
        });
    }
}
