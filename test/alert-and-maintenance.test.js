import assert from "node:assert";
import {
    loadImportantAlerts,
    saveImportantAlerts,
    createImportantAlert,
    updateImportantAlert,
    deleteImportantAlert,
    getActiveImportantAlerts	} from "../src/services/alert-storage.service.js";

async function runTests() {
    console.log('==========================================');
    console.log('🧪 TESTING IMPORTANT ALERTS & MAINTENANCE');
    console.log('=========================================');

    // Backup existing alerts
    const original = loadImportantAlerts();

    try {
        // 1. CREATE IMPORTANT ALERT
        const newAlert = await createImportantAlert({
            title: "Platform Infrastructure Update",
            message: "Scheduled system upgrade on March 5th.",
            active: true
        });
        assert.ok(newAlert.id, 'Alert must have an id');
        assert.strictEqual(newAlert.title, 'Platform Infrastructure Update');
        assert.strictEqual(newAlert.active, true);
        console.log('  ✅ PASS: Create real Important Alert');

        // 2. GET ACTIVE IMPORTANT ALERTS
        let active = getActiveImportantAlerts();
        assert.ok(active.some(a => a.id === newAlert.id), 'Active alerts must include newly created alert');
        console.log('  ✅ PASS: Get Active Important Alerts');

        // 3. EDIT IMPORTANT ALERT
        const updated = await updateImportantAlert(newAlert.id, {
            title: "Updated Platform Upgrade",
            message: "New detailed timeline."
        });
        assert.strictEqual(updated.title, 'Updated Platform Upgrade');
        assert.strictEqual(updated.message, 'New detailed timeline.');
        assert.strictEqual(updated.active, true);
        console.log('  ✅ PASS: Edit Important Alert');

        // 4. DISABLE IMPORTANT ALERT
        const disabled = await updateImportantAlert(newAlert.id, { active: false });
        assert.strictEqual(disabled.active, false);
        active = getActiveImportantAlerts();
        assert.ok(!active.some(a => a.id === newAlert.id), 'Disabled alert must not appear in getActiveImportantAlerts');
        console.log('  ✅ PASS: Disable Important Alert');

        // 5. RE-ENEABLE IMPORTANT ALERT
        const reenabled = await updateImportantAlert(newAlert.id, { active: true });
        assert.strictEqual(reenabled.active, true);
        active = getActiveImportantAlerts();
        assert.ok(active.some(a => a.id === newAlert.id), 'Re-enabled alert must appear in getActiveImportantAlerts');
        console.log('  ✅ PASS: Enable Important Alert');

        // 6. EXPLICIT DELETE IMPORTANT ALERT
        const deleted = await deleteImportantAlert(newAlert.id);
        assert.strictEqual(deleted, true);
        let all = loadImportantAlerts();
        assert.ok(!all.some(a => a.id === newAlert.id), 'Deleted alert must be gone from all alerts');
        console.log('  ✅ PASS: Explicitly Delete Important Alert');

        console.log('=========================================');
        console.log('🎯 ALL IMPORTANT ALERT TESTS PASSED SUCCESSFULLY');
        console.log('=========================================');
    } finally {
        // Restore original state
        saveImportantAlerts(original);
    }
}

runTests().catch(err => {
    console.error('Test Failed:', err);
    process.exit(1);
});
