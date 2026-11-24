const LEAVE_TYPES = {
    annual:  { class: 'bg-annual',  fcClass: 'evt-annual',  label: 'Annual' },
    sick:    { class: 'bg-sick',    fcClass: 'evt-sick',    label: 'Sick' },
    casual:  { class: 'bg-casual',  fcClass: 'evt-casual',  label: 'Casual' },
    unpaid:  { class: 'bg-unpaid',  fcClass: 'evt-unpaid',  label: 'Unpaid' },
    wfh:     { class: 'bg-wfh',     fcClass: 'evt-wfh',     label: 'WFH' }
};

/** 'Annual Leave' -> 'annual', 'Work From Home' -> 'wfh'; matches the server. */
function canonLeaveType(v) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    if (s.startsWith('annual')) return 'annual';
    if (s.startsWith('sick')) return 'sick';
    if (s.startsWith('casual')) return 'casual';
    if (s.startsWith('work') || s === 'wfh') return 'wfh';
    if (s.startsWith('unpaid')) return 'unpaid';
    return s.split(' ')[0];
}

const calendarModule = {
    data() {
        return {
            employees: [],
            days: [],
            leaves: [],
            isLoading: true,          // skeleton: first load only
            isRefreshing: false,      // later reloads keep the screen (and the calendar) intact
            initialized: false,
            fetchError: '',
            searchQuery: '',
            reportSearch: '',

            currentView: 'calendar',
            fcCalendar: null,
            balanceChart: null,

            months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
            selectedMonth: new Date().getMonth(),
            selectedYear: new Date().getFullYear()
        };
    },
    computed: {
        yearOptions() {
            const y = new Date().getFullYear();
            return [y - 1, y, y + 1];
        },
        monthBounds() {
            const y = Number(this.selectedYear), m = Number(this.selectedMonth);
            const last = new Date(y, m + 1, 0).getDate();
            const p = dateUtil.pad;
            return { first: `${y}-${p(m + 1)}-01`, last: `${y}-${p(m + 1)}-${p(last)}` };
        },
        filteredEmployees() {
            if (!this.searchQuery) return this.employees;
            const q = this.searchQuery.toLowerCase();
            return this.employees.filter(e =>
                e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
        },
        outTodayList() {
            const today = dateUtil.todayISO();
            const out = [];
            this.employees.forEach(emp => {
                const l = this.leaves.find(x =>
                    x.empId === emp.id && x.status === 'Approved' && x.startDate <= today && today <= x.endDate);
                if (l) out.push({ id: emp.id, name: emp.name, type: l.label, employee: emp });
            });
            return out;
        },
        outTodayCount() { return this.outTodayList.length; },
        pendingRequests() {
            return this.leaves
                .filter(l => l.status === 'Pending')
                .map(l => ({
                    id: l.id,
                    emp: l.emp,
                    label: l.label,
                    dates: `${l.startDate} to ${l.endDate}`,
                    days: l.days,
                    reason: l.reason
                }));
        },
        pendingApprovalsCount() { return this.pendingRequests.length; },
        utilization() {
            const year = String(new Date().getFullYear());
            const total = this.employees.reduce((s, e) => s + this.allowanceOf(e), 0);
            if (!total) return 0;
            const used = this.leaves
                .filter(l => l.typeKey === 'annual' && l.status === 'Approved' && l.startDate.slice(0, 4) === year)
                .reduce((s, l) => s + l.days, 0);
            return Math.min(100, Math.round((used / total) * 100));
        },
        filteredReports() {
            let list = this.leaves;
            if (this.reportSearch) {
                const q = this.reportSearch.toLowerCase();
                list = list.filter(l =>
                    l.emp.toLowerCase().includes(q) || l.label.toLowerCase().includes(q) || l.status.toLowerCase().includes(q));
            }
            return [...list].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
        }
    },
    methods: {
        async loadData(opts = {}) {
            const silent = !!opts.silent && this.initialized;
            if (silent) this.isRefreshing = true; else this.isLoading = true;
            this.fetchError = '';

            try {
                const [emps, lvs] = await Promise.all([
                    this.api('getEmployees', {}, { auth: true }),
                    this.api('getLeaves', {}, { auth: true })
                ]);

                // Saved session was rejected by the server: it has been cleared, so retry once as a visitor.
                if (!opts._retried && [emps, lvs].some(r => r && !Array.isArray(r) && r.code === 'AUTH')) {
                    return await this.loadData({ ...opts, _retried: true });
                }
                if (!Array.isArray(emps)) throw new Error((emps && emps.error) || 'Could not load employees.');
                if (!Array.isArray(lvs)) throw new Error((lvs && lvs.error) || 'Could not load leave data.');

                this.employees = emps.filter(e => e && e.ID).map(e => ({
                    id: String(e.ID),
                    name: String(e.Name || ''),
                    role: e.Role || '',
                    department: e.Department || '',
                    email: e.Email || '',
                    totalAllowance: e.TotalAllowance,
                    usedAllowance: e.UsedAllowance,
                    hasPassword: !!e.hasPassword
                }));

                this.leaves = lvs.map(row => {
                    const startDate = String(row.StartDate || '').slice(0, 10);
                    const endDate = String(row.EndDate || '').slice(0, 10);
                    if (!dateUtil.isISO(startDate) || !dateUtil.isISO(endDate) || endDate < startDate) return null;

                    const key = canonLeaveType(row.Type);
                    const raw = String(row.Type || 'Leave');
                    const info = LEAVE_TYPES[key] ||
                        { class: 'bg-annual', fcClass: 'evt-annual', label: raw.charAt(0).toUpperCase() + raw.slice(1) };

                    return {
                        id: String(row.ID),
                        empId: String(row.EmployeeID),
                        emp: String(row.EmployeeName || ''),
                        startDate, endDate,
                        days: dateUtil.days(startDate, endDate),
                        typeKey: key,
                        typeClass: info.class,
                        fcClass: info.fcClass,
                        label: info.label,
                        status: String(row.Status || 'Pending'),
                        reason: row.Reason || '',
                        adminComment: row.AdminComment || ''
                    };
                }).filter(Boolean);

                // Whose "My Leave" page is shown
                if (!this.session) {
                    this.targetEmployeeId = '';
                } else if (!this.isAdmin) {
                    this.targetEmployeeId = this.session.user.id;
                } else if (!this.employees.some(e => e.id === this.targetEmployeeId)) {
                    this.targetEmployeeId = this.employees.length ? this.employees[0].id : '';
                }

                this.generateDays();
                this.initialized = true;
                this.$nextTick(() => {
                    this.renderFullCalendar();
                    this.renderChart();
                });
            } catch (error) {
                console.error('Load error: ' + error.message);
                this.fetchError = error.message || 'Could not load data.';
            } finally {
                this.isLoading = false;
                this.isRefreshing = false;
            }
        },

        generateDays() {
            const year = Number(this.selectedYear);
            const month = Number(this.selectedMonth);
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
            const today = new Date();

            this.days = [];
            for (let i = 1; i <= daysInMonth; i++) {
                const dow = new Date(year, month, i).getDay();
                this.days.push({
                    date: i,
                    dayName: dayNames[dow],
                    isWeekend: dow === 0 || dow === 6,
                    isToday: i === today.getDate() && month === today.getMonth() && year === today.getFullYear()
                });
            }
        },

        /** Gantt bars for one employee, clipped to the month being shown. */
        barsForEmp(emp) {
            const b = this.monthBounds;
            const total = this.days.length || 1;
            return this.leaves
                .filter(l => l.empId === emp.id && l.status !== 'Rejected' && l.startDate <= b.last && l.endDate >= b.first)
                .map(l => {
                    const s = l.startDate > b.first ? l.startDate : b.first;
                    const e = l.endDate < b.last ? l.endDate : b.last;
                    const startIdx = Number(s.slice(8, 10)) - 1;
                    const len = Number(e.slice(8, 10)) - startIdx;
                    const pending = l.status === 'Pending';
                    return {
                        id: l.id,
                        label: l.label + (pending ? ' · pending' : ''),
                        typeClass: l.typeClass,
                        style: {
                            left: `calc(220px + (100% - 220px) * ${startIdx / total})`,
                            width: `calc((100% - 220px) * ${len / total} - 4px)`,
                            opacity: pending ? 0.65 : 1
                        }
                    };
                });
        },

        renderFullCalendar() {
            const el = this.$refs.calendarEl;
            if (!el || typeof FullCalendar === 'undefined') return;

            try {
                const events = this.leaves
                    .filter(l => l.status !== 'Rejected')
                    .map(l => ({
                        title: `${l.emp.split(' ')[0]} · ${l.label}${l.status === 'Pending' ? ' (pending)' : ''}`,
                        start: l.startDate,
                        end: dateUtil.addDays(l.endDate, 1),        // FullCalendar's end date is exclusive
                        classNames: [l.fcClass, l.status === 'Pending' ? 'evt-pending' : '']
                    }));

                if (this.fcCalendar) {
                    this.fcCalendar.removeAllEventSources();
                    this.fcCalendar.addEventSource(events);
                    return;
                }

                const cal = new FullCalendar.Calendar(el, {
                    initialView: 'dayGridMonth',
                    initialDate: `${this.selectedYear}-${dateUtil.pad(Number(this.selectedMonth) + 1)}-01`,
                    headerToolbar: { left: 'prev,next', center: 'title', right: '' },
                    height: 'auto',
                    events: events,
                    dayMaxEvents: 3,
                    dateClick: (info) => {
                        this.openLeaveModal({ startDate: info.dateStr, endDate: info.dateStr });
                    },
                    datesSet: (info) => {
                        // Keep the month/year pickers (and the Gantt view) in step with prev/next.
                        const mid = info.view.currentStart;
                        if (mid.getMonth() !== Number(this.selectedMonth) || mid.getFullYear() !== Number(this.selectedYear)) {
                            this.selectedMonth = mid.getMonth();
                            this.selectedYear = mid.getFullYear();
                            this.generateDays();
                        }
                    }
                });
                cal.render();
                this.fcCalendar = Vue.markRaw(cal);   // keep FullCalendar out of Vue's reactivity
            } catch (error) {
                console.error('Calendar error: ' + error.message);
            }
        },

        switchView(view) {
            this.currentView = view;
            if (view === 'calendar' && this.fcCalendar) {
                setTimeout(() => this.fcCalendar.updateSize(), 50);
            }
        },

        updateCalendarDate() {
            this.generateDays();
            if (this.fcCalendar) {
                this.fcCalendar.gotoDate(`${this.selectedYear}-${dateUtil.pad(Number(this.selectedMonth) + 1)}-01`);
            }
        },

        renderChart() {
            const el = this.$refs.chartEl;
            if (!el || typeof Chart === 'undefined') return;

            const keys = ['annual', 'sick', 'casual', 'wfh'];
            const counts = { annual: 0, sick: 0, casual: 0, wfh: 0 };
            this.leaves.forEach(l => {
                if (l.status !== 'Rejected' && counts[l.typeKey] !== undefined) counts[l.typeKey] += l.days;
            });

            if (this.balanceChart) this.balanceChart.destroy();
            this.balanceChart = Vue.markRaw(new Chart(el, {
                type: 'doughnut',
                data: {
                    labels: ['Annual', 'Sick', 'Casual', 'WFH'],
                    datasets: [{
                        data: keys.map(k => counts[k]),
                        backgroundColor: ['#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4'],
                        borderWidth: 0,
                        hoverOffset: 6
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '68%',
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14, font: { size: 11, weight: 600 } } } }
                }
            }));
        }
    }
};
