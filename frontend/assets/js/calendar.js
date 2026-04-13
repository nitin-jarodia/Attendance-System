const calendarGrid = document.getElementById("calendar-grid");
const monthLabel = document.getElementById("calendar-month-label");
const prevMonthBtn = document.getElementById("prev-month-btn");
const nextMonthBtn = document.getElementById("next-month-btn");
const loadPresetsBtn = document.getElementById("load-presets-btn");
const upcomingList = document.getElementById("upcoming-holidays-list");
const workingDaysSummary = document.getElementById("working-days-summary");

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let currentUser = null;
let calendarDirection = "left";

function openAddHolidayDialog(dateStr) {
  window.appUi.showDialog({
    title: `Add Holiday — ${dateStr}`,
    bodyHtml: `
      <div class="field">
        <label>Holiday Name</label>
        <input class="input" id="holiday-name-input" type="text" placeholder="e.g. Republic Day">
      </div>
      <div class="field">
        <label>Type</label>
        <select class="select" id="holiday-type-input">
          <option value="national">National</option>
          <option value="religious">Religious</option>
          <option value="school_event">School Event</option>
          <option value="weather">Weather</option>
          <option value="exam_day">Exam Day</option>
          <option value="half_day">Half Day</option>
        </select>
      </div>
      <div class="settings-option">
        <label>Recurring every year</label>
        <label class="switch"><input id="holiday-recurring-input" type="checkbox"><span class="switch-slider"></span></label>
      </div>
    `,
    actions: [
      { label: "Cancel", variant: "btn-secondary" },
      {
        label: "Save Holiday",
        variant: "btn-primary",
        onClick: async (dialog) => {
          const name = dialog.querySelector("#holiday-name-input").value.trim();
          if (!name) { window.appUi.showToast("Holiday name is required.", "error"); return false; }
          const type = dialog.querySelector("#holiday-type-input").value;
          const isRecurring = dialog.querySelector("#holiday-recurring-input").checked;
          await window.apiClient.createHoliday({ date: dateStr, name, type, is_recurring: isRecurring });
          window.appUi.showToast("Holiday added.");
          loadCalendar();
        },
      },
    ],
  });
}

function openHolidayInfoDialog(day) {
  const isAdmin = currentUser?.role === "admin";
  window.appUi.showDialog({
    title: day.holiday_name || "Holiday",
    description: `${day.date} — ${day.holiday_type || "holiday"}`,
    actions: [
      { label: "Close", variant: "btn-secondary" },
      ...(isAdmin ? [{
        label: "Remove Holiday",
        variant: "btn-danger",
        onClick: async () => {
          const holidays = await window.apiClient.getHolidays({ year: currentYear, month: currentMonth });
          const match = holidays.items.find((h) => h.date === day.date);
          if (match) {
            await window.apiClient.deleteHoliday(match.id);
            window.appUi.showToast("Holiday removed.");
            loadCalendar();
          }
        },
      }] : []),
    ],
  });
}

function renderCalendar(data) {
  monthLabel.textContent = `${MONTH_NAMES[data.month - 1]} ${data.year}`;

  const firstDayOfMonth = new Date(data.year, data.month - 1, 1);
  let startDay = firstDayOfMonth.getDay() - 1;
  if (startDay < 0) startDay = 6;

  const isAdmin = currentUser?.role === "admin";

  let html = DAY_NAMES.map((d) => `<div class="calendar-header-cell">${d}</div>`).join("");

  for (let i = 0; i < startDay; i++) {
    html += `<div class="calendar-cell empty"></div>`;
  }

  for (const day of data.days) {
    const dayNum = new Date(day.date).getDate();
    const todayClass = day.is_today ? "today" : "";
    const nameLabel = day.holiday_name ? `<span class="calendar-cell-name">${window.appUi.escapeHtml(day.holiday_name)}</span>` : "";

    html += `<div class="calendar-cell ${day.day_type} ${todayClass}" data-date="${day.date}" data-type="${day.day_type}">
      <strong>${dayNum}</strong>
      ${nameLabel}
    </div>`;
  }

  calendarGrid.innerHTML = html;
  calendarGrid.classList.remove("slide-left", "slide-right");
  void calendarGrid.offsetWidth;
  calendarGrid.classList.add(calendarDirection === "right" ? "slide-right" : "slide-left");
  window.appUi.animateContentIn(calendarGrid);

  calendarGrid.querySelectorAll(".calendar-cell:not(.empty)").forEach((cell) => {
    cell.addEventListener("click", () => {
      const dateStr = cell.dataset.date;
      const dayType = cell.dataset.type;
      if (dayType === "holiday" || dayType === "exam_day" || dayType === "half_day") {
        const dayData = data.days.find((d) => d.date === dateStr);
        if (dayData) openHolidayInfoDialog(dayData);
      } else if (isAdmin && dayType === "working") {
        openAddHolidayDialog(dateStr);
      }
    });
  });
}

