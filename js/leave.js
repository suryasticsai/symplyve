const leaveModule = {
    data() {
        return {
            selectedEmployee: null,
            targetEmployee: null, 
            profileEmployee: null, 
            newLeave: { type: 'annual', startDate: '', endDate: '', reason: '' },
            isSubmitting: false,
            toasts: [], 
            
            // Admin Approval Flow State
            reviewingLeave: null,
            adminComment: '',
            otpInput: '',
            currentApproveId: null,
            
            // Modal Instances
            reviewModalObj: null,
            otpModalObj: null,
            profileModalObj: null,
            leaveModalObj: null
        }
    },
    computed: {
        myLeaves() {
            if (!this.targetEmployee) return [];
            return this.leaves
                .filter(l => l.emp === this.targetEmployee.name)
                .sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
        }
    },
    methods: {
        calculateUsed(empName) {
            if (!empName) return 0;
            return this.leaves
                .filter(l => l.emp === empName && l.status === 'Approved')
                .reduce((sum, l) => {
                    const s = new Date(l.startDate);
                    const e = new Date(l.endDate);
                    const days = Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1;
                    return sum + days;
                }, 0);
        },

        openLeaveModal() {
            if (!this.selectedEmployee && this.employees.length > 0) {
                this.selectedEmployee = this.isAdmin ? this.employees[0] : this.currentUser;
            }
            this.newLeave = { type: 'annual', startDate: '', endDate: '', reason: '' };
            this.isSubmitting = false;
            
            if(!this.leaveModalObj) {
                this.leaveModalObj = new bootstrap.Modal(document.getElementById('leaveModal'));
            }
            this.leaveModalObj.show();
        },

        openProfile(emp) {
            if (!emp) return;
            this.profileEmployee = emp;
            if(!this.profileModalObj) {
                this.profileModalObj = new bootstrap.Modal(document.getElementById('profileModal'));
            }
            this.profileModalObj.show();
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
            if (!this.newLeave.startDate || !this.newLeave.endDate) {
                this.showToast("Please select both start and end dates.", "error");
                return;
            }
            
            this.isSubmitting = true;
            const payload = {
                employeeId: this.selectedEmployee.id,
                employeeName: this.selectedEmployee.name,
                employeeEmail: this.selectedEmployee.email,
                type: this.newLeave.type,
                startDate: this.newLeave.startDate,
                endDate: this.newLeave.endDate,
                reason: this.newLeave.reason,
                status: 'Pending'
            };

            try {
                const data = await this.saveLeaveToSheet(payload);

                if (data.success) {
                    this.leaveModalObj.hide();
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

        // ==========================================
        // ADMIN REVIEW & OTP FLOW
        // ==========================================
        openReviewModal(req) {
            if (!this.isAdmin) return;
            this.reviewingLeave = req;
            this.adminComment = '';
            
            if(!this.reviewModalObj) {
                this.reviewModalObj = new bootstrap.Modal(document.getElementById('reviewModal'));
            }
            this.reviewModalObj.show();
        },

        async handleReject() {
            if (!this.isAdmin) return;
            this.isSubmitting = true;
            
            try {
                const payload = { id: this.reviewingLeave.id, status: 'Rejected', comment: this.adminComment };
                const data = await this.updateLeaveStatus(payload);
                
                if (data.success) {
                    this.reviewModalObj.hide();
                    await this.loadData();
                    this.showToast("Leave rejected and email sent.", "error");
                } else {
                    this.showToast(data.error || "Failed to reject.", "error");
                }
            } catch(e) {
                this.showToast("Error rejecting leave.", "error");
            } finally {
                this.isSubmitting = false;
            }
        },

        async initiateApproval() {
            if (!this.isAdmin) return;
            this.isSubmitting = true;
            this.currentApproveId = this.reviewingLeave.id;
            
            try {
                const data = await this.sendOTP(this.currentApproveId);
                
                if(data.success) {
                    this.reviewModalObj.hide();
                    this.otpInput = '';
                    if(!this.otpModalObj) {
                        this.otpModalObj = new bootstrap.Modal(document.getElementById('otpModal'));
                    }
                    this.otpModalObj.show();
                    this.showToast("OTP sent to Symplye@gmail.com", "success");
                } else {
                    this.showToast(data.error || "Failed to send OTP.", "error");
                }
            } catch(e) {
                this.showToast("Failed to send OTP. Network error.", "error");
            } finally {
                this.isSubmitting = false;
            }
        },

        async verifyOTP() {
            if (!this.isAdmin || this.otpInput.length !== 6) return;
            this.isSubmitting = true;
            
            try {
                const data = await this.verifyAndApprove(this.currentApproveId, this.otpInput, this.adminComment);
                
                if(data.success) {
                    this.otpModalObj.hide();
                    await this.loadData();
                    this.showToast("Leave approved successfully!", "success");
                } else {
                    this.showToast(data.error || "Invalid OTP.", "error");
                }
            } catch(e) {
                this.showToast("Verification failed. Network error.", "error");
            } finally {
                this.isSubmitting = false;
            }
        },

        showToast(msg, type = 'success') {
            const id = Date.now() + Math.random().toString(36).substr(2, 5);
            this.toasts.push({ id, message: msg, type });
            
            setTimeout(() => {
                this.toasts = this.toasts.filter(t => t.id !== id);
            }, 4000);
        }
    }
};