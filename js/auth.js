const SESSION_KEY = 'symplyve_session';

/*
 * Authentication. The server is the only source of truth for who you are:
 * a successful login returns a session token that every later request carries.
 * Nothing in the URL (?empId=...) grants any access; it only pre-selects the
 * person in the sign-in box.
 */
const authModule = {
    data() {
        return {
            session: null,            // { token, user: { id, name, role } }
            loginAs: '',
            loginPassword: '',
            confirmPin: '',
            loginError: '',
            loginNotice: '',
            isLoggingIn: false,
            afterLogin: null
        };
    },
    computed: {
        isAuthenticated() { return !!this.session; },
        isAdmin() { return !!this.session && this.session.user.role === 'ADMIN'; },
        currentUser() { return this.session ? this.session.user : null; },
        loginEmployee() { return this.employees.find(e => e.id === this.loginAs) || null; },
        isCreatingPin() { return !!this.loginEmployee && !this.loginEmployee.hasPassword; }
    },
    methods: {
        loadSession() {
            try {
                const raw = sessionStorage.getItem(SESSION_KEY);
                if (!raw) return;
                const s = JSON.parse(raw);
                if (s && s.token && s.user && s.user.id) this.session = s;
            } catch (e) { /* storage unavailable: stay signed out */ }
        },

        persistSession() {
            try {
                if (this.session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
                else sessionStorage.removeItem(SESSION_KEY);
            } catch (e) { /* ignore */ }
        },

        /** Re-validate a saved token with the server on page load. */
        async restoreSession() {
            this.loadSession();
            if (!this.session) return;
            let res;
            try {
                res = await this.api('whoami', {}, { auth: true });
            } catch (e) {
                return;                                  // offline: keep it, retry on next call
            }
            if (res && res.success && res.user) {
                this.session.user = res.user;
                this.persistSession();
            } else {
                this.session = null;
                this.persistSession();
            }
        },

        clearSession(expired) {
            this.session = null;
            this.persistSession();
            this.targetEmployeeId = '';
            if (this.activeTab === 'approvals' || this.activeTab === 'reports') this.activeTab = 'welcome';
            if (expired) this.showToast('Your session expired. Please sign in again.', 'error');
        },

        promptLogin(notice = '', callback = null, preselect = '') {
            this.afterLogin = callback;
            this.loginNotice = notice;
            if (preselect) this.loginAs = preselect;
            this.loginPassword = '';
            this.confirmPin = '';
            this.loginError = '';
            this.modal('loginModal').show();
        },

        async attemptLogin() {
            if (this.isLoggingIn) return;
            const id = this.loginAs;
            const pin = String(this.loginPassword).trim();

            if (!id) { this.loginError = 'Choose who you are first.'; return; }
            if (!pin) return;

            const creating = this.isCreatingPin;
            if (creating) {
                if (!/^\d{4,6}$/.test(pin)) { this.loginError = 'PIN must be 4 to 6 digits.'; return; }
                if (pin !== this.confirmPin) { this.loginError = 'PINs do not match.'; return; }
            }

            this.isLoggingIn = true;
            this.loginError = '';
            try {
                const res = creating
                    ? await this.api('setPin', { empId: id, pin }, { post: true })
                    : await this.api('login', { empId: id, pin }, { post: true });

                if (!res || !res.success) {
                    this.loginError = (res && res.error) || 'Sign in failed.';
                    if (res && res.code === 'NO_PIN') {
                        // The cached employee list is stale; refresh so the "create PIN" form appears.
                        await this.loadData({ silent: true });
                    }
                    return;
                }

                this.session = { token: res.token, user: res.user };
                this.persistSession();
                this.loginPassword = '';
                this.confirmPin = '';
                this.modal('loginModal').hide();

                const callback = this.afterLogin;
                this.afterLogin = null;
                await this.loadData({ silent: true });      // reload with the fuller, signed-in data
                this.showToast(creating ? 'PIN created. You are signed in.' : `Welcome, ${res.user.name}!`, 'success');
                if (callback) callback();
            } catch (e) {
                this.loginError = e.message || 'Network error.';
            } finally {
                this.isLoggingIn = false;
            }
        },

        async logout() {
            try { await this.api('logout', {}, { auth: true }); } catch (e) { /* best effort */ }
            this.clearSession(false);
            await this.loadData({ silent: true });
            this.showToast('Signed out.', 'success');
        }
    }
};
