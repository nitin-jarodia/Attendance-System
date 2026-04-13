function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function showToast(message, type = "success") {
  const root = document.getElementById("toast-root");
  if (!root) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<p>${message}</p>`;
  root.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3500);
}

function setActiveNav() {
  const currentPath = window.location.pathname.split("/").pop() || "students.html";
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === currentPath);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusBadge(status) {
  return `<span class="badge ${status}">${status}</span>`;
}

document.addEventListener("DOMContentLoaded", () => {
  setActiveNav();
});

window.appUi = {
  escapeHtml,
  getTodayDate,
  showToast,
  statusBadge,
};
