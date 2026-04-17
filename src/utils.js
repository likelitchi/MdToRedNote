import { marked } from "marked";
import {
  CANVAS,
  DEFAULT_PROJECT,
  SCENE_PRESETS,
  STYLE_MIGRATION,
  STYLE_PRESETS
} from "./constants";

marked.setOptions({
  breaks: true,
  gfm: true
});

function normalizeStickerCollections(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([cardIndex, stickers]) => [
      cardIndex,
      Array.isArray(stickers)
        ? stickers.map((sticker, idx) => ({
            id: sticker.id || `sticker-${cardIndex}-${idx + 1}`,
            src: sticker.src || "",
            x: Number.isFinite(sticker.x) ? sticker.x : 690,
            y: Number.isFinite(sticker.y) ? sticker.y : 890,
            scale: Number.isFinite(sticker.scale) ? sticker.scale : 1,
            flipX: Boolean(sticker.flipX)
          }))
        : []
    ])
  );
}

export function normalizeProject(raw = {}) {
  const merged = {
    ...DEFAULT_PROJECT,
    ...raw
  };

  const knownStyles = new Set(STYLE_PRESETS.map((item) => item.id));
  const knownScenes = new Set(SCENE_PRESETS.map((item) => item.id));
  const migratedStyle = STYLE_MIGRATION[merged.style] || merged.style;

  merged.footerMode =
    merged.footerMode === "pagenum" ? "page" : merged.footerMode;
  merged.style = knownStyles.has(migratedStyle) ? migratedStyle : "minimal";
  merged.scene = knownScenes.has(merged.scene) ? merged.scene : "default";
  merged.selectedCardIndex = Number.isFinite(merged.selectedCardIndex)
    ? merged.selectedCardIndex
    : 0;
  merged.currentMergeIndex = Number.isFinite(merged.currentMergeIndex)
    ? merged.currentMergeIndex
    : 0;
  merged.mergeOverlays = Array.isArray(merged.mergeOverlays)
    ? merged.mergeOverlays.filter(Boolean)
    : [];
  merged.cardIcons = normalizeStickerCollections(merged.cardIcons);

  return merged;
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename, blob) {
  if (!blob) {
    throw new Error("Download blob is empty");
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function dataUrlToBlob(dataUrl) {
  const [meta, content] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] || "application/octet-stream";
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mime });
}

export function canvasToBlob(canvas, type = "image/png") {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        try {
          resolve(dataUrlToBlob(canvas.toDataURL(type)));
        } catch (error) {
          reject(error);
        }
      }, type);
    } catch (error) {
      reject(error);
    }
  });
}

export function splitTitleLines(value = "") {
  return String(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function getMaxContentHeight() {
  return (
    CANVAS.height -
    CANVAS.paddingTop -
    CANVAS.paddingBottom -
    CANVAS.footerHeight
  );
}

export function paginateMarkdown(rawText, measureRoot) {
  if (!measureRoot) {
    return [];
  }

  const input = String(rawText || "").trim();
  if (!input) {
    return [marked.parse("開始輸入內容，這裡會自動切頁。")];
  }

  const pages = [];
  const segments = input.split(/\n-{3,}\n/g);
  const maxHeight = getMaxContentHeight();

  segments.forEach((segment) => {
    if (!segment.trim()) {
      return;
    }

    const rendered = marked.parse(segment);
    const temp = document.createElement("div");
    temp.innerHTML = rendered;

    const blocks = Array.from(temp.children);
    if (!blocks.length) {
      pages.push(rendered);
      return;
    }

    let currentBlocks = [];
    let currentHeight = 0;

    blocks.forEach((block) => {
      measureRoot.innerHTML = "";
      const wrapper = document.createElement("div");
      wrapper.className = "measure-content markdown-body";
      wrapper.appendChild(block.cloneNode(true));
      measureRoot.appendChild(wrapper);

      const blockHeight = measureRoot.offsetHeight + 18;
      if (currentBlocks.length && currentHeight + blockHeight > maxHeight) {
        pages.push(currentBlocks.join(""));
        currentBlocks = [block.outerHTML];
        currentHeight = blockHeight;
      } else {
        currentBlocks.push(block.outerHTML);
        currentHeight += blockHeight;
      }
    });

    if (currentBlocks.length) {
      pages.push(currentBlocks.join(""));
    }
  });

  measureRoot.innerHTML = "";
  return pages.length ? pages : [marked.parse(input)];
}
