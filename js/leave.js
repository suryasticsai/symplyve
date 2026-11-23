const leaveModule = {
    data() {
        return {
            selectedEmployee: null,
            targetEmployee: null, 
            profileEmployee: null, 
            newLeave: { type: 'annual', startDate: '', endDate: '', reason: '' },
            isSubmitting: false,
            toasts: [], 
            
            reviewingLeave: null,
            adminComment: '',
            otpInput: '',
            currentApproveId: null,
            reviewModalObj: null,
            otpModalObj: null,
            profileModalObj: null
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
                // If employee is logged in, lock to their profile. If admin, default to first.
                this.selectedEmployee = this.isAdmin ? this.employees[0] : this.currentUser;
            }
            this.newLeave = { type: 'annual', startDate: '', endDate: '', reason: '' };
            this.isSubmitting = false;
            new bootstrap.Modal(document.getElementById('leaveModal')).show();
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
        
        // --- ADMIN REVIEW FLOWS ---
        openReviewModal(req) {
            this.reviewingLeave = req;
            this.adminComment = '';
            
            if(!this.reviewModalObj) {
                this.reviewModalObj = new bootstrap.Modal(document.getElementById('reviewModal'));
            }
            this.reviewModalObj.show();
        },

        async handleReject() {
            this.isSubmitting = true;
            try {
                const payload = { id: this.reviewingLeave.id, status: 'Rejected', comment: this.adminComment };
                await this.updateLeaveStatus(payload);
                
                this.reviewModalObj.hide();
                await this.loadData();
                this.showToast("Leave rejected and email sent.", "error");
            } catch(e) {
                this.showToast("Error rejecting leave.", "error");
            } finally {
                this.isSubmitting = false;
            }
        },

        async initiateApproval() {
            this.isSubmitting = true;
            this.currentApproveId = this.reviewingLeave.id;
            
            try {
                const res = await fetch(`${CONFIG.API_URL}?action=sendOTP&leaveId=${this.currentApproveId}`);
                const data = await res.json();
                
                if(data.success) {
                    this.reviewModalObj.hide();
                    this.otpInput = '';
                    if(!this.otpModalObj) {
                        this.otpModalObj = new bootstrap.Modal(document.getElementById('otpModal'));
                    }
                    this.otpModalObj.show();
                    this.showToast("OTP sent to Symplye@gmail.com", "success");
                } else {
                    this.showToast(data.error, "error");
                }
            } catch(e) {
                this.showToast("Failed to send OTP.", "error");
            } finally {
                this.isSubmitting = false;
            }
        },

        async verifyOTP() {
            if(this.otpInput.length !== 6) return;
            this.isSubmitting = true;
            
            try {
                const url = `${CONFIG.API_URL}?action=verifyAndApprove&leaveId=${this.currentApproveId}&otp=${this.otpInput}&comment=${encodeURIComponent(this.adminComment)}`;
                const res = await fetch(url);
                const data = await res.json();
                
                if(data.success) {
                    this.otpModalObj.hide();
                    await this.loadData();
                    this.showToast("Leave approved successfully!", "success");
                } else {
                    this.showToast(data.error, "error");
                }
            } catch(e) {
                this.showToast("Verification failed.", "error");
            } finally {
                this.isSubmitting = false;
            }
        }
    }
}; 