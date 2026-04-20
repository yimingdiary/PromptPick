import {
  buildItemId,
  ensureProjectFiles,
  getProjectRootHandle,
  readJsonFile,
  verifyHandlePermission,
  writeBlobFile,
  writeJsonFile
} from "./fs-access.js";

const statusNode = document.getElementById("status");
const submitButton = document.getElementById("submit");
const form = document.getElementById("collector-form");
const pageTitleNode = document.getElementById("page-title");
const configStateNode = document.getElementById("config-state");
const destinationModeNode = document.getElementById("destination-mode");
const destinationTargetNode = document.getElementById("destination-target");
const destinationBannerNode = document.getElementById("destination-banner");
const refreshButton = document.getElementById("refresh");
const openSettingsButton = document.getElementById("open-settings");
const ORIGINAL_MAX_EDGE = 2400;
const THUMBNAIL_MAX_EDGE = 720;
const PAGE_COLLECT_TIMEOUT_MS = 6500;
const PAGE_COLLECT_POLL_MS = 180;

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.style.color = isError ? "#ff8f8f" : "#adb4bf";
}

async function readSettings() {
  const [settings, secretSettings] = await Promise.all([
    chrome.storage.sync.get(["defaultSource", "targetMode", "githubOwner", "githubRepo"]),
    chrome.storage.local.get(["githubToken"])
  ]);

  return {
    targetMode: settings.targetMode || "local",
    defaultSource: settings.defaultSource || "",
    githubOwner: settings.githubOwner || "yimingdiary",
    githubRepo: settings.githubRepo || "PromptPick",
    githubToken: secretSettings.githubToken || ""
  };
}

async function updateConfigState() {
  const settings = await readSettings();

  if (settings.targetMode === "github") {
    const target = `${settings.githubOwner || "未配置 owner"}/${settings.githubRepo || "未配置 repo"}`;
    destinationModeNode.textContent = "采集到 GitHub 仓库";
    destinationTargetNode.textContent = target;
    destinationBannerNode.dataset.mode = "github";
    submitButton.textContent = "提交到 GitHub";

    if (!settings.githubOwner || !settings.githubRepo || !settings.githubToken) {
      configStateNode.textContent = "GitHub 配置不完整";
      configStateNode.style.color = "#ffb86c";
      return null;
    }

    configStateNode.textContent = `GitHub: ${target} / collect issue`;
    configStateNode.style.color = "#f4f6fb";
    return { type: "github", settings };
  }

  destinationModeNode.textContent = "采集到本地项目";
  destinationBannerNode.dataset.mode = "local";
  submitButton.textContent = "写入本地项目";

  const rootHandle = await getProjectRootHandle();
  if (!rootHandle) {
    destinationTargetNode.textContent = "未选择项目目录";
    configStateNode.textContent = "未选择项目目录";
    configStateNode.style.color = "#ffb86c";
    return null;
  }

  const hasPermission = await verifyHandlePermission(rootHandle, true);
  if (!hasPermission) {
    destinationTargetNode.textContent = `${rootHandle.name}（权限失效）`;
    configStateNode.textContent = "目录权限失效";
    configStateNode.style.color = "#ff8f8f";
    return null;
  }

  destinationTargetNode.textContent = `${rootHandle.name} / data / items`;
  configStateNode.textContent = `本地: ${rootHandle.name}`;
  configStateNode.style.color = "#f4f6fb";
  return { type: "local", rootHandle, settings };
}

