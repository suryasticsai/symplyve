const leaveModule = {
    data() {
        return {
            selectedEmployee: null,
            targetEmployee: null, // Used for My Leave tab
            profileEmployee: null, // Used for Profile Modal
            newLeave: { type: 'annual', startDate: '', endDate: '', reason: '' },
            isSubmitting: false,
            toasts: [] 
        }
    },
    computed: {
        myLeaves() {
            if (!this.targetEmployee) return [];
            return this.leaves.filter(l => l.emp === this.targetEmployee.name);
        }
    },
    methods: {
        calculateUsed(empName) {
            if (!empName) return 0;
            return this.leaves
                .filter(l => l.emp === empName && l.status === 'Approved')
                .reduce((sum, l) => sum + (l.end - l.start + 1), 0);
        },
        openLeaveModal() {
            if (!this.selectedEmployee && this.employees.length > 0) {
                this.selectedEmployee = this.employees[0];
            }
            this.newLeave = { type: 'annual', startDate: '', endDate: '', reason: '' };
            this.isSubmitting = false;
            new bootstrap.Modal(document.getElementById('leaveModal')).show();
        },
        openProfile(emp) {
            if (!emp) return;
            this.profileEmployee = emp;
            new bootstrap.Modal(document.getElementById('profileModal')).show();
        },
        updateURL() {
            if (this.targetEmployee) {
                const url = new URL(window.location);
                url.searchParams.set('empId', this.targetEmployee.id);
                window.history.pushState({}, '', url);
            }
        },
        async submitLeave() {
            if (!this.selectedEmployee) return;
            
            this.isSubmitting = true;
            const payload = {
                employeeId: this.selectedEmployee.id,
                employeeName: this.selectedEmployee.name,
                type: this.newLeave.type,
                startDate: this.newLeave.startDate,
                endDate: this.newLeave.endDate,
                reason: this.newLeave.reason,
                status: 'Pending'
            };

            try {
                const data = await this.saveLeaveToSheet(payload);

                if (data.success) {
                    bootstrap.Modal.getInstance(document.getElementById('leaveModal')).hide();
                    await this.loadData(); 
                    this.showToast(`Leave request submitted successfully.`, 'success');
                } else {
                    this.showToast(data.error || "Failed to save.", 'error');
                }
            } catch (error) {
                this.showToast("Network error.", 'error');
            } finally {
                this.isSubmitting = false;
            }
        },
        showToast(msg, type) {
            const id = Date.now();
            this.toasts.push({ id, message: msg, type });
            setTimeout(() => this.toasts = this.toasts.filter(t => t.id !== id), 4000);
        },
        approveLeave(id) {
            this.pendingRequests = this.pendingRequests.filter(r => r.id !== id);
            this.showToast("Leave approved successfully.", "success");
        },
        rejectLeave(id) {
            this.pendingRequests = this.pendingRequests.filter(r => r.id !== id);
            this.showToast("Leave rejected.", "error");
        }
    }
};