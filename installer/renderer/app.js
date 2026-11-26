/* Upscayl-Next modern installer UI */

const $ = (id) => document.getElementById(id);
const STEP_ORDER = [
  "language",
  "welcome",
  "options",
  "download",
  "install",
  "finish",
];

const state = {
  lang:
    typeof window.detectInstallerLanguage === "function"
      ? window.detectInstallerLanguage(navigator.language)
      : "ja",
  defaults: null,
  release: null,
  installDir: "",
  currentStep: "language",
  installing: false,
  doneHandled: false,
  installed: null,
};

const tr = (key, vars) =>
  typeof window.translateInstaller === "function"
    ? window.translateInstaller(state.lang, key, vars)
    : key;

const els = {
  panels: Array.from(document.querySelectorAll(".panel")),
  railSteps: Array.from(document.querySelectorAll(".rail-step")),
  langSelect: $("lang-select"),
  langCards: Array.from(document.querySelectorAll(".lang-card")),
  langContinue: $("lang-continue-btn"),
  welcomeLede: $("welcome-lede"),
  start: $("start-btn"),
  releaseLink: $("release-link"),
  welcomeVersion: $("welcome-version"),
  installDir: $("install-dir"),
  browse: $("browse-btn"),
  desktopShortcut: $("desktop-shortcut"),
  startMenuShortcut: $("start-menu-shortcut"),
  installBackend: $("install-backend"),
  acceptLicense: $("accept-license"),
  install: $("install-btn"),
  back: $("back-btn"),
  licenseLink: $("license-link"),
  downloadPercent: $("download-percent"),
  downloadRing: $("download-ring"),
  downloadReceived: $("download-received"),
  downloadSpeed: $("download-speed"),
  downloadEta: $("download-eta"),
  downloadVersion: $("download-version"),
  downloadBar: $("download-bar"),
  downloadSub: $("download-sub"),
  downloadLog: $("download-log"),
  downloadLogBox: $("download-log-box"),
  installSub: $("install-sub"),
  installLog: $("install-log"),
  installLines: Array.from(document.querySelectorAll(".install-line")),
  finishMessage: $("finish-message"),
  finishMeta: $("finish-meta"),
  launch: $("launch-btn"),
  openFolder: $("open-folder-btn"),
  close2: $("close-win-btn-2"),
  confetti: $("confetti"),
  errorBanner: $("error-banner"),
  errorText: $("error-text"),
  errorClose: $("error-close"),
  statusText: $("status-text"),
  statusRight: $("status-right"),
  min: $("min-btn"),
  close: $("close-win-btn"),
};

function setStatus(text) {
  if (els.statusText) els.statusText.textContent = text;
}

function stepStatusText(step) {
  const map = {
    language: tr("statusLanguage"),
    welcome: tr("statusWelcome"),
    options: tr("statusOptions"),
    download: tr("statusDownload"),
    install: tr("statusInstall"),
    finish: tr("statusFinish"),
  };
  return map[step] || tr("statusPreparing");
}

function applyLanguage(lang) {
  state.lang =
    window.INSTALLER_TRANSLATIONS && window.INSTALLER_TRANSLATIONS[lang]
      ? lang
      : "en";

  document.documentElement.lang = tr("langCode");

  if (els.langSelect) {
    els.langSelect.value = state.lang;
  }

  els.langCards.forEach((card) => {
    const selected = card.dataset.lang === state.lang;
    card.classList.toggle("selected", selected);
    card.setAttribute("aria-checked", selected ? "true" : "false");
  });

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (key) {
      node.textContent = tr(key);
    }
  });

  if (els.welcomeLede) {
    els.welcomeLede.innerHTML = tr("welcomeLede");
  }
  if (els.min) els.min.setAttribute("aria-label", tr("winMin"));
  if (els.close) els.close.setAttribute("aria-label", tr("winClose"));
  if (els.errorClose) els.errorClose.setAttribute("aria-label", tr("winClose"));

  // Refresh dynamic release / finish strings in the newly selected language
  if (state.release) {
    renderReleaseChip(state.release);
  } else if (els.welcomeVersion) {
    els.welcomeVersion.textContent = tr("welcomeChecking");
  }
  if (state.installed) {
    renderFinishSummary(state.installed);
  }
  setStatus(stepStatusText(state.currentStep));
}