async function collectFromPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    pageTitleNode.textContent = "未找到当前标签页";
    return;
  }

  setStatus("正在识别当前页面...");

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [{ timeoutMs: PAGE_COLLECT_TIMEOUT_MS, pollMs: PAGE_COLLECT_POLL_MS }],
    func: async ({ timeoutMs, pollMs }) => {
      const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

      const extract = () => {
        const textFrom = (selectors) => {
          for (const selector of selectors) {
            const node = document.querySelector(selector);
            const value = node?.innerText?.trim();
            if (value) {
              return value;
            }
          }
          return "";
        };

      const attrFrom = (selectors, attribute) => {
        for (const selector of selectors) {
          const node = document.querySelector(selector);
          const value = node?.getAttribute?.(attribute)?.trim();
          if (value) {
            return value;
          }
          if (attribute === "src" && node?.src) {
            return node.src.trim();
          }
        }
        return "";
      };

      const parseResolution = (value) => {
        if (!value) {
          return { width: null, height: null };
        }

        const match = value.match(/(\d+)\s*[x×]\s*(\d+)/i);
        if (!match) {
          return { width: null, height: null };
        }

        return {
          width: Number(match[1]),
          height: Number(match[2])
        };
      };

      const isAvatarImage = (node) => {
        const classTrail = [
          node.className,
          node.parentElement?.className,
          node.parentElement?.parentElement?.className
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          classTrail.includes("avatar") ||
          classTrail.includes("user-profile") ||
          Boolean(node.closest("[class*='avatar'], [class*='user-profile'], [class*='user-section']"))
        );
      };

      const imageSrcFromNode = (node) => {
        if (!(node instanceof HTMLImageElement) || isAvatarImage(node)) {
          return "";
        }

        return node.currentSrc?.trim() || node.src?.trim() || node.getAttribute("src")?.trim() || "";
      };

      const previewImageFrom = (selectors) => {
        for (const selector of selectors) {
          const nodes = document.querySelectorAll(selector);
          for (const node of nodes) {
            const value = imageSrcFromNode(node);
            if (value) {
              return value;
            }
          }
        }
        return "";
      };

      const findLargestPreviewImage = () => {
        const candidates = Array.from(document.images)
          .map((node) => {
            const value = imageSrcFromNode(node);
            if (!value) {
              return null;
            }

            const rect = node.getBoundingClientRect();
            const visibleArea = Math.max(0, rect.width) * Math.max(0, rect.height);
            const naturalArea = Math.max(0, node.naturalWidth) * Math.max(0, node.naturalHeight);
            const inPreview =
              node.closest(
                "[class*='image-player'], [class*='image-left-content'], [class*='context-menu-trigger']"
              ) !== null;
            const score = Math.max(visibleArea, naturalArea) + (inPreview ? 1_000_000_000 : 0);

            return { value, score };
          })
          .filter(Boolean)
          .sort((left, right) => right.score - left.score);

        return candidates[0]?.value || "";
      };

      const collectReferenceImageUrls = (mainImageUrl) => {
        const urls = [];
        const seen = new Set();
        const addUrl = (node) => {
          const value = imageSrcFromNode(node);
          if (!value || value === mainImageUrl || seen.has(value)) {
            return;
          }

          seen.add(value);
          urls.push(value);
        };

        const containers = document.querySelectorAll(
          ".prompt-tags-HZ34uU, .prompt-tags-Ixl0vJ, [class*='prompt-tags-']"
        );
        for (const container of containers) {
          const nodes = container.querySelectorAll(
            ".container-nSiKjY img, [class*='container-'] [class*='img-container-'] img, [class*='img-container-'] img"
          );
          nodes.forEach(addUrl);
        }

        return urls;
      };

      const imageUrl =
        previewImageFrom([
          'img[data-apm-action="ai-generated-image-detail-card"]',
          ".image-player-content-Ml9sbe img.image-eTuIBd",
          ".image-player-container-V9ZRXE img.image-eTuIBd",
          ".image-left-content-myH1iF img.image-eTuIBd",
          ".context-menu-trigger-container-w5xaCZ img.image-eTuIBd",
          ".container-bbbsvQ img.image-eTuIBd",
          "img.image-eTuIBd"
        ]) ||
        findLargestPreviewImage() ||
        attrFrom(['meta[property="og:image"]'], "content");
      const referenceImageUrls = collectReferenceImageUrls(imageUrl);

      const prompt =
        textFrom([
          ".prompt-value-container-lIP4pF",
          "[class*='prompt-value-container-']",
          "[class*='prompt-text-']",
          "[data-testid='prompt-value']"
        ]) ||
        window.getSelection()?.toString().trim() ||
        "";

      let model = "";
      let ratio = "";
      let resolution = "";

      const tagsContainer = document.querySelector(
        ".prompt-tags-HZ34uU, .prompt-tags-Ixl0vJ, [class*='prompt-tags-']"
      );
      if (tagsContainer) {
        const tagTexts = Array.from(tagsContainer.children)
          .filter((node) => !node.querySelector?.("img"))
          .map((node) => node.innerText?.trim())
          .filter((value) => value && value !== "更多" && value !== "智能参考");
        if (tagTexts.length >= 1) model = tagTexts[0];
        if (tagTexts.length >= 2) ratio = tagTexts[1];
        if (tagTexts.length >= 3) resolution = tagTexts[2];
      }

      if (!resolution) {
        const moreInfoItems = document.querySelectorAll(
          ".more-info-item-aHFd3Y, [class*='more-info-item-']"
        );

        for (const item of moreInfoItems) {
          const label = item.querySelector(
            ".more-info-item-label-I7RrT4, [class*='more-info-item-label-']"
          );
          if (label?.innerText?.includes("分辨率")) {
            const value = item.querySelector(
              ".more-info-item-value-DF7Q3c, [class*='more-info-item-value-']"
            );
            if (value?.innerText?.trim()) {
              resolution = value.innerText.trim();
              break;
            }
          }
        }
      }

      if (!resolution) {
        resolution = textFrom([
          ".more-info-item-value-DF7Q3c",
          "[class*='more-info-item-value-']"
        ]);
      }

      const normalizedResolution = resolution || "2K";
      const { width, height } = parseResolution(normalizedResolution);
      const author = textFrom([
        ".user-name-UPyK2X",
        "[class*='user-name-']"
      ]);
      const collectedAt = textFrom([
        ".create-time-wrapper-fqUhx0",
        "[class*='create-time-wrapper-']"
      ]);

      return {
        title: document.title,
        sourceUrl: location.href.split("?")[0],
        imageUrl,
        referenceImageUrls,
        prompt,
        model,
        ratio,
        resolution: normalizedResolution,
        width,
        height,
        author,
        collectedAt
      };
      };

      const hasUsefulContent = (value) => Boolean(value?.prompt || value?.imageUrl);
      const deadline = Date.now() + timeoutMs;
      let result = extract();

      while (!hasUsefulContent(result) && Date.now() < deadline) {
        await wait(pollMs);
        result = extract();
      }

      return result;
    }
  });

  if (!result) {
    pageTitleNode.textContent = "无法识别当前页面";
    return;
  }

  pageTitleNode.textContent = result.title || "未命名页面";
  document.getElementById("title").value = result.title ?? "";
  document.getElementById("sourceUrl").value = result.sourceUrl ?? "";
  document.getElementById("imageUrl").value = result.imageUrl ?? "";
  document.getElementById("prompt").value = result.prompt ?? "";
  document.getElementById("model").value = result.model ?? "";
  document.getElementById("ratio").value = result.ratio ?? "";
  form.dataset.resolution = result.resolution ?? "2K";
  form.dataset.width = result.width != null ? String(result.width) : "";
  form.dataset.height = result.height != null ? String(result.height) : "";
  form.dataset.author = result.author ?? "";
  form.dataset.collectedAt = result.collectedAt ?? "";
  form.dataset.referenceImageUrls = JSON.stringify(result.referenceImageUrls ?? []);
}

