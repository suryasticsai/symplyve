const apiModule = {
    methods: {
        async fetchEmployeesFromSheet() {
            try {
                const response = await fetch(`${CONFIG.API_URL}?action=getEmployees`);
                return await response.json();
            } catch (error) {
                console.error("Error fetching employees:", error);
                return [];
            }
        },
        async fetchLeavesFromSheet() {
            try {
                // Use getMyLeaves if we have an auth token (gets private comments)
                const action = this.authToken ? 'getMyLeaves' : 'getLeaves';
                const response = await fetch(`${CONFIG.API_URL}?action=${action}&token=${this.authToken || ''}`);
                return await response.json();
            } catch (error) {
                console.error("Error fetching leaves:", error);
                return [];
            }
        },
        async saveLeaveToSheet(leaveData) {
            try {
                // UTF-8 safe Base64
                const payloadStr = btoa(unescape(encodeURIComponent(JSON.stringify(leaveData))));
                const url = `${CONFIG.API_URL}?action=addLeave&payload=${payloadStr}&token=${this.authToken || ''}`;
                const response = await fetch(url);
                return await response.json();
            } catch (error) {
                console.error("Error saving to Google Sheets:", error);
                return { success: false, error: "Network error." };
            }
        },
        async updateLeaveStatus(payload) {
            try {
                const payloadStr = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
                const url = `${CONFIG.API_URL}?action=updateLeaveStatus&payload=${payloadStr}&token=${this.authToken}`;
                const response = await fetch(url);
                return await response.json();
            } catch (error) {
                console.error("Error updating status:", error);
                return { success: false, error: "Network error." };
            }
        },
        async sendOTP(leaveId) {
            try {
                const res = await fetch(`${CONFIG.API_URL}?action=sendOTP&leaveId=${leaveId}&token=${this.authToken}`);
                return await res.json();
            } catch (error) {
                return { success: false, error: "Network error." };
            }
        },
        async verifyAndApprove(leaveId, otp, comment) {
            try {
                const url = `${CONFIG.API_URL}?action=verifyAndApprove&leaveId=${leaveId}&otp=${otp}&comment=${encodeURIComponent(comment)}&token=${this.authToken}`;
                const res = await fetch(url);
                return await res.json();
            } catch (error) {
                return { success: false, error: "Network error." };
            }
        }
    }
};