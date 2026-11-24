const { createApp } = Vue;

/* ---- Debug console (only shown when the page is opened with ?debug) ---- */
const originalLog = console.log;
const originalError = console.error;
let vueAppInstance = null;

function debugText(args) {
    return args.map(a => {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return a.message;
        try { return JSON.stringify(a); } catch (e) { return String(a); }
    }).join(' ');
}

console.log = function (...args) {
    if (vueAppInstance) vueAppInstance.addDebugLog('info', debugText(args));
    originalLog.apply(console, args);
};
console.error = function (...args) {
    if (vueAppInstance) vueAppInstance.addDebugLog('error', debugText(args));
    originalError.apply(console, args);
};
window.addEventListener('error', function (event) {
    if (vueAppInstance) vueAppInstance.addDebugLog('error', `${event.message} at ${event.filename}:${event.lineno}`);
});
window.addEventListener('unhandledrejection', function (event) {
    if (vueAppInstance) vueAppInstance.addDebugLog('error', 'Unhandled: ' + debugText([event.reason]));
});

const app = createApp({
    data() {
        return {
            activeTab: 'welcome',
            debugEnabled: new URLSearchParams(window.location.search).has('debug'),
            showDebug: false,
            debugLogs: [],
            ...notificationModule.data(),
            ...calendarModule.data(),
            ...leaveModule.data(),
            ...authModule.data()
        };
    },
    computed: {
        ...notificationModule.computed,
        ...calendarModule.computed,
        ...leaveModule.computed,
        ...authModule.computed
    },
    methods: {
        ...notificationModule.methods,
        ...apiModule.methods,
        ...calendarModule.methods,
        ...leaveModule.methods,
        ...authModule.methods,

        toggleDebug() { this.showDebug = !this.showDebug; },
        addDebugLog(type, message) {
            const time = new Date().toLocaleTimeString();
            this.debugLogs.push({ type, message, time });
            if (this.debugLogs.length > 300) this.debugLogs.splice(0, this.debugLogs.length - 300);
            setTimeout(() => {
                const el = document.getElementById('debugBody');
                if (el) el.scrollTop = el.scrollHeight;
            }, 50);
        },
        clearLogs() { this.debugLogs = []; },
        copyLogs() {
            const text = this.debugLogs.map(l => `[${l.time}] ${l.type.toUpperCase()}: ${l.message}`).join('\n');
            navigator.clipboard.writeText(text).then(() => this.showToast('Logs copied.', 'success'));
        }
    },
    watch: {
        activeTab(tab) {
            if (tab === 'myleave' && !this.isAuthenticated && this.initialized) {
                this.promptLogin('Sign in to see your leave.');
            }
            if (tab === 'calendar' && this.fcCalendar) {
                this.$nextTick(() => this.fcCalendar.updateSize());   // it was hidden while measuring
            }
        }
    },
    async mounted() {
        vueAppInstance = this;
        this.generateDays();
        await this.restoreSession();
        await this.loadData();

        // ?empId=EMP-001 only pre-selects that person in the sign-in box; it grants no access.
        const empId = new URLSearchParams(window.location.search).get('empId');
        if (empId && this.employees.some(e => e.id === empId)) {
            if (this.isAdmin) this.targetEmployeeId = empId;
            else if (!this.isAuthenticated) this.loginAs = empId;
            this.activeTab = 'myleave';
        }
    }
});
app.mount('#app');
