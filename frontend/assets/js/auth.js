const loginForm = document.getElementById("login-form");

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);

  try {
    const response = await window.apiClient.login({
      username: String(formData.get("username") || ""),
      password: String(formData.get("password") || ""),
    });
    window.appUi.setAuthState(response.access_token, response.user);
    const next = new URLSearchParams(window.location.search).get("next") || "dashboard.html";
    window.location.href = `/${next}`;
  } catch (error) {
    window.appUi.showToast(error.message, "error");
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await window.appUi.initializeApp();
    if (window.appUi.getStoredToken()) {
      window.location.href = "/dashboard.html";
    }
  } catch {
    window.appUi.clearAuthState();
  }
});