function showError(message) {
  if (!els.errorBanner) return;
  els.errorText.textContent = message || tr("errGeneric");
  els.errorBanner.classList.remove("hidden");
}

function hideError() {
  if (els.errorBanner) els.errorBanner.classList.add("hidden");
}

function go(step) {
  if (!STEP_ORDER.includes(step)) return;
  state.currentStep = step;
  const currentIndex = STEP_ORDER.indexOf(step);

  els.panels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === step);
  });
  els.railSteps.forEach((rail) => {
    const index = STEP_ORDER.indexOf(rail.dataset.step);
    rail.classList.toggle("active", index === currentIndex);
    rail.classList.toggle("done", index < currentIndex);
  });
  setStatus(stepStatusText(step));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatSpeed(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "—";
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return tr("etaSoon");
  if (seconds < 60) return tr("etaSec", { s: Math.ceil(seconds) });
  const minutes = Math.floor(seconds / 60);
  const rest = Math.ceil(seconds % 60);
  return tr("etaMinSec", { m: minutes, s: rest });
}

function appendLog(element, line) {
  if (!element || !line) return;
  element.textContent += `${line}\n`;
  const lines = element.textContent.split("\n");
  if (lines.length > 240) {
    element.textContent = lines.slice(-240).join("\n");
  }
  element.scrollTop = element.scrollHeight;
}

function setInstallLine(index, status) {
  els.installLines.forEach((line, lineIndex) => {
    line.classList.toggle("active", lineIndex === index && status === "active");
    line.classList.toggle(
      "done",
      lineIndex < index || (lineIndex === index && status === "done"),
    );
  });
}

function resetProgress() {
  state.doneHandled = false;
  els.downloadPercent.textContent = "0%";
  els.downloadRing.style.strokeDashoffset = "465";
  els.downloadRing.parentElement.parentElement.classList.remove("is-done");
  els.downloadReceived.textContent = "0 MB";
  els.downloadSpeed.textContent = "—";
  els.downloadEta.textContent = "—";
  els.downloadVersion.textContent = state.release
    ? `v${state.release.version}`
    : "—";
  els.downloadBar.style.width = "0%";
  els.downloadSub.textContent = tr("downloadSub");
  els.downloadLog.textContent = "";
  els.installLog.textContent = "";
  els.installLines.forEach((line) => line.classList.remove("active", "done"));
  els.installSub.textContent = tr("installSub");
}

function renderReleaseChip(release) {
  const published = release.publishedAt
    ? new Date(release.publishedAt).toLocaleDateString(tr("dateLocale"))
    : "";
  els.welcomeVersion.textContent = published
    ? tr("welcomeLatestDate", { version: release.version, date: published })
    : tr("welcomeLatest", { version: release.version });
}

function setRelease(release) {
  state.release = release;
  renderReleaseChip(release);
  els.downloadVersion.textContent = `v${release.version}`;
  els.statusRight.textContent = `Upscayl-Next v${release.version}`;
  els.start.disabled = false;
  updateInstallEnabled();
}

function updateInstallEnabled() {
  els.install.disabled =
    state.installing ||
    !state.release ||
    !els.acceptLicense.checked ||
    !state.installDir;
}

async function loadRelease() {
  els.welcomeVersion.textContent = tr("welcomeChecking");
  els.start.disabled = true;
  try {
    const result = await window.installer.getLatestRelease();
    if (!result.success) {
      throw new Error(result.error);
    }
    setRelease(result.release);
    if (state.currentStep === "welcome") {
      setStatus(tr("statusReleaseChecked"));
    }
  } catch (error) {
    els.welcomeVersion.textContent = tr("welcomeLoadError");
    showError(tr("errReleaseManual", { message: error.message }));
    setStatus(tr("statusReleaseError"));
  }
}