async function hydrateState() {
  await updateConfigState();
  await collectFromPage();
}

function normalizeDateTime(value, fallback) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return fallback;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }

  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) {
    return fallback;
  }

  return new Date(timestamp).toISOString();
}

function readReferenceImageUrlsFromForm() {
  try {
    const parsed = JSON.parse(form.dataset.referenceImageUrls || "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }

    return Array.from(
      new Set(parsed.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean))
    );
  } catch {
    return [];
  }
}

function buildPayload(settings) {
  const now = new Date().toISOString();

  return {
    source: settings.defaultSource || "manual-collector",
    sourceUrl: document.getElementById("sourceUrl").value.trim(),
    title: document.getElementById("title").value.trim(),
    prompt: document.getElementById("prompt").value.trim(),
    negativePrompt: document.getElementById("negativePrompt").value.trim(),
    model: document.getElementById("model").value.trim(),
    ratio: document.getElementById("ratio").value.trim(),
    resolution: form.dataset.resolution || "2K",
    width: form.dataset.width ? Number(form.dataset.width) : null,
    height: form.dataset.height ? Number(form.dataset.height) : null,
    imageUrl: document.getElementById("imageUrl").value.trim(),
    referenceImageUrls: readReferenceImageUrlsFromForm(),
    author: form.dataset.author || "unknown",
    collectedAt: normalizeDateTime(form.dataset.collectedAt, now),
    tags: document
      .getElementById("tags")
      .value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
  };
}

