const apiClient = {
  getToken() {
    return window.localStorage.getItem("attendance_token");
  },

  buildQuery(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") {
        return;
      }
      query.set(key, String(value));
    });
    const queryString = query.toString();
    return queryString ? `?${queryString}` : "";
  },

  async request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = this.getToken();
    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(path, { ...options, headers });

    const isJson = response.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const message =
        (typeof payload === "object" && payload?.detail) ||
        (typeof payload === "string" && payload) ||
        "Request failed.";
      if (response.status === 401) {
        window.localStorage.removeItem("attendance_token");
        window.localStorage.removeItem("attendance_user");
      }
      throw new Error(message);
    }

    return payload;
  },

  async download(path) {
    const headers = {};
    const token = this.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(path, { headers });
    if (!response.ok) {
      const payload = await response.text();
      throw new Error(payload || "Download failed.");
    }

    return {
      blob: await response.blob(),
      filename:
        response.headers
          .get("content-disposition")
          ?.match(/filename="?([^"]+)"?/)?.[1] || "download.csv",
    };
  },

  // Auth
  login(data) {
    return this.request("/auth/login", { method: "POST", body: JSON.stringify(data) });
  },
  getCurrentUser() {
    return this.request("/auth/me");
  },
  getUsers() {
    return this.request("/auth/users");
  },
  createUser(data) {
    return this.request("/auth/users", { method: "POST", body: JSON.stringify(data) });
  },
  demoSwitchRole(role) {
    return this.request("/auth/demo-switch", { method: "POST", body: JSON.stringify({ role }) });
  },

  // Dashboard
  getDashboardSummary() {
    return this.request("/dashboard/summary");
  },
  getRecentActivity(limit = 5) {
    return this.request(`/dashboard/recent-activity${this.buildQuery({ limit })}`);
  },
  getUpcomingHolidays(limit = 3) {
    return this.request(`/dashboard/upcoming-holidays${this.buildQuery({ limit })}`);
  },

  // Analytics
  getAnalyticsSummary(params = {}) {
    return this.request(`/analytics/summary${this.buildQuery(params)}`);
  },
  getStudentAnalytics(params = {}) {
    return this.request(`/analytics/students${this.buildQuery(params)}`);
  },
  getClassAnalytics(params = {}) {
    return this.request(`/analytics/classes${this.buildQuery(params)}`);
  },
  getStudentInsight(rollNumber, params = {}) {
    return this.request(`/analytics/student/${encodeURIComponent(rollNumber)}${this.buildQuery(params)}`);
  },
  getClassInsight(classId, params = {}) {
    return this.request(`/analytics/class/${encodeURIComponent(classId)}${this.buildQuery(params)}`);
  },
  getPredictions(params = {}) {
    return this.request(`/analytics/predictions${this.buildQuery(params)}`);
  },

  // Students
  getStudents(params = {}) {
    return this.request(`/students${this.buildQuery(params)}`);
  },
  searchStudents(params = {}) {
    return this.request(`/students/search${this.buildQuery(params)}`);
  },
  addStudent(data) {
    return this.request("/students/add", { method: "POST", body: JSON.stringify(data) });
  },
  bulkAddStudents(data) {
    return this.request("/students/bulk", { method: "POST", body: JSON.stringify(data) });
  },
  updateStudentClass(rollNumber, data) {
    return this.request(`/students/${encodeURIComponent(rollNumber)}/class`, { method: "PATCH", body: JSON.stringify(data) });
  },

  // Classes
  getClasses() {
    return this.request("/classes");
  },
  createClass(data) {
    return this.request("/classes", { method: "POST", body: JSON.stringify(data) });
  },
  updateClass(classId, data) {
    return this.request(`/classes/${encodeURIComponent(classId)}`, { method: "PUT", body: JSON.stringify(data) });
  },
  deleteClass(classId) {
    return this.request(`/classes/${encodeURIComponent(classId)}`, { method: "DELETE" });
  },

  // Attendance
  getAttendance(params = {}) {
    return this.request(`/attendance${this.buildQuery(params)}`);
  },
  searchAttendance(params = {}) {
    return this.request(`/attendance/search${this.buildQuery(params)}`);
  },
  markAttendance(date, records) {
    return this.request("/attendance/mark", { method: "POST", body: JSON.stringify({ date, records }) });
  },
  updateAttendance(data) {
    return this.request("/attendance/update", { method: "PUT", body: JSON.stringify(data) });
  },
  deleteAttendance(data) {
    return this.request("/attendance/delete", { method: "DELETE", body: JSON.stringify(data) });
  },
  getLateArrivals(params = {}) {
    return this.request(`/attendance/late-arrivals${this.buildQuery(params)}`);
  },
  exportAttendanceUrl(params = {}) {
    return `/attendance/export${this.buildQuery(params)}`;
  },
  downloadAttendanceExport(params = {}) {
    return this.download(this.exportAttendanceUrl(params));
  },

  // Holidays & Calendar
  getHolidays(params = {}) {
    return this.request(`/holidays${this.buildQuery(params)}`);
  },
  createHoliday(data) {
    return this.request("/holidays", { method: "POST", body: JSON.stringify(data) });
  },
  deleteHoliday(id) {
    return this.request(`/holidays/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  getCalendarMonth(params = {}) {
    return this.request(`/holidays/calendar${this.buildQuery(params)}`);
  },
  getUpcomingHolidaysFromApi(limit = 3) {
    return this.request(`/holidays/upcoming${this.buildQuery({ limit })}`);
  },
  getWorkingDays(startDate, endDate) {
    return this.request(`/holidays/working-days${this.buildQuery({ start_date: startDate, end_date: endDate })}`);
  },
  getAcademicYear() {
    return this.request("/holidays/academic-year");
  },
  createAcademicYear(data) {
    return this.request("/holidays/academic-year", { method: "POST", body: JSON.stringify(data) });
  },
  loadPresetHolidays() {
    return this.request("/holidays/load-presets", { method: "POST" });
  },

  // Settings
  getActivityLog(params = {}) {
    return this.request(`/settings/activity-log${this.buildQuery(params)}`);
  },
  resetAttendanceDay(targetDate) {
    return this.request("/settings/reset/day", { method: "POST", body: JSON.stringify({ target_date: targetDate }) });
  },
  resetAttendanceToday() {
    return this.request("/settings/reset/today", { method: "POST" });
  },
  resetAllAttendance(confirmationText) {
    return this.request("/settings/reset/all", { method: "POST", body: JSON.stringify({ confirmation_text: confirmationText }) });
  },
  undoReset(snapshotId) {
    return this.request("/settings/reset/undo", { method: "POST", body: JSON.stringify({ snapshot_id: snapshotId }) });
  },

  // Realtime
  createAttendanceRealtimeConnection(onMessage) {
    const token = this.getToken();
    if (!token) return null;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/realtime/attendance?token=${encodeURIComponent(token)}`
    );

    if (typeof onMessage === "function") {
      socket.addEventListener("message", (event) => {
        try {
          onMessage(JSON.parse(event.data));
        } catch (_) {
          onMessage({ type: "message", raw: event.data });
        }
      });
    }

    return socket;
  },
};

window.apiClient = apiClient;
