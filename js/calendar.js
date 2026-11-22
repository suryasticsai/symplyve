const calendarModule = {
    data() {
        return {
            employees: [],
            days: [],
            leaves: [],
            isLoading: true,
            searchQuery: '',
            reportSearch: '', 
            
            currentView: 'calendar',
            fcCalendar: null,
            balanceChart: null,
            
            months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
            selectedMonth: new Date().getMonth(),
            selectedYear: new Date().getFullYear().toString(),

            outTodayList: [],
            pendingRequests: []
        }
    },
    computed: {
        filteredEmployees() {
            if (!this.searchQuery) return this.employees;
            const q = this.searchQuery.toLowerCase();
            return this.employees.filter(e => 
                e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)
            );
        },
        outTodayCount() { return this.outTodayList.length; },
        pendingApprovalsCount() { return this.pendingRequests.length; },
        filteredReports() {
            let filtered = this.leaves;
            if (this.reportSearch) {
                const q = this.reportSearch.toLowerCase();
                filtered = filtered.filter(l => 
                    l.emp.toLowerCase().includes(q) || l.label.toLowerCase().includes(q) || l.status.toLowerCase().includes(q)
                );
            }
            return [...filtered].sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
        }
    },
    methods: {
        async loadData() {
            this.isLoading = true;
            try {
                const [empRes, leaveRes] = await Promise.all([
                    fetch(`${CONFIG.API_URL}?action=getEmployees`),
                    fetch(`${CONFIG.API_URL}?action=getLeaves`)
                ]);

                const empData = await empRes.json();
                const leaveData = await leaveRes.json();

                // Map all fields properly
                this.employees = Array.isArray(empData) ? empData.map(e => ({ 
                    id: e.ID, name: e.Name, role: e.Role,
                    department: e.Department, email: e.Email,
                    totalAllowance: e.TotalAllowance, usedAllowance: e.UsedAllowance
                })) : [];
                
                const typeMap = {
                    'annual': { class: 'bg-annual', label: 'Annual', fcClass: 'evt-annual' },
                    'sick': { class: 'bg-sick', label: 'Sick', fcClass: 'evt-sick' },
                    'casual': { class: 'bg-casual', label: 'Casual', fcClass: 'evt-casual' },
                    'unpaid': { class: 'bg-unpaid', label: 'Unpaid', fcClass: 'evt-unpaid' },
                    'wfh': { class: 'bg-wfh', label: 'WFH', fcClass: 'evt-wfh' }
                };

                this.leaves = Array.isArray(leaveData) ? leaveData.map(row => {
                    if (!row.StartDate || !row.EndDate) return null;
                    const startDay = parseInt(row.StartDate.split('-')[2]);
                    const endDay = parseInt(row.EndDate.split('-')[2]);
                    const typeInfo = typeMap[row.Type.toLowerCase()] || { class: 'bg-annual', label: row.Type, fcClass: 'evt-annual' };
                    
                    return { 
                        id: row.ID, emp: row.EmployeeName, start: startDay, end: endDay, 
                        startDate: row.StartDate, endDate: row.EndDate,
                        typeClass: typeInfo.class, fcClass: typeInfo.fcClass,
                        label: typeInfo.label, status: row.Status 
                    };
                }).filter(Boolean) : [];

                this.generateDays(); 
                this.processSidePanels();
                
                // URL Parsing Logic
                const urlParams = new URLSearchParams(window.location.search);
                const empIdParam = urlParams.get('empId');
                
                if (empIdParam) {
                    const foundEmp = this.employees.find(e => e.id === empIdParam);
                    if (foundEmp) {
                        this.targetEmployee = foundEmp;
                        this.activeTab = 'myleave';
                    } else {
                        this.targetEmployee = this.employees[0]; // fallback
                    }
                } else {
                    this.targetEmployee = this.employees[0];
                }
                
                this.$nextTick(() => {
                    this.renderFullCalendar();
                });
                
                this.renderChart();

            } catch (error) {
                console.error("Fetch Error:", error);
            } finally {
                this.isLoading = false;
            }
        },
        generateDays() {
            this.days = [];
            const year = parseInt(this.selectedYear);
            const month = parseInt(this.selectedMonth);
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
            const today = new Date();

            for (let i = 1; i <= daysInMonth; i++) {
                const dateObj = new Date(year, month, i);
                const dayOfWeek = dateObj.getDay(); 
                
                this.days.push({
                    date: i, 
                    dayName: dayNames[dayOfWeek],
                    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
                    isToday: i === today.getDate() && month === today.getMonth() && year === today.getFullYear()
                });
            }
        },
        processSidePanels() {
            const todayDay = new Date().getDate();
            this.outTodayList = [];
            this.employees.forEach(emp => {
                const activeLeave = this.leaves.find(l => 
                    l.emp === emp.name && l.status === 'Approved' && todayDay >= l.start && todayDay <= l.end
                );
                if (activeLeave) this.outTodayList.push({ name: emp.name, type: activeLeave.label });
            });

            this.pendingRequests = this.leaves
                .filter(l => l.status === 'Pending')
                .map(l => ({ id: l.id, emp: l.emp, label: `${l.label} (${l.startDate} to ${l.endDate})` }));
        },
        renderFullCalendar() {
            const calendarEl = this.$refs.calendarEl;
            if (!calendarEl) return;

            try {
                if (typeof FullCalendar === 'undefined') return;

                const events = this.leaves.filter(l => l.status !== 'Rejected').map(l => ({
                    title: `${l.emp.split(' ')[0]} · ${l.label}`,
                    start: l.startDate,
                    end: l.endDate,
                    className: l.fcClass
                }));

                if (this.fcCalendar) {
                    this.fcCalendar.removeAllEvents();
                    this.fcCalendar.addEventSource(events);
                } else {
                    this.fcCalendar = new FullCalendar.Calendar(calendarEl, {
                        initialView: 'dayGridMonth',
                        initialDate: `${this.selectedYear}-${String(this.selectedMonth + 1).padStart(2, '0')}-01`,
                        headerToolbar: { left: 'prev,next', center: 'title', right: '' },
                        height: '100%',
                        events: events,
                        dayMaxEvents: 3
                    });
                    this.fcCalendar.render();
                }
            } catch (error) {
                console.error("Calendar Error:", error.message);
            }
        },
        getLeavesForEmp(empName) { return this.leaves.filter(l => l.emp === empName); },
        calculateBarStyle(leave) {
            const total = this.days.length; 
            const startPct = ((leave.start - 1) / total) * 100;
            const widthPct = ((leave.end - leave.start + 1) / total) * 100;
            
            return {
                left: `calc(220px + (100% - 220px) * ${startPct / 100})`,
                width: `calc((100% - 220px) * ${widthPct / 100} - 4px)` 
            };
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
                const dateStr = `${this.selectedYear}-${String(this.selectedMonth + 1).padStart(2, '0')}-01`;
                this.fcCalendar.gotoDate(dateStr);
            }
        },
        renderChart() {
            const chartEl = this.$refs.chartEl;
            if (!chartEl) return;
            
            let counts = { annual: 0, sick: 0, casual: 0, wfh: 0 };
            this.leaves.forEach(l => {
                const key = l.typeClass.replace('bg-', '');
                if(counts[key] !== undefined) counts[key] += (l.end - l.start + 1);
            });

            if (this.balanceChart) this.balanceChart.destroy();

            this.balanceChart = new Chart(chartEl, {
                type: 'doughnut',
                data: {
                    labels: ['Annual', 'Sick', 'Casual', 'WFH'],
                    datasets: [{
                        data: [counts.annual, counts.sick, counts.casual, counts.wfh],
                        backgroundColor: ['#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4'],
                        borderWidth: 0, hoverOffset: 6
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '68%',
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14, font: { size: 11, weight: 600 } } } }
                }
            });
        }
    }
};