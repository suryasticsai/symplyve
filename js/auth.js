const authModule = {
    data() {
        return {
            isAuthenticated: false,
            isCreatingPin: false,
            loginPassword: '',
            confirmPin: '',
            loginError: '',
            isLoggingIn: false,
            loginModalObj: null,
            authToken: sessionStorage.getItem('symplyve_token') || null
        }
    },
    methods: {
        checkAuth() {
            if (this.isAdmin) {
                this.isAuthenticated = true;
                return;
            }
            if (this.authToken && sessionStorage.getItem(`auth_${this.targetEmployee.id}`) === 'true') {
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
            
            // --- CREATE PIN ---
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
                        // Auto login after creation
                        await this.login(this.targetEmployee.id, this.loginPassword);
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

            // --- LOGIN ---
            await this.login(this.targetEmployee.id, this.loginPassword);
        },

        async login(empId, password) {
            this.isLoggingIn = true;
            this.loginError = '';

            try {
                const res = await fetch(`${CONFIG.API_URL}?action=login&empId=${empId}&password=${encodeURIComponent(password)}`);
                const data = await res.json();

                if (data.success) {
                    this.authToken = data.token;
                    sessionStorage.setItem('symplyve_token', data.token);
                    sessionStorage.setItem(`auth_${empId}`, 'true');
                    
                    this.isAuthenticated = true;
                    this.loginModalObj.hide();
                    this.showToast("Profile unlocked!", "success");
                    
                    // Refresh data to get private comments
                    await this.loadData();
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
            sessionStorage.removeItem('symplyve_token');
            sessionStorage.removeItem(`auth_${this.targetEmployee.id}`);
            this.authToken = null;
            this.isAuthenticated = false;
            this.checkAuth();
        }
    }
};