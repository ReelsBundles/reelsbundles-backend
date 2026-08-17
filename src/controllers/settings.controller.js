import {
    getProtectionSettings,
    updateProtectionSettings
} from "../services/settings-storage.service.js";

export async function getPublicProtectionSettings(req, res) {
    try {
        const settings = getProtectionSettings();
        return res.status(200).json({
            success: true,
            settings
        });
    } catch (error) {
        console.error("[SETTINGS] Public fetch error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to load site protection settings."
        });
    }
}

export async function updateAdminProtectionSettings(req, res) {
    try {
        const { protectionEnabled, disableRightClick, disableDevTools } = req.body || {};
        const updated = updateProtectionSettings({
            protectionEnabled,
            disableRightClick,
            disableDevTools
        });
        return res.status(200).json({
            success: true,
            message: "Site protection settings updated successfully.",
            settings: updated
        });
    } catch (error) {
        console.error("[SETTINGS] Admin update error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update protection settings."
        });
    }
}
