/*
 * Ask the leave table.
 *
 * Questions are answered in two layers:
 *   1. Exact answers calculated in the browser from the leave table
 *      (who took the most leave, who is off on a date, one person's totals...).
 *      Language models are unreliable at counting, so anything that is arithmetic is done here.
 *   2. Everything else goes to the RAGina endpoint with a compact copy of the table.
 *
 * Only what the signed-in person can already see is used: names, leave type,
 * dates, status. Reasons and manager notes are never sent.
 */

const ASK_MONTHS = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
    june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
    october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12
};
const ASK_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ASK_MON = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)';
const ASK_STOP = new Set(('the a an of to in on at for and or is are was were be been do does did have has had we our you your i me my it its this that these those ' +
    'who whom what which when where why how many much any all with from by as about than then so if not no can could should would will shall tell show give list please ' +
    'there their they them he she his her leave leaves day days employee employees').split(' '));
const ASK_NOT_A_NAME = /\b(leave|leaves|pending|request|requests|sick|annual|casual|wfh|unpaid|anyone|everyone|anybody|people|employees|members|today|tomorrow|yesterday|week|month|year|balance|approval|approvals|policy|holiday|holidays)\b/;
const ASK_RE = {
    iso: /\b(\d{4})-(\d{2})-(\d{2})\b/,
    slash: /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/,
    mdy: new RegExp('\\b' + ASK_MON + '\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b'),
    dmy: new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + ASK_MON + '\\b\\.?(?:,?\\s+(\\d{4}))?'),
    monthOnly: new RegExp('\\b(?:in|of|during|for|on)\\s+' + ASK_MON + '\\b(?:\\s+(\\d{4}))?')
};

