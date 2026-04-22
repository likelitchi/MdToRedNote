import { marked } from "marked";
import {
  CANVAS,
  DEFAULT_PROJECT,
  FONT_PRESETS,
  SCENE_PRESETS,
  STYLE_MIGRATION,
  STYLE_PRESETS
} from "./constants";

marked.setOptions({
  breaks: true,
  gfm: true
});

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const COLUMN_BLOCK_PATTERN = /^:::(left|center|right)[ \t]*\n([\s\S]+?)\n:::(?:\n+|$)/;
const IMAGE_SIZE_PATTERN = /^(.*?)(?:\|(\d*)(?:x(\d*))?)?$/;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function parseFrontmatterValue(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return value;
}

export function extractMd2CardFrontmatter(rawText = "") {
  const source = String(rawText || "");
  const match = source.match(FRONTMATTER_PATTERN);

  if (!match) {
    return {
      metadata: {},
      body: source
    };
  }

  const metadata = {};
  const frontmatter = match[1] || "";

  frontmatter.split(/\r?\n/).forEach((line) => {
    const entry = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+?)\s*$/);
    if (!entry) {
      return;
    }

    const [, key, value] = entry;
    metadata[key] = parseFrontmatterValue(value);
  });

  return {
    metadata,
    body: source.slice(match[0].length)
  };
}

function looksLikeMarkdownLine(line = "") {
  return /^(#{1,6}\s|\d+\.\s|[-*+]\s|>\s|```|---$|!\[.*\]\(.*\)|\|.+\||:::(left|center|right))/.test(
    line.trim(),
  );
}

function isListLikeLine(line = "") {
  return /^(\d+[\.\)]\s+|[-*+•]\s+)/.test(line.trim());
}

function normalizeListLine(line = "") {
  const trimmed = line.trim();
  const numbered = trimmed.match(/^(\d+)[\.\)]\s+(.*)$/);
  if (numbered) {
    return `${numbered[1]}. ${numbered[2].trim()}`;
  }

  const bullet = trimmed.match(/^[-*+•]\s+(.*)$/);
  if (bullet) {
    return `- ${bullet[1].trim()}`;
  }

  return trimmed;
}

function smartFormatBlock(block = "") {
  const lines = block
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return "";
  }

  if (lines.every((line) => looksLikeMarkdownLine(line))) {
    return lines.join("\n");
  }

  if (lines.every((line) => isListLikeLine(line))) {
    return lines.map(normalizeListLine).join("\n");
  }

  if (lines.length >= 3 && lines.every((line) => line.length <= 28 && !/[。！？.!?]$/.test(line))) {
    return lines.map((line) => `- ${line}`).join("\n");
  }

  if (lines.length === 1) {
    const line = lines[0];
    if (line.length <= 32 && !/[。！？.!?]$/.test(line)) {
      return `## ${line}`;
    }

    return line;
  }

  const [firstLine, ...restLines] = lines;
  const restText = restLines.join(" ");

  if (
    firstLine.length <= 32 &&
    !/[。！？.!?]$/.test(firstLine) &&
    restText.length >= 18
  ) {
    return `## ${firstLine}\n${restText}`;
  }

  return lines.join(" ");
}

export function smartFormatMarkdownInput(rawText = "") {
  const source = String(rawText || "").replace(/\r\n/g, "\n").trim();
  if (!source) {
    return "";
  }

  const { metadata, body } = extractMd2CardFrontmatter(source);
  const bodyText = body.trim();

  const formattedBody = bodyText
    .split(/\n{2,}/)
    .map((block) => smartFormatBlock(block))
    .filter(Boolean)
    .join("\n\n");

  const frontmatterEntries = Object.entries(metadata).filter(([, value]) => value !== "");
  if (!frontmatterEntries.length) {
    return formattedBody;
  }

  const frontmatter = [
    "---",
    ...frontmatterEntries.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`),
    "---"
  ].join("\n");

  return `${frontmatter}\n\n${formattedBody}`.trim();
}

function buildFrontmatterText(metadata = {}) {
  const frontmatterEntries = Object.entries(metadata).filter(([, value]) => value !== "");
  if (!frontmatterEntries.length) {
    return "";
  }

  return [
    "---",
    ...frontmatterEntries.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`),
    "---"
  ].join("\n");
}

function splitSentences(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？!?；;])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function chunkSentences(sentences = [], maxLength = 68, maxCount = 2) {
  const chunks = [];
  let current = [];
  let currentLength = 0;

  sentences.forEach((sentence) => {
    const nextLength = currentLength + sentence.length;
    if (current.length && (current.length >= maxCount || nextLength > maxLength)) {
      chunks.push(current.join(" "));
      current = [sentence];
      currentLength = sentence.length;
      return;
    }

    current.push(sentence);
    currentLength = nextLength;
  });

  if (current.length) {
    chunks.push(current.join(" "));
  }

  return chunks;
}

