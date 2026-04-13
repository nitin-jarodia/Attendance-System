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

  login(data) {
    return this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  getCurrentUser() {
    return this.request("/auth/me");
  },

  getUsers() {
    return this.request("/auth/users");
  },

  createUser(data) {
    return this.request("/auth/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  getDashboardSummary() {
    return this.request("/dashboard/summary");
  },

  getStudents(params = {}) {
    return this.request(`/students${this.buildQuery(params)}`);
  },

  searchStudents(params = {}) {
    return this.request(`/students/search${this.buildQuery(params)}`);
  },

  addStudent(data) {
    return this.request("/students/add", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  bulkAddStudents(data) {
    return this.request("/students/bulk", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateStudentClass(rollNumber, data) {
    return this.request(`/students/${encodeURIComponent(rollNumber)}/class`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  getClasses() {
    return this.request("/classes");
  },

  createClass(data) {
    return this.request("/classes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateClass(classId, data) {
    return this.request(`/classes/${encodeURIComponent(classId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  deleteClass(classId) {
    return this.request(`/classes/${encodeURIComponent(classId)}`, {
      method: "DELETE",
    });
  },

  getAttendance(params = {}) {
    return this.request(`/attendance${this.buildQuery(params)}`);
  },

  searchAttendance(params = {}) {
    return this.request(`/attendance/search${this.buildQuery(params)}`);
  },

  markAttendance(date, records) {
    return this.request("/attendance/mark", {
      method: "POST",
      body: JSON.stringify({ date, records }),
    });
  },

  updateAttendance(data) {
    return this.request("/attendance/update", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  deleteAttendance(data) {
    return this.request("/attendance/delete", {
      method: "DELETE",
      body: JSON.stringify(data),
    });
  },

  exportAttendanceUrl(params = {}) {
    return `/attendance/export${this.buildQuery(params)}`;
  },

  downloadAttendanceExport(params = {}) {
    return this.download(this.exportAttendanceUrl(params));
  },

  getStudentAnalytics(params = {}) {
    return this.request(`/analytics/students${this.buildQuery(params)}`);
  },

  getClassAnalytics(params = {}) {
    return this.request(`/analytics/classes${this.buildQuery(params)}`);
  },
};

window.apiClient = apiClient;