function getMonthFolder(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 7);
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getImageExtension(contentType, imageUrl) {
  const normalizedType = contentType.split(";")[0].trim().toLowerCase();
  const typeExtension = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif"
  }[normalizedType];

  if (typeExtension) {
    return typeExtension;
  }

  try {
    const pathname = new URL(imageUrl).pathname;
    const match = pathname.match(/\.([a-z0-9]{2,5})(?:$|[/?#])/i);
    if (match?.[1]) {
      return match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
    }
  } catch {
    // Fall back below.
  }

  return "webp";
}

function getScaledSize(width, height, maxEdge) {
  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  };
}

function canvasToBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type, quality });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("图片缩略图生成失败。"));
      },
      type,
      quality
    );
  });
}

async function resizeImageBlob(blob, maxEdge, type, quality) {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = getScaledSize(bitmap.width, bitmap.height, maxEdge);
  const canvas =
    typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close?.();
    throw new Error("图片缩略图生成失败：无法创建画布。");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return canvasToBlob(canvas, type, quality);
}

async function downloadImageBlob(imageUrl) {
  const response = await fetch(imageUrl, {
    headers: {
      accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8"
    },
    credentials: "omit",
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`图片下载失败：HTTP ${response.status}`);
  }

  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("图片下载失败：返回内容不是图片。");
  }

  return blob;
}

async function saveImageAsset(imagesHandle, imageUrl, baseFileName, collectedAt, directoryName = "") {
  const blob = await downloadImageBlob(imageUrl);
  const monthFolder = getMonthFolder(collectedAt);
  const monthHandle = await imagesHandle.getDirectoryHandle(monthFolder, { create: true });
  const targetHandle = directoryName
    ? await monthHandle.getDirectoryHandle(directoryName, { create: true })
    : monthHandle;
  const thumbsHandle = await targetHandle.getDirectoryHandle("thumbs", { create: true });
  const extension = getImageExtension(blob.type, imageUrl);
  const originalBlob = await resizeImageBlob(blob, ORIGINAL_MAX_EDGE, "image/webp", 0.88);
  const thumbnailBlob = await resizeImageBlob(blob, THUMBNAIL_MAX_EDGE, "image/webp", 0.78);
  const fileName = `${baseFileName}.${extension === "gif" ? "gif" : "webp"}`;
  const thumbnailFileName = `${baseFileName}.webp`;
  const imageHandle = await targetHandle.getFileHandle(fileName, { create: true });
  const thumbnailHandle = await thumbsHandle.getFileHandle(thumbnailFileName, { create: true });
  await writeBlobFile(imageHandle, extension === "gif" ? blob : originalBlob);
  await writeBlobFile(thumbnailHandle, thumbnailBlob);

  const publicDirectory = directoryName ? `${monthFolder}/${directoryName}` : monthFolder;
  return {
    image: `/images/${publicDirectory}/${fileName}`,
    thumbnail: `/images/${publicDirectory}/thumbs/${thumbnailFileName}`
  };
}

async function saveImageToProject(imagesHandle, payload, id, collectedAt) {
  return saveImageAsset(imagesHandle, payload.imageUrl, id, collectedAt);
}

async function saveReferenceImagesToProject(imagesHandle, payload, id, collectedAt) {
  const urls = Array.isArray(payload.referenceImageUrls) ? payload.referenceImageUrls : [];
  const uniqueUrls = Array.from(new Set(urls.filter((url) => url && url !== payload.imageUrl)));
  const referenceImages = [];

  for (const [index, imageUrl] of uniqueUrls.entries()) {
    const localImages = await saveImageAsset(
      imagesHandle,
      imageUrl,
      `${id}-ref-${index + 1}`,
      collectedAt,
      "references"
    );

    referenceImages.push({
      imageUrl,
      image: localImages.image,
      thumbnail: localImages.thumbnail,
      label: "智能参考"
    });
  }

  return referenceImages;
}

