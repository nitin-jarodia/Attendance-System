const darkModeToggle = document.getElementById("dark-mode-toggle");
const defaultAttendanceModeSelect = document.getElementById("default-attendance-mode");
const soundFeedbackToggle = document.getElementById("sound-feedback-toggle");
const voiceSupportBadge = document.getElementById("voice-support-badge");
const openResetDialogButton = document.getElementById("open-reset-dialog");
const activityLogBody = document.getElementById("activity-log-body");

function renderActivityLog(response) {
  if (!response.items.length) {
    activityLogBody.innerHTML = `
      <tr>
        <td colspan="4"><div class="empty-state">No reset activity has been recorded yet.</div></td>
      </tr>
    `;
    return;
  }

  activityLogBody.innerHTML = response.items
    .map(
      (item) => `
        <tr>
          <td>${new Date(item.created_at).toLocaleString()}</td>
          <td>${window.appUi.escapeHtml(item.actor_username)}</td>
          <td>${window.appUi.escapeHtml(item.action)}</td>
          <td>${window.appUi.escapeHtml(item.details)}</td>
        </tr>
      `
    )
    .join("");
}

async function loadActivityLog() {
  const response = await window.apiClient.getActivityLog(40);
  renderActivityLog(response);
}

function openResetDialog() {
  const dialog = window.appUi.showDialog({
    title: "Reset attendance data",
    description: "Choose a safe reset action. You will get a short undo window after each reset.",
    bodyHtml: `
      <div class="field">
        <label for="reset-target-date">Select date</label>
        <input class="input" id="reset-target-date" type="date" value="${window.appUi.getTodayDate()}">
      </div>
      <div class="dialog-grid">
        <button class="btn btn-secondary" type="button" data-reset-action="today">Reset today's data</button>
        <button class="btn btn-danger" type="button" data-reset-action="day">Reset selected date</button>
      </div>
      <div class="field">
        <label for="reset-all-confirmation">Reset all data</label>
        <input class="input" id="reset-all-confirmation" type="text" placeholder="Type RESET to confirm">
      </div>
    `,
    actions: [
      { label: "Close", variant: "btn-secondary" },
      {
        label: "Reset All Data",
        variant: "btn-danger",
        onClick: async (root) => {
          try {
            const confirmationText = root.querySelector("#reset-all-confirmation").value;
            const response = await window.apiClient.resetAllAttendance(confirmationText);
            window.appUi.showToast(response.message, "success", {
              duration: 10000,
              actionLabel: "Undo",
              onAction: async () => {
                await window.apiClient.undoReset(response.snapshot_id);
                await loadActivityLog();
                window.appUi.showToast("Reset undone successfully.");
              },
            });
            await loadActivityLog();
          } catch (error) {
            window.appUi.showToast(error.message, "error");
            return false;
          }
        },
      },
    ],
  });

  dialog.querySelectorAll("[data-reset-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const targetDate = dialog.querySelector("#reset-target-date").value;
        const response =
          button.dataset.resetAction === "today"
            ? await window.apiClient.resetAttendanceToday()
            : await window.apiClient.resetAttendanceDay(targetDate);
        window.appUi.showToast(response.message, "success", {
          duration: 10000,
          actionLabel: "Undo",
          onAction: async () => {
            await window.apiClient.undoReset(response.snapshot_id);
            await loadActivityLog();
            window.appUi.showToast("Reset undone successfully.");
          },
        });
        window.appUi.closeDialog();
        await loadActivityLog();
      } catch (error) {
        window.appUi.showToast(error.message, "error");
      }
    });
  });
}

darkModeToggle?.addEventListener("change", () => {
  window.appUi.setPreference(window.appUi.STORAGE_KEYS.darkMode, darkModeToggle.checked);
  document.documentElement.classList.toggle("dark-mode", darkModeToggle.checked);
});

defaultAttendanceModeSelect?.addEventListener("change", () => {
  window.appUi.setPreference(window.appUi.STORAGE_KEYS.defaultAttendanceMode, defaultAttendanceModeSelect.value);
  window.appUi.showToast("Default attendance mode updated.");
});

soundFeedbackToggle?.addEventListener("change", () => {
  window.appUi.setPreference(window.appUi.STORAGE_KEYS.soundEnabled, soundFeedbackToggle.checked);
  window.appUi.showToast("Sound preference updated.");
});

openResetDialogButton?.addEventListener("click", openResetDialog);

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const app = await window.appUi.initializeApp();
    darkModeToggle.checked = window.appUi.getPreference(window.appUi.STORAGE_KEYS.darkMode, "false") === "true";
    defaultAttendanceModeSelect.value = window.appUi.getPreference(
      window.appUi.STORAGE_KEYS.defaultAttendanceMode,
      "all_present"
    );
    soundFeedbackToggle.checked = window.appUi.getPreference(window.appUi.STORAGE_KEYS.soundEnabled, "false") === "true";
    voiceSupportBadge.textContent =
      window.SpeechRecognition || window.webkitSpeechRecognition ? "Supported" : "Use Chrome";
    voiceSupportBadge.className = `badge ${
      window.SpeechRecognition || window.webkitSpeechRecognition ? "present" : "late"
    }`;
    if (app.user?.role === "admin") {
      await loadActivityLog();
    } else {
      renderActivityLog({ items: [] });
    }
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});
