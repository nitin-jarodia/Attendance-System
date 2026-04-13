function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function normalizeTranscript(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getDefaultVoiceCommands() {
  return [
    "Open attendance",
    "Open dashboard",
    "Go to settings",
    "Show today's attendance summary",
    "Mark all present",
    "Mark Rahul present",
    "Mark roll number 12 absent",
  ];
}

function routeDefaultVoiceCommand(transcript) {
  const pageMap = {
    "open attendance": "/attendance.html",
    "open dashboard": "/dashboard.html",
    "go to settings": "/settings.html",
    "open settings": "/settings.html",
    "open records": "/records.html",
    "open students": "/students.html",
    "open analytics": "/analytics.html",
  };

  if (pageMap[transcript]) {
    window.location.href = pageMap[transcript];
    return true;
  }

  if (transcript.includes("today's attendance summary") || transcript.includes("today attendance summary")) {
    window.location.href = `/analytics.html?date=${encodeURIComponent(window.appUi.getTodayDate())}`;
    return true;
  }

  return false;
}

function createFloatingMicUi() {
  if (document.body.dataset.publicPage === "true" || document.getElementById("voice-fab")) {
    return null;
  }

  const shell = document.createElement("div");
  shell.className = "voice-fab-shell";
  shell.innerHTML = `
    <button class="voice-fab" id="voice-fab" type="button" aria-label="Open voice commands">
      <span class="voice-fab-core">🎙</span>
    </button>
    <div class="voice-panel" id="voice-panel" hidden>
      <div class="voice-panel-header">
        <strong>Voice assistant</strong>
        <button class="icon-button" id="voice-panel-close" type="button" aria-label="Close voice panel">×</button>
      </div>
      <p class="helper-text" id="voice-status-text">Tap the microphone and speak a command.</p>
      <div class="voice-wave" id="voice-wave" hidden>
        <span></span><span></span><span></span>
      </div>
      <div class="voice-transcript" id="voice-transcript">Waiting for your command…</div>
      <details class="voice-help-card">
        <summary>Available commands</summary>
        <ul class="list" id="voice-help-list"></ul>
      </details>
    </div>
  `;
  document.body.appendChild(shell);
  return shell;
}

function createVoiceController({ button, feedbackElement, onCommand, transcriptElement }) {
  const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
  if (!button) {
    return null;
  }

  if (!SpeechRecognitionCtor) {
    button.disabled = true;
    if (feedbackElement) {
      feedbackElement.textContent = "Voice commands are not supported in this browser. Please use Chrome.";
    }
    return null;
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  const floatingUi = createFloatingMicUi();
  const voicePanel = document.getElementById("voice-panel");
  const voiceStatusText = document.getElementById("voice-status-text");
  const voiceTranscript = transcriptElement || document.getElementById("voice-transcript");
  const voiceWave = document.getElementById("voice-wave");
  const helpList = document.getElementById("voice-help-list");
  let heardFinalTranscript = "";
  let helpShown = false;

  if (helpList && !helpList.childElementCount) {
    helpList.innerHTML = getDefaultVoiceCommands()
      .map((item) => `<li>${window.appUi.escapeHtml(item)}</li>`)
      .join("");
  }

  function setListeningState(listening) {
    button.classList.toggle("is-listening", listening);
    if (feedbackElement) {
      feedbackElement.textContent = listening ? "Listening..." : feedbackElement.textContent;
    }
    if (voiceStatusText) {
      voiceStatusText.textContent = listening ? "Listening…" : voiceStatusText.textContent;
    }
    if (voiceWave) {
      voiceWave.hidden = !listening;
    }
  }

  async function handleTranscript(transcript) {
    if (!transcript) {
      return;
    }

    const normalized = normalizeTranscript(transcript);
    if (feedbackElement) {
      feedbackElement.textContent = `Heard: "${normalized}"`;
    }
    if (voiceStatusText) {
      voiceStatusText.textContent = `Heard: "${normalized}"`;
    }
    if (voiceTranscript) {
      voiceTranscript.textContent = normalized;
    }

    const handledByDefault = routeDefaultVoiceCommand(normalized);
    if (handledByDefault) {
      return;
    }

    if (typeof onCommand === "function") {
      await onCommand(normalized);
    }
  }

  recognition.addEventListener("start", () => {
    heardFinalTranscript = "";
    setListeningState(true);
    if (voicePanel) {
      voicePanel.hidden = false;
    }
    if (voiceTranscript) {
      voiceTranscript.textContent = "Listening for your command…";
    }
  });

  recognition.addEventListener("result", async (event) => {
    let interimTranscript = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = result[0]?.transcript || "";
      if (result.isFinal) {
        heardFinalTranscript += ` ${text}`;
      } else {
        interimTranscript += ` ${text}`;
      }
    }

    const previewTranscript = normalizeTranscript(heardFinalTranscript || interimTranscript);
    if (previewTranscript && voiceTranscript) {
      voiceTranscript.textContent = previewTranscript;
    }

    if (heardFinalTranscript.trim()) {
      await handleTranscript(heardFinalTranscript);
      recognition.stop();
    }
  });

  recognition.addEventListener("error", (event) => {
    setListeningState(false);
    const errors = {
      "not-allowed": "Microphone access was denied. Please allow microphone access and try again.",
      "audio-capture": "No microphone was detected on this device.",
      network: "A network error interrupted voice recognition. Please try again.",
      "no-speech": "No speech was detected. Try speaking a little closer to the microphone.",
    };
    const message = errors[event.error] || "Voice recognition stopped unexpectedly. Please try again.";
    if (feedbackElement) {
      feedbackElement.textContent = message;
    }
    if (voiceStatusText) {
      voiceStatusText.textContent = message;
    }
  });

  recognition.addEventListener("nomatch", () => {
    const message = "I could not match that command. Please try again.";
    if (feedbackElement) {
      feedbackElement.textContent = message;
    }
    if (voiceStatusText) {
      voiceStatusText.textContent = message;
    }
  });

  recognition.addEventListener("end", () => {
    setListeningState(false);
    if (!heardFinalTranscript.trim()) {
      const message = "Voice input ended. Tap the microphone and try again.";
      if (voiceStatusText) {
        voiceStatusText.textContent = message;
      }
      if (feedbackElement) {
        feedbackElement.textContent = message;
      }
    }
  });

  async function startListening() {
    if (!helpShown && voicePanel) {
      voicePanel.hidden = false;
      helpShown = true;
    }
    try {
      recognition.start();
    } catch (_) {
      if (voiceStatusText) {
        voiceStatusText.textContent = "Voice recognition is already active.";
      }
    }
  }

  button.addEventListener("click", startListening);
  document.getElementById("voice-fab")?.addEventListener("click", startListening);
  document.getElementById("voice-panel-close")?.addEventListener("click", () => {
    if (voicePanel) {
      voicePanel.hidden = true;
    }
  });

  return recognition;
}

window.voiceCommands = {
  createVoiceController,
  normalizeTranscript,
};