async function writeItemToProject(rootHandle, payload) {
  const { itemsHandle, indexHandle, imagesHandle } = await ensureProjectFiles(rootHandle);
  const id = buildItemId(payload.title);
  const createdAt = new Date().toISOString();
  const collectedAt = normalizeDateTime(payload.collectedAt, createdAt);
  const localImages = await saveImageToProject(imagesHandle, payload, id, collectedAt);
  const referenceImages = await saveReferenceImagesToProject(imagesHandle, payload, id, collectedAt);

  const itemRecord = {
    id,
    title: payload.title,
    source: payload.source,
    sourceUrl: payload.sourceUrl,
    author: payload.author,
    license: "unknown",
    prompt: payload.prompt,
    negativePrompt: payload.negativePrompt,
    model: payload.model || "unknown",
    sampler: "",
    steps: null,
    cfg: null,
    seed: null,
    ratio: payload.ratio || "",
    resolution: payload.resolution || "2K",
    width: payload.width,
    height: payload.height,
    tags: payload.tags,
    image: localImages.image,
    thumbnail: localImages.thumbnail,
    imageUrl: payload.imageUrl,
    referenceImageUrls: payload.referenceImageUrls,
    referenceImages,
    status: "done",
    collectedAt,
    capturedAt: createdAt,
    createdAt,
    updatedAt: createdAt
  };

  const itemHandle = await itemsHandle.getFileHandle(`${id}.json`, { create: true });
  await writeJsonFile(itemHandle, itemRecord);

  const currentIndex = await readJsonFile(indexHandle, []);
  const nextEntry = {
    id,
    title: itemRecord.title,
    prompt: itemRecord.prompt,
    model: itemRecord.model,
    ratio: itemRecord.ratio,
    resolution: itemRecord.resolution,
    width: itemRecord.width,
    height: itemRecord.height,
    tags: itemRecord.tags,
    image: itemRecord.thumbnail,
    sourceUrl: itemRecord.sourceUrl,
    createdAt: itemRecord.createdAt
  };

  const nextIndex = [nextEntry, ...currentIndex.filter((entry) => entry.id !== id)].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );

  await writeJsonFile(indexHandle, nextIndex);
}

async function createGithubCollectIssue(settings, payload) {
  const owner = settings.githubOwner.trim();
  const repo = settings.githubRepo.trim();

  const githubFetch = (path, init = {}) => fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${settings.githubToken}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...(init.headers || {})
    }
  });

  const labelResponse = await githubFetch("/labels", {
    method: "POST",
    body: JSON.stringify({
      name: "collect",
      color: "111318",
      description: "PromptPick collection request"
    })
  });

  if (!labelResponse.ok && labelResponse.status !== 422) {
    throw new Error(`GitHub collect 标签准备失败：HTTP ${labelResponse.status}`);
  }

  const response = await githubFetch("/issues", {
    method: "POST",
    body: JSON.stringify({
      title: `Collect: ${payload.title || "Untitled prompt"}`,
      labels: ["collect"],
      body: [
        "```json",
        JSON.stringify(payload, null, 2),
        "```"
      ].join("\n")
    })
  });

  if (!response.ok) {
    let message = `GitHub Issue 创建失败：HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.message) {
        message = `${message} - ${body.message}`;
      }
    } catch {
      // Keep the HTTP status message.
    }
    throw new Error(message);
  }

  return response.json();
}

refreshButton.addEventListener("click", async () => {
  setStatus("正在重新识别当前页面...");
  try {
    await collectFromPage();
    setStatus("页面信息已重新识别。");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "页面识别失败。", true);
  }
});

openSettingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  setStatus("正在准备采集...");

  try {
    const target = await updateConfigState();
    if (!target) {
      throw new Error("请先在设置页完成采集目标配置。");
    }

    const payload = buildPayload(target.settings);

    if (target.type === "github") {
      setStatus(`正在提交到 GitHub：${target.settings.githubOwner}/${target.settings.githubRepo}...`);
      const issue = await createGithubCollectIssue(target.settings, payload);
      setStatus(`已提交到 GitHub Issue #${issue.number}，等待 Actions 入库。`);
    } else {
      setStatus(`正在写入本地项目：${target.rootHandle.name}...`);
      await writeItemToProject(target.rootHandle, payload);
      setStatus("已写入本地 data/items 并更新 index.json。");
    }

    await updateConfigState();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "写入失败。", true);
  } finally {
    submitButton.disabled = false;
  }
});

void hydrateState();
