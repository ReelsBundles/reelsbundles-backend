import {
    getActiveImportantAlerts,
    getAllImportantAlerts,
    fetchImportantAlertsAsync,
    createImportantAlert,
    updateImportantAlert,
    deleteImportantAlert
} from "../services/alert-storage.service.js";

// Public: Get active Important Alerts
export async function handleGetPublicAlerts(req, res) {
    try {
        await fetchImportantAlertsAsync();
        const alerts = getActiveImportantAlerts();
        return res.status(200).json({
            success: true,
            count: alerts.length,
            alerts
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to fetch alerts"
        });
    }
}

// Admin: Get all Important Alerts
export async function handleGetAdminAlerts(req, res) {
    try {
        await fetchImportantAlertsAsync();
        const alerts = getAllImportantAlerts();
        return res.status(200).json({
            success: true,
            count: alerts.length,
            alerts
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to fetch admin alerts"
        });
    }
}

// Admin: Create Important Alert
export async function handleCreateAdminAlert(req, res) {
    try {
        const data = req.body || {};
        if (!data.title || !data.message) {
            return res.status(400).json({
                success: false,
                message: "Alert title and message are required."
            });
        }
        const created = await createImportantAlert(data);
        return res.status(201).json({
            success: true,
            message: "Important Alert created successfully",
            alert: created
        });
     } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to create alert"
        });
    }
}

// Admin: Update Important Alert
export async function handleUpdateAdminAlert(req, res) {
    try {
        const { id } = req.params;
        const data = req.body || {};
        const updated = await updateImportantAlert(id, data);
        if (!updated) {
            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });
        }
        return res.status(200).json({
            success: true,
            message: "Important Alert updated successfully",
            alert: updated
        });
     } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to update alert"
        });
    }
}

// Admin: Delete Important Alert
export async function handleDeleteAdminAlert(req, res) {
    try {
        const { id } = req.params;
        const success = await deleteImportantAlert(id);
        if (!success) {
            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });
        }
        return res.status(200).json({
            success: true,
            message: "Important Alert deleted successfully"
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to delete alert"
        });
    }
}
