const apiModule = {
    methods: {
        async fetchLeavesFromSheet() {
            try {
                const response = await fetch(`${CONFIG.API_URL}?action=getLeaves`);
                return await response.json();
            } catch (error) {
                console.error("Error fetching leaves:", error);
                return [];
            }
        },
        async fetchEmployeesFromSheet() {
            try {
                const response = await fetch(`${CONFIG.API_URL}?action=getEmployees`);
                return await response.json();
            } catch (error) {
                console.error("Error fetching employees:", error);
                return [];
            }
        },
        async saveLeaveToSheet(leaveData) {
            try {
                const payloadStr = btoa(JSON.stringify(leaveData));
                const url = `${CONFIG.API_URL}?action=addLeave&payload=${payloadStr}`;
                const response = await fetch(url);
                return await response.json();
            } catch (error) {
                console.error("Error saving to Google Sheets:", error);
                return { success: false, error: "Network error." };
            }
        },
        async updateLeaveStatus(payload) {
            try {
                const payloadStr = btoa(JSON.stringify(payload));
                const url = `${CONFIG.API_URL}?action=updateLeaveStatus&payload=${payloadStr}`;
                const response = await fetch(url);
                return await response.json();
            } catch (error) {
                console.error("Error updating status:", error);
                return { success: false, error: "Network error." };
            }
        }
    }
};