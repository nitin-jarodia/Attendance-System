const apiClient = {
  async request(path, options = {}) {
    const response = await fetch(path, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    const isJson = response.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const message =
        (typeof payload === "object" && payload?.detail) ||
        (typeof payload === "string" && payload) ||
        "Request failed.";
      throw new Error(message);
    }

    return payload;
  },

  getStudents() {
    return this.request("/students");
  },

  addStudent(data) {
    return this.request("/students/add", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  bulkAddStudents(rawText) {
    return this.request("/students/bulk", {
      method: "POST",
      body: JSON.stringify({ raw_text: rawText }),
    });
  },

  getAttendance(date) {
    return this.request(`/attendance?date=${encodeURIComponent(date)}`);
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

  exportAttendanceUrl(date) {
    return `/attendance/export?date=${encodeURIComponent(date)}`;
  },
};

window.apiClient = apiClient;