function deriveCardTitle(text = "", index = 0) {
  const clean = String(text).trim();
  if (!clean) {
    return `重點 ${index + 1}`;
  }

  const firstLine = clean.split("\n").map((item) => item.trim()).find(Boolean) || "";
  if (firstLine && firstLine.length <= 28 && !/[。！？.!?]$/.test(firstLine)) {
    return firstLine;
  }

  const colonMatch = clean.match(/^(.{2,24}?)[：:]\s*/);
  if (colonMatch) {
    return colonMatch[1].trim();
  }

  const firstSentence = splitSentences(clean)[0] || "";
  const strippedSentence = firstSentence.replace(/[。！？.!?；;]+$/g, "").trim();
  if (strippedSentence && strippedSentence.length <= 22) {
    return strippedSentence;
  }

  return `重點 ${index + 1}`;
}

function formatCardBody(text = "") {
  const clean = String(text).trim();
  if (!clean) {
    return "";
  }

  const lines = clean
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.every((line) => isListLikeLine(line))) {
    return lines.map(normalizeListLine).join("\n");
  }

  const sentences = splitSentences(clean);
  if (
    sentences.length >= 2 &&
    sentences.length <= 4 &&
    sentences.every((sentence) => sentence.replace(/[。！？.!?；;]+$/g, "").length <= 28)
  ) {
    return sentences
      .map((sentence) => sentence.replace(/[。！？.!?；;]+$/g, "").trim())
      .filter(Boolean)
      .map((sentence) => `- ${sentence}`)
      .join("\n");
  }

  return clean;
}

function convertPlainTextToCardSections(text = "") {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  const sourceBlocks =
    paragraphs.length > 1
      ? paragraphs
      : chunkSentences(splitSentences(normalized), 78, 2);

  return sourceBlocks.map((block, index) => {
    const title = deriveCardTitle(block, index);
    let body = block.trim();

    if (body.startsWith(title)) {
      body = body.slice(title.length).replace(/^[:：\s]+/, "").trim();
    }

    const formattedBody = formatCardBody(body);
    return [`## ${title}`, formattedBody].filter(Boolean).join("\n");
  });
}

