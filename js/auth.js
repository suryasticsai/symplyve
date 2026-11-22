const authModule = {
    data() {
        return {
            isAuthenticated: false,
            isCreatingPin: false,
            loginPassword: '',
            confirmPin: '',
            loginError: '',
            isLoggingIn: false,
            loginModalObj: null
        }
    },
    methods: {
        checkAuth() {
            if (this.isAdmin) {
                this.isAuthenticated = true;
                return;
            }

            const sessionKey = `auth_${this.targetEmployee.id}`;
            if (sessionStorage.getItem(sessionKey) === 'true') {
                this.isAuthenticated = true;
                return;
            }

            this.isAuthenticated = false;
            this.isCreatingPin = !this.targetEmployee.hasPassword; 
            this.loginPassword = '';
            this.confirmPin = '';
            this.loginError = '';
            
            if (!this.loginModalObj) {
                this.loginModalObj = new bootstrap.Modal(document.getElementById('loginModal'));
            }
            this.loginModalObj.show();
        },

        async attemptLogin() {
            if (!this.loginPassword) return;
            
            if (this.isCreatingPin) {
                if (this.loginPassword !== this.confirmPin) {
                    this.loginError = "PINs do not match.";
                    return;
                }
                if (this.loginPassword.length < 4) {
                    this.loginError = "PIN must be at least 4 digits.";
                    return;
                }
                
                this.isLoggingIn = true;
                try {
                    const res = await fetch(`${CONFIG.API_URL}?action=setPassword&empId=${this.targetEmployee.id}&password=${this.loginPassword}`);
                    const data = await res.json();
                    
                    if (data.success) {
                        this.targetEmployee.hasPassword = true; 
                        this.isAuthenticated = true;
                        sessionStorage.setItem(`auth_${this.targetEmployee.id}`, 'true');
                        this.loginModalObj.hide();
                        this.showToast("PIN created successfully!", "success");
                    } else {
                        this.loginError = data.error;
                    }
                } catch(e) {
                    this.loginError = "Network error.";
                } finally {
                    this.isLoggingIn = false;
                }
                return;
            }

            this.isLoggingIn = true;
            this.loginError = '';

            try {
                const res = await fetch(`${CONFIG.API_URL}?action=login&empId=${this.targetEmployee.id}&password=${encodeURIComponent(this.loginPassword)}`);
                const data = await res.json();

                if (data.success) {
                    this.isAuthenticated = true;
                    sessionStorage.setItem(`auth_${this.targetEmployee.id}`, 'true');
                    this.loginModalObj.hide();
                    this.showToast("Profile unlocked!", "success");
                } else {
                    this.loginError = data.error || "Invalid PIN.";
                }
            } catch (e) {
                this.loginError = "Network error.";
            } finally {
                this.isLoggingIn = false;
            }
        },
        
        logout() {
            sessionStorage.removeItem(`auth_${this.targetEmployee.id}`);
            this.isAuthenticated = false;
            this.checkAuth();
        }
    }
};