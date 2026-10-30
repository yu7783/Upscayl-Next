/* Upscayl-Next modern installer UI */

const $ = (id) => document.getElementById(id);
const STEP_ORDER = ["welcome", "options", "download", "install", "finish"];

const state = {
  defaults: null,
  release: null,
  installDir: "",
  currentStep: "welcome",
  installing: false,
  doneHandled: false,
  installed: null,
};

const els = {
  panels: Array.from(document.querySelectorAll(".panel")),
  railSteps: Array.from(document.querySelectorAll(".rail-step")),
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

function showError(message) {
  if (!els.errorBanner) return;
  els.errorText.textContent = message || "処理に失敗しました。";
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
  setStatus(
    {
      welcome: "ようこそ",
      options: "インストール設定",
      download: "ダウンロード中",
      install: "インストール中",
      finish: "完了",
    }[step],
  );
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
  if (!Number.isFinite(seconds) || seconds <= 0) return "まもなく";
  if (seconds < 60) return `${Math.ceil(seconds)} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.ceil(seconds % 60);
  return `${minutes} 分 ${rest} 秒`;
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
  els.downloadSub.textContent =
    "GitHub から最新のポータブル版を取得します。";
  els.downloadLog.textContent = "";
  els.installLog.textContent = "";
  els.installLines.forEach((line) => line.classList.remove("active", "done"));
  els.installSub.textContent = "ファイルを展開しています…";
}

function setRelease(release) {
  state.release = release;
  const published = release.publishedAt
    ? new Date(release.publishedAt).toLocaleDateString("ja-JP")
    : "";
  els.welcomeVersion.textContent = published
    ? `最新版 v${release.version} · ${published}`
    : `最新版 v${release.version}`;
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
  els.welcomeVersion.textContent = "最新リリースを確認しています…";
  els.start.disabled = true;
  try {
    const result = await window.installer.getLatestRelease();
    if (!result.success) {
      throw new Error(result.error);
    }
    setRelease(result.release);
    setStatus("最新版を確認しました");
  } catch (error) {
    els.welcomeVersion.textContent =
      "最新リリースを取得できませんでした。接続を確認してください。";
    showError(
      `${error.message} GitHub のリリースページから手動でダウンロードすることもできます。`,
    );
    setStatus("リリース取得エラー");
  }
}

async function startInstall() {
  if (state.installing) return;
  if (!state.release) {
    showError("最新リリースの取得が完了していません。少し待ってから再試行してください。");
    return;
  }
  if (!els.acceptLicense.checked) {
    showError("AGPL-3.0ライセンスとクレジットへの同意が必要です。");
    return;
  }

  hideError();
  state.installing = true;
  state.doneHandled = false;
  updateInstallEnabled();
  resetProgress();
  go("download");
  setStatus("ダウンロードを開始しています…");

  const options = {
    installDir: state.installDir,
    desktopShortcut: els.desktopShortcut.checked,
    startMenuShortcut: els.startMenuShortcut.checked,
    installBackend: els.installBackend.checked,
    acceptLicense: els.acceptLicense.checked,
  };

  try {
    const result = await window.installer.startInstall(options);
    if (!result.success && !state.doneHandled) {
      state.doneHandled = true;
      state.installing = false;
      updateInstallEnabled();
      showError(result.error || "インストールに失敗しました。");
      go("options");
    }
  } catch (error) {
    if (!state.doneHandled) {
      state.doneHandled = true;
      state.installing = false;
      updateInstallEnabled();
      showError(error.message || "インストールに失敗しました。");
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
      els.installSub.textContent = "ダウンロードを検証しています…";
      break;
    case "extract":
      go("install");
      setInstallLine(0, "active");
      els.installSub.textContent =
        "アプリケーションファイルを展開しています…";
      break;
    case "copy":
      go("install");
      setInstallLine(0, "active");
      els.installSub.textContent = "Upscayl-Next をインストールしています…";
      break;
    case "shortcuts":
      go("install");
      setInstallLine(1, "active");
      els.installSub.textContent = "ショートカットを作成しています…";
      break;
    case "uninstaller":
      go("install");
      setInstallLine(2, "active");
      els.installSub.textContent = "アンインストーラーを登録しています…";
      break;
    case "backend":
      go("install");
      setInstallLine(3, "active");
      els.installSub.textContent =
        progress.message ||
        "オプションのAIバックエンドをインストールしています…";
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

function onDone(result) {
  if (state.doneHandled) return;
  state.doneHandled = true;
  state.installing = false;
  updateInstallEnabled();

  if (!result || !result.success) {
    showError(
      (result && result.error) ||
        "インストールに失敗しました。ネットワーク接続を確認して再試行してください。",
    );
    setStatus("インストール失敗");
    go("options");
    return;
  }

  state.installed = result;
  els.finishMessage.textContent = `Upscayl-Next v${result.version} の準備ができました。`;
  const backend =
    result.backend && result.backend.ok
      ? "AIバックエンド: インストール済み"
      : result.backend
        ? `AIバックエンド: 未完了（${result.backend.message}）`
        : "AIバックエンド: スキップ";
  els.finishMeta.innerHTML =
    `<span>バージョン: <strong>v${escapeHtml(result.version)}</strong></span>` +
    `<span>インストール先: <strong>${escapeHtml(result.installDir)}</strong></span>` +
    `<span>${escapeHtml(backend)}</span>`;
  els.launch.disabled = false;
  els.openFolder.disabled = false;
  go("finish");
  setStatus("インストール完了");
  launchConfetti();
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
    showError(result.error || "Upscayl-Next を起動できませんでした。");
  } else {
    setStatus("Upscayl-Next を起動しました");
  }
});

els.openFolder.addEventListener("click", async () => {
  const installDir =
    (state.installed && state.installed.installDir) || state.installDir;
  if (!installDir) return;
  const result = await window.installer.openFolder(installDir);
  if (!result.success) {
    showError(result.error || "フォルダを開けませんでした。");
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
  go("welcome");
  try {
    const defaults = await window.installer.getDefaults();
    state.defaults = defaults;
    state.installDir = defaults.defaultInstallDir;
    els.installDir.value = defaults.defaultInstallDir;
    els.statusRight.textContent = `Installer v${defaults.installerVersion}`;
  } catch (error) {
    showError("インストーラーの初期化に失敗しました。");
  }
  updateInstallEnabled();
  await loadRelease();
}

init();