export function smartFormatCardMarkdown(rawText = "") {
  const source = String(rawText || "").replace(/\r\n/g, "\n").trim();
  if (!source) {
    return "";
  }

  const { metadata, body } = extractMd2CardFrontmatter(source);
  const bodyText = body.trim();

  if (!bodyText) {
    return buildFrontmatterText(metadata).trim();
  }

  const alreadyStructured =
    /(^|\n)(#{1,6}\s|---\s*$|:::(left|center|right)|[-*+]\s|\d+\.\s)/m.test(bodyText);

  let sections;

  if (alreadyStructured) {
    sections = bodyText
      .split(/\n{2,}---\n{2,}|\n---\n/)
      .map((block) => smartFormatBlock(block.trim()))
      .filter(Boolean)
      .map((block, index) => {
        if (/^#{1,6}\s/m.test(block)) {
          return block;
        }

        const title = deriveCardTitle(block, index);
        return `## ${title}\n${formatCardBody(block)}`;
      });
  } else {
    sections = convertPlainTextToCardSections(bodyText);
  }

  const frontmatter = buildFrontmatterText(metadata);
  const formattedBody = sections.filter(Boolean).join("\n\n---\n\n");

  return `${frontmatter ? `${frontmatter}\n\n` : ""}${formattedBody}`.trim();
}

function stripTrailingPunctuation(text = "") {
  return String(text).replace(/[。！？.!?；;：:，,]+$/g, "").trim();
}

function rewriteSentenceForCard(sentence = "") {
  const clean = String(sentence).trim();
  if (!clean) {
    return "";
  }

  const stripped = stripTrailingPunctuation(clean);
  if (!stripped) {
    return "";
  }

  if (stripped.length <= 20) {
    return stripped;
  }

  return stripped;
}

function summarizeBlockAsBullets(text = "") {
  const sentences = splitSentences(text)
    .map(rewriteSentenceForCard)
    .filter(Boolean);

  if (!sentences.length) {
    return "";
  }

  if (sentences.length === 1) {
    return sentences[0];
  }

  return sentences.slice(0, 3).map((sentence) => `- ${sentence}`).join("\n");
}

export function smartRewriteToRedNoteMarkdown(rawText = "") {
  const source = String(rawText || "").replace(/\r\n/g, "\n").trim();
  if (!source) {
    return "";
  }

  const { metadata, body } = extractMd2CardFrontmatter(source);
  const normalized = smartFormatCardMarkdown(body);
  const cleanBody = extractMd2CardFrontmatter(normalized).body.trim();

  if (!cleanBody) {
    return buildFrontmatterText(metadata).trim();
  }

  const sections = cleanBody
    .split(/\n{2,}---\n{2,}|\n---\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => {
      const headingMatch = block.match(/^##\s+(.+)$/m);
      const title = stripTrailingPunctuation(headingMatch?.[1] || deriveCardTitle(block, index));
      const bodyWithoutTitle = block.replace(/^##\s+.+$/m, "").trim();
      const rewrittenBody = summarizeBlockAsBullets(bodyWithoutTitle || block);

      return [`## ${title}`, rewrittenBody].filter(Boolean).join("\n");
    });

  const frontmatter = buildFrontmatterText(metadata);
  return `${frontmatter ? `${frontmatter}\n\n` : ""}${sections.join("\n\n---\n\n")}`.trim();
}

function groupAdjacentColumnBlocks(html) {
  if (typeof document === "undefined") {
    return html;
  }

  const root = document.createElement("div");
  root.innerHTML = html;

  let node = root.firstElementChild;

  while (node) {
    if (!node.classList.contains("md2-column-block")) {
      node = node.nextElementSibling;
      continue;
    }

    const siblings = [node];
    let cursor = node.nextElementSibling;

    while (cursor?.classList.contains("md2-column-block")) {
      siblings.push(cursor);
      cursor = cursor.nextElementSibling;
    }

    if (siblings.length < 2) {
      node = cursor;
      continue;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "md2-columns";
    wrapper.dataset.columns = String(siblings.length);
    root.insertBefore(wrapper, siblings[0]);
    siblings.forEach((item) => wrapper.appendChild(item));
    node = cursor;
  }

  return root.innerHTML;
}

marked.use({
  hooks: {
    preprocess(markdown) {
      return extractMd2CardFrontmatter(markdown).body;
    },
    postprocess(html) {
      return groupAdjacentColumnBlocks(html);
    }
  },
  extensions: [
    {
      name: "md2Highlight",
      level: "inline",
      start(src) {
        return src.indexOf("==");
      },
      tokenizer(src) {
        const match = /^==(?=\S)([\s\S]*?\S)==/.exec(src);
        if (!match) {
          return undefined;
        }

        return {
          type: "md2Highlight",
          raw: match[0],
          text: match[1],
          tokens: this.lexer.inlineTokens(match[1])
        };
      },
      renderer(token) {
        return `<mark class="md2-highlight">${this.parser.parseInline(token.tokens)}</mark>`;
      }
    },
    {
      name: "md2Underline",
      level: "inline",
      start(src) {
        return src.indexOf("^");
      },
      tokenizer(src) {
        const match = /^\^(?=\S)([\s\S]*?\S)\^/.exec(src);
        if (!match) {
          return undefined;
        }

        return {
          type: "md2Underline",
          raw: match[0],
          text: match[1],
          tokens: this.lexer.inlineTokens(match[1])
        };
      },
      renderer(token) {
        return `<span class="md2-underline">${this.parser.parseInline(token.tokens)}</span>`;
      }
    },
    {
      name: "md2ColumnBlock",
      level: "block",
      start(src) {
        return src.match(/:::?(left|center|right)/)?.index;
      },
      tokenizer(src) {
        const match = COLUMN_BLOCK_PATTERN.exec(src);
        if (!match) {
          return undefined;
        }

        const [, align, body] = match;
        return {
          type: "md2ColumnBlock",
          raw: match[0],
          align,
          text: body,
          tokens: this.lexer.blockTokens(body, [])
        };
      },
      renderer(token) {
        return `<section class="md2-column-block md2-column-${token.align}">${this.parser.parse(
          token.tokens,
        )}</section>`;
      },
      childTokens: ["tokens"]
    }
  ],
  renderer: {
    image({ href, title, text, tokens }) {
      const altText = tokens?.length ? this.parser.parseInline(tokens, this.parser.textRenderer) : text;
      const match = String(altText || "").match(IMAGE_SIZE_PATTERN);
      const cleanAlt = match?.[1]?.trim() || "";
      const width = Number.parseInt(match?.[2] || "", 10);
      const height = Number.parseInt(match?.[3] || "", 10);
      const styles = [];

      if (Number.isFinite(width) && width > 0) {
        styles.push(`--md2-image-width:${width}px`);
      }
      if (Number.isFinite(height) && height > 0) {
        styles.push(`--md2-image-height:${height}px`);
      }
      if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
        styles.push(`--md2-image-ratio:${width}/${height}`);
      }

      let html = `<img class="md2-image" src="${escapeHtml(href)}" alt="${escapeHtml(cleanAlt)}"`;
      if (title) {
        html += ` title="${escapeHtml(title)}"`;
      }
      if (styles.length) {
        html += ` style="${styles.join(";")}"`;
      }
      html += ">";
      return html;
    }
  }
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
  const knownFonts = new Set(FONT_PRESETS.map((item) => item.id));
  const migratedStyle = STYLE_MIGRATION[merged.style] || merged.style;

  merged.footerMode =
    merged.footerMode === "pagenum" ? "page" : merged.footerMode;
  merged.style = knownStyles.has(migratedStyle) ? migratedStyle : "minimal";
  merged.scene = knownScenes.has(merged.scene) ? merged.scene : "default";
  merged.font = knownFonts.has(merged.font) ? merged.font : "balanced";
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

  const parsed = extractMd2CardFrontmatter(rawText);
  const input = String(parsed.body || "").trim();
  if (!String(rawText || "").trim() || !input) {
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