async function startInstall() {
  if (state.installing) return;
  if (!state.release) {
    showError(tr("errReleaseWait"));
    return;
  }
  if (!els.acceptLicense.checked) {
    showError(tr("errAcceptLicense"));
    return;
  }

  hideError();
  state.installing = true;
  state.doneHandled = false;
  updateInstallEnabled();
  resetProgress();
  go("download");
  setStatus(tr("statusDownloadStarting"));

  const options = {
    installDir: state.installDir,
    desktopShortcut: els.desktopShortcut.checked,
    startMenuShortcut: els.startMenuShortcut.checked,
    installBackend: els.installBackend.checked,
    acceptLicense: els.acceptLicense.checked,
    language: state.lang,
  };

  try {
    const result = await window.installer.startInstall(options);
    if (!result.success && !state.doneHandled) {
      state.doneHandled = true;
      state.installing = false;
      updateInstallEnabled();
      showError(result.error || tr("errInstallFailed"));
      go("options");
    }
  } catch (error) {
    if (!state.doneHandled) {
      state.doneHandled = true;
      state.installing = false;
      updateInstallEnabled();
      showError(error.message || tr("errInstallFailed"));
      go("options");
    }
  }
}

const RING_LENGTH = 465;

function onProgress(progress) {
  if (!progress) return;
  if (progress.message) setStatus(progress.message);

  switch (progress.phase) {
    case "metadata":
      break;
    case "download": {
      if (state.currentStep !== "download") go("download");
      const percent =
        typeof progress.percent === "number"
          ? Math.max(0, Math.min(100, progress.percent))
          : 0;
      els.downloadPercent.textContent = `${Math.round(percent)}%`;
      els.downloadRing.style.strokeDashoffset = `${
        RING_LENGTH * (1 - percent / 100)
      }`;
      els.downloadBar.style.width = `${percent}%`;
      if (typeof progress.received === "number") {
        els.downloadReceived.textContent = formatBytes(progress.received);
      }
      if (typeof progress.total === "number" && progress.total > 0) {
        els.downloadSub.textContent = `${formatBytes(
          progress.received,
        )} / ${formatBytes(progress.total)}`;
      }
      els.downloadSpeed.textContent = formatSpeed(progress.speed);
      els.downloadEta.textContent = formatEta(progress.eta);
      if (percent >= 100) {
        els.downloadRing.parentElement.parentElement.classList.add("is-done");
      }
      break;
    }
    case "verify":
      go("install");
      setInstallLine(0, "active");
      els.installSub.textContent = tr("phaseVerify");
      break;
    case "extract":
      go("install");
      setInstallLine(0, "active");
      els.installSub.textContent = tr("phaseExtract");
      break;
    case "copy":
      go("install");
      setInstallLine(0, "active");
      els.installSub.textContent = tr("phaseCopy");
      break;
    case "shortcuts":
      go("install");
      setInstallLine(1, "active");
      els.installSub.textContent = tr("phaseShortcuts");
      break;
    case "uninstaller":
      go("install");
      setInstallLine(2, "active");
      els.installSub.textContent = tr("phaseUninstaller");
      break;
    case "backend":
      go("install");
      setInstallLine(3, "active");
      els.installSub.textContent = progress.message || tr("phaseBackend");
      break;
    case "done":
      els.installLines.forEach((line) => line.classList.add("done"));
      break;
    default:
      break;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function launchConfetti() {
  if (!els.confetti) return;
  els.confetti.innerHTML = "";
  const colors = ["#8b5cf6", "#ec4899", "#6ee7b7", "#fbbf24", "#c4b5fd"];
  for (let index = 0; index < 36; index += 1) {
    const piece = document.createElement("span");
    piece.style.background = colors[index % colors.length];
    piece.style.left = `${44 + Math.random() * 12}%`;
    piece.style.setProperty("--dx", `${(Math.random() - 0.5) * 280}px`);
    piece.style.setProperty("--rot", `${(Math.random() - 0.5) * 720}deg`);
    piece.style.animationDelay = `${Math.random() * 0.35}s`;
    piece.style.width = `${5 + Math.random() * 5}px`;
    piece.style.height = `${8 + Math.random() * 8}px`;
    els.confetti.appendChild(piece);
  }
  window.setTimeout(() => {
    if (els.confetti) els.confetti.innerHTML = "";
  }, 2400);
}

function renderFinishSummary(result) {
  els.finishMessage.textContent = tr("finishReady", { version: result.version });
  const backend =
    result.backend && result.backend.ok
      ? tr("finishBackendOk")
      : result.backend
        ? tr("finishBackendWarn", { message: result.backend.message })
        : tr("finishBackendSkip");
  els.finishMeta.innerHTML =
    `<span>${escapeHtml(tr("finishMetaVersion"))}: <strong>v${escapeHtml(result.version)}</strong></span>` +
    `<span>${escapeHtml(tr("finishMetaDir"))}: <strong>${escapeHtml(result.installDir)}</strong></span>` +
    `<span>${escapeHtml(backend)}</span>`;
}

function onDone(result) {
  if (state.doneHandled) return;
  state.doneHandled = true;
  state.installing = false;
  updateInstallEnabled();

  if (!result || !result.success) {
    showError((result && result.error) || tr("errInstallRetry"));
    setStatus(tr("statusInstallFailed"));
    go("options");
    return;
  }

  state.installed = result;
  renderFinishSummary(result);
  els.launch.disabled = false;
  els.openFolder.disabled = false;
  go("finish");
  setStatus(tr("statusInstallDone"));
  launchConfetti();
}

els.langCards.forEach((card) => {
  card.addEventListener("click", () => {
    applyLanguage(card.dataset.lang);
  });
  card.addEventListener("dblclick", () => {
    applyLanguage(card.dataset.lang);
    hideError();
    go("welcome");
  });
});

if (els.langSelect) {
  els.langSelect.addEventListener("change", (event) => {
    applyLanguage(event.target.value);
  });
}

if (els.langContinue) {
  els.langContinue.addEventListener("click", () => {
    hideError();
    go("welcome");
  });
}

els.start.addEventListener("click", () => {
  hideError();
  go("options");
});

els.releaseLink.addEventListener("click", () => {
  const url =
    (state.release && state.release.htmlUrl) ||
    "https://github.com/yu7783/Upscayl-Next/releases/latest";
  window.installer.openUrl(url);
});

els.licenseLink.addEventListener("click", () => {
  window.installer.openUrl(
    "https://github.com/yu7783/Upscayl-Next/blob/main/LICENSE",
  );
});

els.browse.addEventListener("click", async () => {
  const selected = await window.installer.selectFolder(state.installDir);
  if (selected) {
    state.installDir = selected;
    els.installDir.value = selected;
    updateInstallEnabled();
  }
});

els.acceptLicense.addEventListener("change", updateInstallEnabled);
els.install.addEventListener("click", startInstall);
els.back.addEventListener("click", () => go("welcome"));

els.launch.addEventListener("click", async () => {
  const installDir =
    (state.installed && state.installed.installDir) || state.installDir;
  if (!installDir) return;
  const result = await window.installer.launchApp(installDir);
  if (!result.success) {
    showError(result.error || tr("errLaunch"));
  } else {
    setStatus(tr("statusLaunched"));
  }
});

els.openFolder.addEventListener("click", async () => {
  const installDir =
    (state.installed && state.installed.installDir) || state.installDir;
  if (!installDir) return;
  const result = await window.installer.openFolder(installDir);
  if (!result.success) {
    showError(result.error || tr("errOpenFolder"));
  }
});

els.close.addEventListener("click", () => window.installer.close());
els.close2.addEventListener("click", () => window.installer.close());
els.min.addEventListener("click", () => window.installer.minimize());
els.errorClose.addEventListener("click", hideError);

window.installer.onProgress(onProgress);
window.installer.onLog((line) => {
  appendLog(els.downloadLog, line);
  appendLog(els.installLog, line);
});
window.installer.onDone(onDone);

async function init() {
  applyLanguage(state.lang);
  go("language");
  try {
    const defaults = await window.installer.getDefaults();
    state.defaults = defaults;
    state.installDir = defaults.defaultInstallDir;
    els.installDir.value = defaults.defaultInstallDir;
    els.statusRight.textContent = `Installer v${defaults.installerVersion}`;
  } catch (error) {
    showError(tr("errInit"));
  }
  updateInstallEnabled();
  await loadRelease();
}

init();
