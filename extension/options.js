import {
  clearProjectRootHandle,
  getProjectRootHandle,
  saveProjectRootHandle,
  verifyHandlePermission
} from "./fs-access.js";

const form = document.getElementById("settings-form");
const statusNode = document.getElementById("status");
const projectPathNode = document.getElementById("projectPath");
const pickProjectDirButton = document.getElementById("pickProjectDir");
const clearProjectDirButton = document.getElementById("clearProjectDir");
const githubTokenInput = document.getElementById("githubToken");

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.style.color = isError ? "#ff8f8f" : "#adb4bf";
}

async function refreshProjectPath() {
  const rootHandle = await getProjectRootHandle();
  if (!rootHandle) {
    projectPathNode.textContent = "未选择项目目录";
    return;
  }

  const hasPermission = await verifyHandlePermission(rootHandle, true);
  projectPathNode.textContent = hasPermission
    ? `${rootHandle.name} / data / items`
    : `${rootHandle.name}（权限失效，请重新选择）`;
}

async function hydrate() {
  const settings = await chrome.storage.sync.get([
    "defaultSource",
    "targetMode",
    "githubOwner",
    "githubRepo"
  ]);
  const secretSettings = await chrome.storage.local.get(["githubToken"]);

  document.getElementById("defaultSource").value = settings.defaultSource || "";
  const targetModeInput = document.querySelector(`input[name="targetMode"][value="${settings.targetMode || "local"}"]`);
  if (targetModeInput) {
    targetModeInput.checked = true;
  }
  document.getElementById("githubOwner").value = settings.githubOwner || "yimingdiary";
  document.getElementById("githubRepo").value = settings.githubRepo || "PromptPick";
  githubTokenInput.placeholder = secretSettings.githubToken ? "已保存，留空则不变" : "需要 issues:write 权限";
  await refreshProjectPath();
}

pickProjectDirButton.addEventListener("click", async () => {
  try {
    if (!window.showDirectoryPicker) {
      throw new Error("当前浏览器不支持目录授权 API。");
    }

    const rootHandle = await window.showDirectoryPicker({
      id: "promptnest-project-root",
      mode: "readwrite"
    });

    const hasPermission = await verifyHandlePermission(rootHandle, true);
    if (!hasPermission) {
      throw new Error("未授予目录写入权限。");
    }

    await saveProjectRootHandle(rootHandle);
    await refreshProjectPath();
    setStatus("项目目录已连接。");
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }
    setStatus(error instanceof Error ? error.message : "目录选择失败。", true);
  }
});

clearProjectDirButton.addEventListener("click", async () => {
  await clearProjectRootHandle();
  await refreshProjectPath();
  setStatus("目录授权已清除。");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const targetMode = document.querySelector('input[name="targetMode"]:checked')?.value || "local";
    const githubOwner = document.getElementById("githubOwner").value.trim();
    const githubRepo = document.getElementById("githubRepo").value.trim();
    const githubToken = githubTokenInput.value.trim();

    await chrome.storage.sync.set({
      defaultSource: document.getElementById("defaultSource").value.trim(),
      targetMode,
      githubOwner,
      githubRepo
    });

    if (githubToken) {
      await chrome.storage.local.set({ githubToken });
      githubTokenInput.value = "";
      githubTokenInput.placeholder = "已保存，留空则不变";
    }

    setStatus("设置已保存。");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "设置保存失败。", true);
  }
});

void hydrate();