const insightsModule = {
    data() {
        return {
            askQuestion: '',
            askBusy: false,
            askHistory: [],
            askExamples: [
                'Who took the most leaves?',
                'Who is on leave today?',
                'Who took leave on Jan 31?',
                'Who has pending requests?',
                'How many sick days were taken this year?'
            ]
        };
    },
    methods: {
        useExample(q) { this.askQuestion = q; this.askSubmit(); },

        async askSubmit() {
            const q = this.askQuestion.trim();
            if (!q || this.askBusy) return;
            this.askBusy = true;
            this.askQuestion = '';
            this.askHistory.unshift({ id: Date.now() + Math.random(), q, a: '', table: null, source: '', error: false, pending: true });
            const entry = this.askHistory[0];                    // the reactive copy
            if (this.askHistory.length > 20) this.askHistory.pop();

            try {
                const local = this.answerLocally(q);
                if (local) {
                    Object.assign(entry, local, { source: 'table' });
                } else {
                    Object.assign(entry, { source: 'ai' }, await this.answerWithAI(q));
                }
            } catch (e) {
                entry.a = e.message || 'Something went wrong. Please try again.';
                entry.error = true;
            } finally {
                entry.pending = false;
                this.askBusy = false;
            }
        },

        /* ----------------------------- date helpers ----------------------------- */
        askFmt(iso) { return `${Number(iso.slice(8, 10))} ${ASK_MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`; },

        askValid(y, m, d) {
            const t = new Date(Date.UTC(y, m - 1, d));
            if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
            return `${y}-${dateUtil.pad(m)}-${dateUtil.pad(d)}`;
        },

        askMonthRange(y, m) {
            const last = new Date(y, m, 0).getDate();
            return { start: `${y}-${dateUtil.pad(m)}-01`, end: `${y}-${dateUtil.pad(m)}-${dateUtil.pad(last)}` };
        },

        /** Finds the period a question is about. Returns { start, end, label, assumedYear } or null. */
        askRange(text) {
            const today = dateUtil.todayISO();
            const thisYear = Number(today.slice(0, 4));
            let m, iso, assumed = false;

            if ((m = ASK_RE.iso.exec(text))) iso = this.askValid(+m[1], +m[2], +m[3]);
            else if ((m = ASK_RE.slash.exec(text))) iso = this.askValid(+m[3], +m[2], +m[1]);          // dd/mm/yyyy
            else if ((m = ASK_RE.mdy.exec(text))) {
                const y = m[3] ? +m[3] : (assumed = true, thisYear);
                iso = this.askValid(y, ASK_MONTHS[m[1]], +m[2]);
            } else if ((m = ASK_RE.dmy.exec(text))) {
                const y = m[3] ? +m[3] : (assumed = true, thisYear);
                iso = this.askValid(y, ASK_MONTHS[m[2]], +m[1]);
            }
            if (iso) return { start: iso, end: iso, label: this.askFmt(iso), assumedYear: assumed ? iso.slice(0, 4) : '' };

            if (/\btoday\b/.test(text)) return { start: today, end: today, label: 'today (' + this.askFmt(today) + ')' };
            if (/\btomorrow\b/.test(text)) { const d = dateUtil.addDays(today, 1); return { start: d, end: d, label: 'tomorrow (' + this.askFmt(d) + ')' }; }
            if (/\byesterday\b/.test(text)) { const d = dateUtil.addDays(today, -1); return { start: d, end: d, label: 'yesterday (' + this.askFmt(d) + ')' }; }

            if (/\bthis week\b/.test(text) || /\bnext week\b/.test(text) || /\blast week\b/.test(text)) {
                const shift = /next week/.test(text) ? 7 : /last week/.test(text) ? -7 : 0;
                const dow = new Date(dateUtil.toUTC(today)).getUTCDay();
                const start = dateUtil.addDays(today, -((dow + 6) % 7) + shift);
                const end = dateUtil.addDays(start, 6);
                return { start, end, label: `${this.askFmt(start)} to ${this.askFmt(end)}` };
            }

            const cur = Number(today.slice(5, 7));
            const rel = /\bthis month\b/.test(text) ? 0 : /\bnext month\b/.test(text) ? 1 : /\blast month\b/.test(text) ? -1 : null;
            if (rel !== null) {
                const t = new Date(thisYear, cur - 1 + rel, 1);
                const r = this.askMonthRange(t.getFullYear(), t.getMonth() + 1);
                return { ...r, label: `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][t.getMonth()]} ${t.getFullYear()}` };
            }

            if ((m = ASK_RE.monthOnly.exec(text))) {
                const y = m[2] ? +m[2] : (assumed = true, thisYear);
                const r = this.askMonthRange(y, ASK_MONTHS[m[1]]);
                return { ...r, label: `${ASK_MONTH_NAMES[ASK_MONTHS[m[1]] - 1]} ${y}`, assumedYear: assumed ? String(y) : '' };
            }

            if (/\bthis year\b/.test(text)) return { start: `${thisYear}-01-01`, end: `${thisYear}-12-31`, label: String(thisYear) };
            if (/\blast year\b/.test(text)) return { start: `${thisYear - 1}-01-01`, end: `${thisYear - 1}-12-31`, label: String(thisYear - 1) };
            if ((m = /\b(20\d{2})\b/.exec(text))) return { start: `${m[1]}-01-01`, end: `${m[1]}-12-31`, label: m[1] };
            return null;
        },

        /* ------------------------------ team lookups ------------------------------ */
        askLev(a, b) {
            const m = a.length, n = b.length;
            if (!m) return n;
            if (!n) return m;
            let prev = Array.from({ length: n + 1 }, (_, j) => j);
            for (let i = 1; i <= m; i++) {
                const cur = [i];
                for (let j = 1; j <= n; j++) {
                    cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
                }
                prev = cur;
            }
            return prev[n];
        },

        /** People whose name matches a typed name: exact, starts-with, or a close spelling. */
        askFindPeople(term) {
            const t = term.toLowerCase().replace(/[^a-z .'-]/g, '').trim();
            if (!t) return { exact: [], close: [] };
            const exact = this.employees.filter(e => {
                const n = e.name.toLowerCase();
                if (/\s/.test(t)) return n.includes(t);                         // "prashant kumar"
                return n.split(/\s+/).some(w => w === t || (t.length >= 3 && w.startsWith(t)));   // from the start of a word only
            });
            if (exact.length) return { exact, close: [] };
            const close = this.employees
                .map(e => {
                    const best = Math.min(...e.name.toLowerCase().split(/\s+/).map(w => this.askLev(w, t.split(/\s+/)[0])));
                    return { e, d: best };
                })
                .filter(x => x.d <= (t.length >= 8 ? 3 : 2))
                .sort((a, b) => a.d - b.d)
                .map(x => x.e);
            return { exact: [], close };
        },

        askTeamLookup(text) {
            // roster questions
            if (/\bhow many (people|members|employees|persons)\b.*\b(team|company|org|have|are there)\b|\bteam size\b|\b(list|show)\b.*\b(team|employees|members|roster)\b|\bwho (is|are) (in|on) (the|our) team\b|\bteam members\b/.test(text)) {
                return {
                    a: `There ${this.employees.length === 1 ? 'is 1 person' : 'are ' + this.employees.length + ' people'} in the team.`,
                    table: { cols: ['ID', 'Name', 'Role', 'Department'], rows: this.employees.slice(0, 100).map(e => [e.id, e.name, e.role || '-', e.department || '-']) }
                };
            }

            // "do we have X in the team", "is X in the team", "is there a X"
            let m = /\b(?:do we have|have we got|is there|are there|is|do we know|does the team have)\s+(?:an?\s+|any\s+|anyone\s+(?:named|called)\s+|someone\s+(?:named|called)\s+)?([a-z][a-z .'-]{1,40}?)\s*(?:in|on|within|part of)?\s*(?:the |our |this |my )?(?:team|company|org|organisation|organization|roster|list|directory)\b/.exec(text);
            if (!m) m = /^(?:do we have|have we got|is there|are there)\s+(?:an?\s+|any\s+)?([a-z][a-z .'-]{1,40})$/.exec(text);
            if (!m) return null;

            const term = m[1].trim();
            if (ASK_NOT_A_NAME.test(term) || ASK_STOP.has(term)) return null;

            const { exact, close } = this.askFindPeople(term);
            const shown = term.replace(/\b\w/g, c => c.toUpperCase());
            if (exact.length) {
                return {
                    a: exact.length === 1
                        ? `Yes. ${exact[0].name} (${exact[0].id}) is in the team${exact[0].role ? ' as ' + exact[0].role : ''}${exact[0].department ? ', ' + exact[0].department : ''}.`
                        : `Yes. ${exact.length} people match "${shown}": ${exact.map(e => e.name).join(', ')}.`,
                    table: { cols: ['ID', 'Name', 'Role', 'Department'], rows: exact.map(e => [e.id, e.name, e.role || '-', e.department || '-']) }
                };
            }
            if (close.length) {
                return {
                    a: `No one named "${shown}" is in the team. Did you mean ${close.slice(0, 3).map(e => e.name).join(' or ')}?`,
                    table: null
                };
            }
            return { a: `No. There is nobody named "${shown}" in the team table (${this.employees.length} people).`, table: null };
        },

        /** ' on 31 Jan 2026', ' in March 2026', ' today (25 Nov 2026)' */
        askWhen(r) {
            if (!r) return '';
            if (/^(today|tomorrow|yesterday)/.test(r.label)) return ' ' + r.label;
            return (r.start === r.end ? ' on ' : ' in ') + r.label;
        },

        askOverlap(l, r) {
            if (!r) return l.days;
            const s = l.startDate > r.start ? l.startDate : r.start;
            const e = l.endDate < r.end ? l.endDate : r.end;
            return e < s ? 0 : dateUtil.days(s, e);
        },

        /* ------------------------- exact answers from the table ------------------------- */
        answerLocally(question) {
            const text = question.toLowerCase().replace(/[?!]+$/g, '').trim();
            const wants = re => re.test(text);

            // 0) Team lookups: "Do we have Prashant in the team?", "How many people are in the team?"
            const lookup = this.askTeamLookup(text);
            if (lookup) return lookup;

            // Which statuses count. Default: approved leave only.
            let statuses = ['Approved'], explicit = false;
            if (wants(/\bincluding pending\b|\bpending and approved\b|\bapproved and pending\b|\bwith pending\b|\ball requests\b|\bevery request\b/)) { statuses = ['Approved', 'Pending']; explicit = true; }
            else if (wants(/\bpending\b|\bawaiting\b|\bwaiting for approval\b/)) { statuses = ['Pending']; explicit = true; }
            else if (wants(/\brejected\b|\bdeclined\b/)) { statuses = ['Rejected']; explicit = true; }
            const statusWord = statuses.length === 2 ? 'approved or pending' : statuses[0].toLowerCase();

            // Leave type filter
            let typeKey = '';
            if (wants(/\bsick\b/)) typeKey = 'sick';
            else if (wants(/\bannual\b|\bvacation\b|\bearned\b/)) typeKey = 'annual';
            else if (wants(/\bcasual\b/)) typeKey = 'casual';
            else if (wants(/\bwfh\b|work from home|\bremote\b/)) typeKey = 'wfh';
            else if (wants(/\bunpaid\b/)) typeKey = 'unpaid';
            const typeWord = typeKey ? ` ${LEAVE_TYPES[typeKey].label.toLowerCase()}` : '';

            const range = this.askRange(text);
            const pool = this.leaves.filter(l =>
                statuses.includes(l.status) && (!typeKey || l.typeKey === typeKey) && this.askOverlap(l, range) > 0);
            const when = this.askWhen(range);
            const assumed = range && range.assumedYear ? ` (I assumed ${range.assumedYear} because no year was given.)` : '';

            // Is the question about one named person?
            const full = this.employees.filter(e => text.includes(e.name.toLowerCase()));
            let people = full;
            if (!people.length) {
                people = this.employees.filter(e => {
                    const first = e.name.split(' ')[0].toLowerCase();
                    return first.length > 2 && new RegExp('\\b' + first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(text);
                });
            }
            if (people.length > 1 && !full.length) {
                return { a: `More than one person matches: ${people.map(p => p.name).join(', ')}. Please use the full name.`, table: null };
            }
            const person = people.length === 1 ? people[0] : (full.length === 1 ? full[0] : null);

            // 1) Who took the most / least leave
            const asc = wants(/\b(least|fewest|lowest|minimum|less)\b/);
            if (!person && wants(/\bwho\b/) && wants(/\b(most|more|highest|maximum|max|top|longest|least|fewest|lowest|minimum|less)\b/) &&
                wants(/leave|days|\boff\b|absent|holiday|time off|wfh/)) {
                const totals = this.employees.map(e => {
                    const mine = pool.filter(l => l.empId === e.id);
                    return { name: e.name, days: mine.reduce((s, l) => s + this.askOverlap(l, range), 0), requests: mine.length };
                });
                const sorted = [...totals].sort((a, b) => asc ? a.days - b.days : b.days - a.days);
                if (!sorted.length) return { a: 'There are no employees in the table yet.', table: null };
                const best = sorted[0].days;
                const leaders = sorted.filter(t => t.days === best);
                let a;
                if (!asc && best === 0) {
                    a = `Nobody has taken${typeWord} leave${when} (${statusWord}).`;
                } else {
                    const names = leaders.length > 5 ? leaders.slice(0, 5).map(t => t.name).join(', ') + ` and ${leaders.length - 5} more` : leaders.map(t => t.name).join(' and ');
                    a = asc
                        ? (best === 0 ? `${leaders.length} ${leaders.length === 1 ? 'person has' : 'people have'} taken no${typeWord} leave${when} (${statusWord}): ${names}.`
                            : `${names} took the least${typeWord} leave${when}: ${best} day(s) (${statusWord}).`)
                        : `${names} ${leaders.length > 1 ? 'are tied for the most' : 'took the most'}${typeWord} leave${when}: ${best} day(s) (${statusWord}).`;
                }
                return {
                    a: a + assumed,
                    table: { cols: ['Employee', 'Days', 'Requests'], rows: sorted.slice(0, 10).map(t => [t.name, t.days, t.requests]) }
                };
            }

            // 2) One person's summary
            if (person && wants(/how many|total|count|days|taken|take|took|used|balance|left|remaining|leave|leaves|history|summary|holiday|off/)) {
                const mine = pool.filter(l => l.empId === person.id).sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
                const days = mine.reduce((s, l) => s + this.askOverlap(l, range), 0);
                if (!mine.length) return { a: `${person.name} has no ${statusWord}${typeWord} leave${when}.${assumed}`, table: null };
                const byType = {};
                mine.forEach(l => { byType[l.label] = (byType[l.label] || 0) + this.askOverlap(l, range); });
                let a = `${person.name} has ${days} ${statusWord}${typeWord} day(s) of leave${when} across ${mine.length} request(s): ` +
                    Object.keys(byType).map(k => `${k} ${byType[k]}`).join(', ') + '.';
                const thisYear = String(new Date().getFullYear());
                if (!typeKey && (!range || (range.start.slice(0, 4) === thisYear && range.end.slice(0, 4) === thisYear && range.start.slice(5) === '01-01'))) {
                    a += ` Annual leave left this year: ${this.allowanceOf(person) - this.calculateUsed(person)} of ${this.allowanceOf(person)}.`;
                }
                return {
                    a: a + assumed,
                    table: { cols: ['Type', 'Dates', 'Days', 'Status'], rows: mine.slice(0, 50).map(l => [l.label, `${l.startDate} to ${l.endDate}`, this.askOverlap(l, range), l.status]) }
                };
            }

            // 3) Who is on leave in a period / who has pending requests / who took a type of leave
            if (!person && (range || explicit || typeKey) &&
                wants(/\bwho\b|\bwhich\b|anyone|anybody|everyone|\blist\b|\bshow\b|how many|\bcount\b|\bout\b|\boff\b|on leave|absent|do we have|are there|is there/)) {
                const items = [...pool].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
                const names = [...new Set(items.map(l => l.emp))];
                if (!items.length) return { a: `Nobody has ${statusWord}${typeWord} leave${when || ' recorded'}.${assumed}`, table: null };

                let a;
                if (range && range.start === range.end) {
                    a = `${names.length} ${names.length === 1 ? 'person has' : 'people have'} ${statusWord}${typeWord} leave${when}: ` +
                        names.map(n => { const l = items.find(x => x.emp === n); return `${n} (${l.label})`; }).join(', ') + '.';
                } else {
                    a = `${names.length} ${names.length === 1 ? 'person has' : 'people have'} ${statusWord}${typeWord} leave${when}: ${names.join(', ')}.`;
                }
                if (items.length > 50) a += ' Showing the first 50 records.';
                return {
                    a: a + assumed,
                    table: { cols: ['Employee', 'Type', 'Dates', 'Days', 'Status'], rows: items.slice(0, 50).map(l => [l.emp, l.label, `${l.startDate} to ${l.endDate}`, this.askOverlap(l, range), l.status]) }
                };
            }

            return null;   // not something the table can answer exactly: hand over to the AI
        },

        /* ------------------- RAG: retrieve the relevant records, then ask the AI ------------------- */

        /** One chunk per employee (profile + their leave), plus one team summary chunk. */
        askChunks() {
            const today = dateUtil.todayISO();
            const chunks = this.employees.map(e => {
                const mine = this.leaves.filter(l => l.empId === e.id && l.status !== 'Rejected')
                    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
                const used = this.calculateUsed(e);
                const head = `Employee ${e.name} (${e.id}), ${e.role || 'no role'}, ${e.department || 'no department'}. ` +
                    `Annual allowance ${this.allowanceOf(e)} days, used ${used}, left ${this.allowanceOf(e) - used}.`;
                const lines = mine.map(l => `- ${l.label} leave ${l.startDate} to ${l.endDate} (${l.days} day${l.days === 1 ? '' : 's'}, ${l.status})`);
                return { emp: e, rows: mine, text: [head, ...(lines.length ? lines : ['- no leave recorded'])].join('\n') };
            });

            const byType = {};
            this.leaves.filter(l => l.status === 'Approved').forEach(l => { byType[l.label] = (byType[l.label] || 0) + l.days; });
            const pending = this.leaves.filter(l => l.status === 'Pending');
            chunks.push({
                emp: null, rows: [],
                text: [
                    `Team summary as of ${today}: ${this.employees.length} people.`,
                    `Out today: ${this.outTodayList.length ? this.outTodayList.map(o => `${o.name} (${o.type})`).join(', ') : 'nobody'}.`,
                    `Pending requests: ${pending.length ? pending.map(l => `${l.emp} ${l.startDate} to ${l.endDate}`).join('; ') : 'none'}.`,
                    `Approved days by type: ${Object.keys(byType).length ? Object.keys(byType).map(k => `${k} ${byType[k]}`).join(', ') : 'none'}.`
                ].join('\n')
            });
            return chunks;
        },

        askTokens(s) {
            return (String(s).toLowerCase().match(/[a-z0-9]+/g) || []).filter(t => t.length > 1 && !ASK_STOP.has(t));
        },

        /** TF-IDF style scoring, with boosts for names and for records that overlap a date in the question. */
        askRetrieve(question, k = 6) {
            const chunks = this.askChunks().filter(c => c.emp);        // the summary chunk is always included separately
            const q = this.askTokens(question);
            const range = this.askRange(question.toLowerCase());
            const docs = chunks.map(c => this.askTokens(c.text));
            const df = {};
            docs.forEach(d => new Set(d).forEach(t => { df[t] = (df[t] || 0) + 1; }));
            const N = chunks.length || 1;

            const scored = chunks.map((c, i) => {
                let score = 0;
                const tf = {};
                docs[i].forEach(t => { tf[t] = (tf[t] || 0) + 1; });
                q.forEach(t => { if (tf[t]) score += (1 + Math.log(tf[t])) * Math.log(1 + N / (1 + (df[t] || 0))); });
                const nameTokens = this.askTokens(c.emp.name);
                q.forEach(t => { if (nameTokens.includes(t) || nameTokens.some(n => n.startsWith(t) && t.length >= 3)) score += 6; });
                if (range) score += 3 * c.rows.filter(l => this.askOverlap(l, range) > 0).length;
                return { c, score };
            });
            return scored.filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k).map(x => x.c);
        },

        askPrompt(question, retrieved) {
            const roster = this.employees.slice(0, 200).map(e => `${e.name} (${e.id}${e.role ? ', ' + e.role : ''})`).join('; ');
            const named = retrieved.length > 0;
            let table = '';
            if (!named && this.leaves.length <= 200) {
                table = '\n\nAll leave records (Employee,Type,Start,End,Days,Status):\n' + this.leaves
                    .filter(l => l.status !== 'Rejected')
                    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
                    .map(l => [l.emp, l.label, l.startDate, l.endDate, l.days, l.status].join(',')).join('\n');
            }
            const team = this.askChunks().pop().text;
            const context = `Today is ${dateUtil.todayISO()}.\n\nTEAM ROSTER (${this.employees.length} people): ${roster}\n\n${team}` +
                (named ? '\n\nMOST RELEVANT RECORDS:\n' + retrieved.map(c => c.text).join('\n\n') : '') + table;

            return 'You are the assistant for a team leave-management app. Answer the question using ONLY the context below. ' +
                'If the answer is not in the context, say you cannot tell from the data. Count carefully, quote exact dates and names, and keep the answer short.\n\n' +
                'CONTEXT:\n' + context + '\n\nQUESTION: ' + question;
        },

        askCleanText(t) {
            return String(t == null ? '' : t)
                .replace(/^﻿/, '')
                .replace(/�/g, '')
                .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
                .trim();
        },

        /** POST { prompt } → { text }. Retries once; rejects garbled or empty replies. */
        async askCallAI(prompt) {
            const url = (typeof CONFIG !== 'undefined' && CONFIG.AI_URL) || 'https://ragina-crawler-ragina.vercel.app/api/ask';
            let lastError;
            for (let attempt = 1; attempt <= 2; attempt++) {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), 40000);
                try {
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt }),
                        signal: ctrl.signal
                    });
                    const raw = await res.text();
                    if (!res.ok) {
                        let msg = raw.slice(0, 200);
                        try { const j = JSON.parse(raw); msg = j.error || j.message || msg; } catch (e) { /* not JSON */ }
                        throw new Error(msg || `HTTP ${res.status}`);
                    }

                    let data = raw;
                    try { data = JSON.parse(raw.replace(/^﻿/, '')); } catch (e) { /* plain text */ }
                    if (data && typeof data === 'object' && data.error && !data.text) throw new Error(data.error);
                    const text = typeof data === 'string' ? data : (data.text ?? data.answer ?? data.response ?? data.result ?? data.message ?? '');

                    const str = String(text);
                    const junk = (str.match(/[�\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g) || []).length;
                    const clean = this.askCleanText(str);
                    if (clean.length < 2 || junk / (str.length || 1) > 0.3) throw new Error('the AI returned an unreadable reply');
                    return clean;
                } catch (e) {
                    lastError = e.name === 'AbortError' ? new Error('the AI took too long to answer') :
                        (e && e.name === 'TypeError' ? new Error('could not reach the AI service (network or CORS)') : e);
                    if (attempt < 2) await new Promise(r => setTimeout(r, 800));
                } finally {
                    clearTimeout(timer);
                }
            }
            throw lastError;
        },

        async answerWithAI(question) {
            const retrieved = this.askRetrieve(question);
            const prompt = this.askPrompt(question, retrieved);
            try {
                const text = await this.askCallAI(prompt);
                return { a: text, table: null, sources: retrieved.map(c => c.emp.name) };
            } catch (e) {
                // Graceful degradation: still show what retrieval found.
                const rows = [];
                retrieved.forEach(c => c.rows.forEach(l => rows.push([c.emp.name, l.label, `${l.startDate} to ${l.endDate}`, l.days, l.status])));
                if (!rows.length && retrieved.length) {
                    return {
                        a: `The AI service did not answer (${e.message}). From the table:\n\n` + retrieved.slice(0, 3).map(c => c.text).join('\n\n'),
                        table: null,
                        source: 'fallback'
                    };
                }
                if (!rows.length) throw new Error(`The AI service did not answer (${e.message}). Try again in a moment.`);
                return {
                    a: `The AI service did not answer (${e.message}). Here are the closest records from the table instead.`,
                    table: { cols: ['Employee', 'Type', 'Dates', 'Days', 'Status'], rows: rows.slice(0, 30) },
                    source: 'fallback'
                };
            }
        }
    }
};
