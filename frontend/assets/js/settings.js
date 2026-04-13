const darkModeToggle = document.getElementById("dark-mode-toggle");
const defaultAttendanceMode = document.getElementById("default-attendance-mode");
const soundFeedbackToggle = document.getElementById("sound-feedback-toggle");
const voiceSupportBadge = document.getElementById("voice-support-badge");
const resetButton = document.getElementById("open-reset-dialog");

function loadPreferences() {
  darkModeToggle.checked = window.appUi.getPreference(window.appUi.STORAGE_KEYS.darkMode, "false") === "true";
  defaultAttendanceMode.value = window.appUi.getPreference(window.appUi.STORAGE_KEYS.defaultAttendanceMode, "all_present");
  soundFeedbackToggle.checked = window.appUi.getPreference(window.appUi.STORAGE_KEYS.soundEnabled, "false") === "true";

  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    voiceSupportBadge.textContent = "Supported";
    voiceSupportBadge.className = "badge present";
  } else {
    voiceSupportBadge.textContent = "Not Supported";
    voiceSupportBadge.className = "badge absent";
  }
}

darkModeToggle.addEventListener("change", () => {
  window.appUi.setPreference(window.appUi.STORAGE_KEYS.darkMode, darkModeToggle.checked);
  document.documentElement.classList.toggle("dark-mode", darkModeToggle.checked);
});

defaultAttendanceMode.addEventListener("change", () => {
  window.appUi.setPreference(window.appUi.STORAGE_KEYS.defaultAttendanceMode, defaultAttendanceMode.value);
  window.appUi.showToast("Default attendance mode updated.");
});

soundFeedbackToggle.addEventListener("change", () => {
  window.appUi.setPreference(window.appUi.STORAGE_KEYS.soundEnabled, soundFeedbackToggle.checked);
});

function openResetDialog() {
  window.appUi.showDialog({
    title: "Reset Attendance Data",
    description: "Choose a reset scope. You'll have 10 seconds to undo after reset.",
    bodyHtml: `
      <div class="field">
        <label>Reset for specific date</label>
        <input class="input" id="reset-date-input" type="date" value="${window.appUi.getTodayDate()}">
      </div>
    `,
    actions: [
      { label: "Cancel", variant: "btn-secondary" },
      {
        label: "Reset Today",
        variant: "btn-danger",
        onClick: async () => {
          const result = await window.apiClient.resetAttendanceToday();
          window.appUi.showToast(result.message, "success", {
            actionLabel: "Undo",
            duration: 10000,
            onAction: async () => {
              const undo = await window.apiClient.undoReset(result.snapshot_id);
              window.appUi.showToast(undo.message);
            },
          });
        },
      },
      {
        label: "Reset Selected Date",
        variant: "btn-danger",
        onClick: async (dialog) => {
          const dateVal = dialog.querySelector("#reset-date-input").value;
          if (!dateVal) { window.appUi.showToast("Select a date.", "error"); return false; }
          const result = await window.apiClient.resetAttendanceDay(dateVal);
          window.appUi.showToast(result.message, "success", {
            actionLabel: "Undo",
            duration: 10000,
            onAction: async () => {
              const undo = await window.apiClient.undoReset(result.snapshot_id);
              window.appUi.showToast(undo.message);
            },
          });
        },
      },
      {
        label: "Reset ALL Data",
        variant: "btn-danger",
        onClick: async () => {
          window.appUi.showDialog({
            title: "Confirm Full Reset",
            description: "This will delete ALL attendance records. Type RESET to confirm.",
            bodyHtml: `<div class="field"><input class="input" id="reset-confirm-input" type="text" placeholder="Type RESET"></div>`,
            actions: [
              { label: "Cancel", variant: "btn-secondary" },
              {
                label: "Confirm Reset",
                variant: "btn-danger",
                onClick: async (d) => {
                  const text = d.querySelector("#reset-confirm-input").value;
                  try {
                    const result = await window.apiClient.resetAllAttendance(text);
                    window.appUi.showToast(result.message, "success", {
                      actionLabel: "Undo",
                      duration: 10000,
                      onAction: async () => {
                        const undo = await window.apiClient.undoReset(result.snapshot_id);
                        window.appUi.showToast(undo.message);
                      },
                    });
                  } catch (err) {
                    window.appUi.showToast(err.message, "error");
                    return false;
                  }
                },
              },
            ],
          });
          return false;
        },
        keepOpen: true,
      },
    ],
  });
}

resetButton?.addEventListener("click", openResetDialog);

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await window.appUi.initializeApp();
    loadPreferences();
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});
