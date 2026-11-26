const test = require("node:test");
const assert = require("node:assert/strict");

const {
  INSTALLER_LANGUAGES,
  INSTALLER_TRANSLATIONS,
  detectInstallerLanguage,
  translateInstaller,
} = require("../installer/renderer/i18n.js");

test("installer i18n defines complete identical key sets across all supported languages", () => {
  const baseKeys = Object.keys(INSTALLER_TRANSLATIONS.en).sort();
  assert.ok(baseKeys.length >= 60);

  for (const lang of INSTALLER_LANGUAGES) {
    const dict = INSTALLER_TRANSLATIONS[lang.code];
    assert.ok(dict, `Missing dictionary for ${lang.code}`);
    const keys = Object.keys(dict).sort();
    assert.deepEqual(
      keys,
      baseKeys,
      `Translation keys mismatch for installer language "${lang.code}"`,
    );
  }
});

test("detectInstallerLanguage maps OS locales to supported installer languages", () => {
  assert.equal(detectInstallerLanguage("ja-JP"), "ja");
  assert.equal(detectInstallerLanguage("en-US"), "en");
  assert.equal(detectInstallerLanguage("zh-CN"), "zh");
  assert.equal(detectInstallerLanguage("ko-KR"), "ko");
  assert.equal(detectInstallerLanguage("fr-FR"), "en");
});

test("translateInstaller interpolates placeholders and falls back cleanly", () => {
  assert.equal(
    translateInstaller("ja", "welcomeLatest", { version: "2.0.0" }),
    "最新版 v2.0.0",
  );
  assert.equal(
    translateInstaller("en", "welcomeLatest", { version: "2.0.0" }),
    "Latest v2.0.0",
  );
  assert.equal(
    translateInstaller("unknown", "langContinue"),
    "Continue",
  );
});
