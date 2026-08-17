import {
    getAllUsers,
    syncUser,
    deleteUser,
    toggleUserStatus
} from "../services/user-storage.service.js";

export function handleSyncUser(req, res) {
    try {
        const userData = req.body || {};
        const synced = syncUser(userData);
        return res.status(200).json({
            success: true,
            message: "User profile synced successfully",
            user: synced
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message || "Failed to sync user profile"
        });
    }
}

export function handleGetAdminUsers(req, res) {
    try {
        const users = getAllUsers();
        return res.status(200).json({
            success: true,
            count: users.length,
            users: users
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to fetch users"
        });
    }
}

export function handleDeleteAdminUser(req, res) {
    try {
        const userId = req.params.userId;
        deleteUser(userId);
        return res.status(200).json({
            success: true,
            message: "User deleted successfully"
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message || "Failed to delete user"
        });
    }
}

export function handleToggleAdminUserStatus(req, res) {
    try {
        const userId = req.params.userId;
        const updatedUser = toggleUserStatus(userId);
        return res.status(200).json({
            success: true,
            message: `User status changed to ${updatedUser.status}`,
            user: updatedUser
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message || "Failed to update user status"
        });
    }
}
