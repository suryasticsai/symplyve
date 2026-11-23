const { createApp } = Vue;

const originalLog = console.log;
const originalError = console.error;
let vueAppInstance = null;

console.log = function(...args) {
    if (vueAppInstance) vueAppInstance.addDebugLog('info', args.join(' '));
    originalLog.apply(console, args);
};

console.error = function(...args) {
    if (vueAppInstance) vueAppInstance.addDebugLog('error', args.join(' '));
    originalError.apply(console, args);
};

window.addEventListener('error', function(event) {
    if (vueAppInstance) vueAppInstance.addDebugLog('error', `${event.message} at ${event.filename}:${event.lineno}`);
});

const app = createApp({
    data() {
        return {
            activeTab: 'welcome',
            showDebug: false,
            debugLogs: [],
            ...notificationModule.data(),
            ...calendarModule.data(),
            ...leaveModule.data(),
            ...authModule.data(),
        }
    },
    computed: {
        ...notificationModule.computed,
        ...calendarModule.computed,
        ...leaveModule.computed
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
            setTimeout(() => {
                const el = document.getElementById('debugBody');
                if (el) el.scrollTop = el.scrollHeight;
            }, 50);
        },
        clearLogs() { this.debugLogs = []; },
        copyLogs() {
            const text = this.debugLogs.map(l => `[${l.time}] ${l.type.toUpperCase()}: ${l.message}`).join('\n');
            navigator.clipboard.writeText(text).then(() => alert("Logs copied!"));
        }
    },
    watch: {
        activeTab(newVal) {
            if (newVal === 'myleave') {
                this.checkAuth();
            }
        }
    },
    mounted() {
        vueAppInstance = this;
        this.addDebugLog('info', 'App mounted.');
        this.generateDays();
        this.loadData().then(() => {
            if (this.activeTab === 'myleave') this.checkAuth();
        });
    }
});
app.mount('#app');