async function loadUpcomingHolidays() {
  try {
    const holidays = await window.apiClient.getUpcomingHolidays(3);
    if (!holidays.length) {
      upcomingList.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎉</div>No holidays this month!</div>`;
      window.appUi.animateContentIn(upcomingList);
      return;
    }
    upcomingList.innerHTML = holidays.map((h) => `
      <div class="upcoming-holiday-item">
        <div>
          <strong>${h.name}</strong>
          <span class="muted" style="margin-left:8px;">${h.type}</span>
        </div>
        <span class="muted">${h.date} (in ${h.days_until} day${h.days_until === 1 ? "" : "s"})</span>
      </div>
    `).join("");
    window.appUi.animateContentIn(upcomingList);
  } catch {
    upcomingList.innerHTML = `<div class="empty-state">Could not load upcoming holidays.</div>`;
    window.appUi.animateContentIn(upcomingList);
  }
}

async function loadWorkingDays() {
  try {
    const now = new Date();
    const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(currentYear, currentMonth, 0).getDate();
    const endOfMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const info = await window.apiClient.getWorkingDays(startOfMonth, endOfMonth);
    workingDaysSummary.innerHTML = `
      <div class="metric-grid">
        <div class="metric-card"><strong>${info.total_calendar_days}</strong><span>Calendar days</span></div>
        <div class="metric-card"><strong>${info.total_working_days}</strong><span>Working days</span></div>
        <div class="metric-card"><strong>${info.total_holidays}</strong><span>Holidays</span></div>
        <div class="metric-card"><strong>${info.total_weekends}</strong><span>Weekends</span></div>
      </div>
    `;
    window.appUi.animateContentIn(workingDaysSummary);
  } catch {
    workingDaysSummary.innerHTML = `<div class="empty-state">Could not load working days info.</div>`;
    window.appUi.animateContentIn(workingDaysSummary);
  }
}

async function loadCalendar() {
  try {
    const data = await window.apiClient.getCalendarMonth({ year: currentYear, month: currentMonth });
    renderCalendar(data);
    loadWorkingDays();
    loadUpcomingHolidays();
  } catch (err) {
    calendarGrid.innerHTML = `<div class="empty-state">Failed to load calendar: ${window.appUi.escapeHtml(err.message)}</div>`;
    window.appUi.animateContentIn(calendarGrid);
  }
}

prevMonthBtn?.addEventListener("click", () => {
  calendarDirection = "right";
  currentMonth--;
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  loadCalendar();
});

nextMonthBtn?.addEventListener("click", () => {
  calendarDirection = "left";
  currentMonth++;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  loadCalendar();
});

loadPresetsBtn?.addEventListener("click", async () => {
  try {
    const result = await window.apiClient.loadPresetHolidays();
    window.appUi.showToast(result.message);
    loadCalendar();
  } catch (err) {
    window.appUi.showToast(err.message, "error");
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const app = await window.appUi.initializeApp();
    currentUser = app.user;
    await loadCalendar();
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});
