const leaveModule = {
    data() {
        return {
            selectedEmployeeId: '',
            targetEmployeeId: '',
            profileEmployee: null,
            newLeave: { type: 'annual', startDate: '', endDate: '', reason: '' },
            isSubmitting: false,
            toasts: [],

            reviewingLeave: null,
            adminComment: '',
            otpInput: '',
            otpSentTo: '',
            currentApproveId: null
        };
    },
    computed: {
        targetEmployee() { return this.employees.find(e => e.id === this.targetEmployeeId) || null; },
        selectedEmployee() { return this.employees.find(e => e.id === this.selectedEmployeeId) || null; },
        myLeaves() {
            if (!this.targetEmployee) return [];
            return this.leaves
                .filter(l => l.empId === this.targetEmployee.id)
                .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
        },
        leaveDays() {
            const { startDate: s, endDate: e } = this.newLeave;
            if (!dateUtil.isISO(s) || !dateUtil.isISO(e) || e < s) return 0;
            return dateUtil.days(s, e);
        },
        leaveDateError() {
            const { startDate: s, endDate: e } = this.newLeave;
            if (dateUtil.isISO(s) && dateUtil.isISO(e) && e < s) return 'End date cannot be before the start date.';
            return '';
        }
    },
    methods: {
        /* ---------- balances (same rules as the server) ---------- */
        allowanceOf(emp) {
            if (!emp) return 24;
            const t = emp.totalAllowance;
            return (t === '' || t == null || !isFinite(Number(t))) ? 24 : Number(t);
        },
        calculateUsed(emp) {
            if (!emp) return 0;
            const year = String(new Date().getFullYear());
            return this.leaves
                .filter(l => l.empId === emp.id && l.typeKey === 'annual' && l.status === 'Approved' && l.startDate.slice(0, 4) === year)
                .reduce((s, l) => s + l.days, 0);
        },

        /* ---------- modal helpers ---------- */
        modal(id) {
            return bootstrap.Modal.getOrCreateInstance(document.getElementById(id));
        },
        /** Close one modal, then open another once the first has finished hiding. */
        swapModal(fromId, toId) {
            const el = document.getElementById(fromId);
            const next = () => this.modal(toId).show();
            if (el && el.classList.contains('show')) {
                el.addEventListener('hidden.bs.modal', next, { once: true });
                this.modal(fromId).hide();
            } else {
                next();
            }
        },
        showToast(msg, type) {
            const id = Date.now() + Math.random();
            this.toasts.push({ id, message: msg, type });
            setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id); }, 4500);
        },
        /** Show an API error, and send the user back to sign-in if their session died. */
        failWith(res, fallback) {
            this.showToast((res && res.error) || fallback, 'error');
            if (res && res.code === 'AUTH') this.promptLogin('Your session expired. Sign in again to continue.');
        },

        /* ---------- apply for leave ---------- */
        openLeaveModal(prefill = {}) {
            if (!this.isAuthenticated) {
                this.promptLogin('Sign in to apply for leave.', () => this.openLeaveModal(prefill));
                return;
            }
            this.selectedEmployeeId = this.isAdmin
                ? (this.targetEmployeeId || (this.employees[0] && this.employees[0].id) || '')
                : this.currentUser.id;
            this.newLeave = {
                type: 'annual',
                startDate: prefill.startDate || '',
                endDate: prefill.endDate || prefill.startDate || '',
                reason: ''
            };
            this.isSubmitting = false;
            this.modal('leaveModal').show();
        },

        onStartDateChange() {
            const { startDate: s, endDate: e } = this.newLeave;
            if (dateUtil.isISO(s) && (!dateUtil.isISO(e) || e < s)) this.newLeave.endDate = s;
        },

        async submitLeave() {
            if (this.isSubmitting) return;
            if (!this.leaveDays) {
                this.showToast(this.leaveDateError || 'Choose a start and end date.', 'error');
                return;
            }
            if (this.isAdmin && !this.selectedEmployeeId) {
                this.showToast('Select an employee.', 'error');
                return;
            }

            this.isSubmitting = true;
            try {
                const res = await this.api('addLeave', {
                    employeeId: this.isAdmin ? this.selectedEmployeeId : undefined,   // ignored for non-admins
                    type: this.newLeave.type,
                    startDate: this.newLeave.startDate,
                    endDate: this.newLeave.endDate,
                    reason: this.newLeave.reason
                }, { auth: true });

                if (res && res.success) {
                    this.modal('leaveModal').hide();
                    await this.loadData({ silent: true });
                    this.showToast('Leave request submitted. You will get an email once it is reviewed.', 'success');
                } else {
                    this.failWith(res, 'Could not submit your request.');
                }
            } catch (error) {
                this.showToast(error.message || 'Network error.', 'error');
            } finally {
                this.isSubmitting = false;
            }
        },

        /* ---------- profile + deep link ---------- */
        openProfile(emp) {
            if (!emp) return;
            this.profileEmployee = emp;
            this.modal('profileModal').show();
        },
        updateURL() {
            if (!this.targetEmployee) return;
            const url = new URL(window.location);
            url.searchParams.set('empId', this.targetEmployee.id);
            window.history.replaceState({}, '', url);
        },

        /* ---------- admin review ---------- */
        openReviewModal(req) {
            this.reviewingLeave = req;
            this.adminComment = '';
            this.modal('reviewModal').show();
        },

        async handleReject() {
            if (this.isSubmitting || !this.reviewingLeave) return;
            this.isSubmitting = true;
            try {
                const res = await this.api('updateLeaveStatus', {
                    id: this.reviewingLeave.id,
                    status: 'Rejected',
                    comment: this.adminComment
                }, { auth: true });

                if (res && res.success) {
                    this.modal('reviewModal').hide();
                    await this.loadData({ silent: true });
                    this.showToast('Request rejected. The employee has been emailed.', 'success');
                } else {
                    this.failWith(res, 'Could not reject this request.');
                }
            } catch (e) {
                this.showToast(e.message || 'Network error.', 'error');
            } finally {
                this.isSubmitting = false;
            }
        },

        async initiateApproval() {
            if (this.isSubmitting || !this.reviewingLeave) return;
            this.isSubmitting = true;
            this.currentApproveId = this.reviewingLeave.id;
            try {
                const res = await this.api('sendOTP', { leaveId: this.currentApproveId }, { auth: true });
                if (res && res.success) {
                    this.otpInput = '';
                    this.otpSentTo = res.sentTo || 'the admin email';
                    this.swapModal('reviewModal', 'otpModal');
                } else {
                    this.failWith(res, 'Could not send the verification code.');
                }
            } catch (e) {
                this.showToast(e.message || 'Network error.', 'error');
            } finally {
                this.isSubmitting = false;
            }
        },

        async resendOtp() {
            if (this.isSubmitting || !this.currentApproveId) return;
            this.isSubmitting = true;
            try {
                const res = await this.api('sendOTP', { leaveId: this.currentApproveId }, { auth: true });
                if (res && res.success) this.showToast('New code sent.', 'success');
                else this.failWith(res, 'Could not send a new code.');
            } catch (e) {
                this.showToast(e.message || 'Network error.', 'error');
            } finally {
                this.isSubmitting = false;
            }
        },

        async verifyOTP() {
            if (this.isSubmitting || this.otpInput.length !== 6) return;
            this.isSubmitting = true;
            try {
                const res = await this.api('verifyAndApprove', {
                    leaveId: this.currentApproveId,
                    otp: this.otpInput,
                    comment: this.adminComment
                }, { auth: true });

                if (res && res.success) {
                    this.modal('otpModal').hide();
                    await this.loadData({ silent: true });
                    this.showToast('Leave approved. The employee has been emailed.', 'success');
                } else {
                    this.failWith(res, 'Verification failed.');
                    if (res && res.code === 'OTP_EXPIRED') this.otpInput = '';
                }
            } catch (e) {
                this.showToast(e.message || 'Network error.', 'error');
            } finally {
                this.isSubmitting = false;
            }
        }
    }
};
