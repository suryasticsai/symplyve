/* ------------------------------------------------------------------
 * Shared date helpers. Everything works on 'YYYY-MM-DD' strings so
 * leaves that cross months or years are handled correctly.
 * ------------------------------------------------------------------ */
const dateUtil = {
    pad(n) { return String(n).padStart(2, '0'); },
    isISO(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); },
    todayISO() {
        const d = new Date();
        return `${d.getFullYear()}-${dateUtil.pad(d.getMonth() + 1)}-${dateUtil.pad(d.getDate())}`;
    },
    toUTC(s) {
        const [y, m, d] = s.split('-').map(Number);
        return Date.UTC(y, m - 1, d);
    },
    /** Inclusive number of days between two ISO dates. */
    days(a, b) { return Math.round((dateUtil.toUTC(b) - dateUtil.toUTC(a)) / 86400000) + 1; },
    addDays(s, n) {
        const t = new Date(dateUtil.toUTC(s) + n * 86400000);
        return `${t.getUTCFullYear()}-${dateUtil.pad(t.getUTCMonth() + 1)}-${dateUtil.pad(t.getUTCDate())}`;
    }
};

/* ------------------------------------------------------------------
 * API layer.
 *  - Public reads use GET.
 *  - Anything carrying a token or a PIN uses POST (JSON sent as text/plain,
 *    which avoids the CORS preflight that Apps Script cannot answer), so
 *    secrets never end up in URLs, browser history or server logs.
 * ------------------------------------------------------------------ */
const apiModule = {
    methods: {
        async api(action, params = {}, opts = {}) {
            const token = this.session ? this.session.token : null;
            const payload = { action, ...params };
            if (opts.auth && token) payload.token = token;
            const usePost = !!opts.post || (opts.auth && !!token);

            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), opts.timeout || 25000);

            try {
                let res;
                if (usePost) {
                    res = await fetch(CONFIG.API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify(payload),
                        signal: ctrl.signal
                    });
                } else {
                    res = await fetch(`${CONFIG.API_URL}?${new URLSearchParams(payload)}`, { signal: ctrl.signal });
                }

                const text = await res.text();
                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    throw new Error('The server sent an unexpected response. Make sure the latest Apps Script version is deployed with access set to "Anyone".');
                }

                if (data && !Array.isArray(data) && data.code === 'AUTH' && token) {
                    this.clearSession(true);
                }
                return data;
            } catch (e) {
                if (e.name === 'AbortError') throw new Error('The request timed out. Please try again.');
                if (e instanceof TypeError) throw new Error('Network error. Check your connection and try again.');
                throw e;
            } finally {
                clearTimeout(timer);
            }
        }
    }
};
