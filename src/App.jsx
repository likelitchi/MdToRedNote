import {
  Download,
  FileImage,
  FileText,
  FolderOpen,
  Images,
  Layers3,
  Maximize2,
  Minimize2,
  Palette,
  RefreshCcw,
  Save,
  Sparkles,
  Sticker,
  Type
} from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import JSZip from "jszip";
import {
  CANVAS,
  DEFAULT_BACKGROUND,
  FONT_PRESETS,
  STORAGE_KEY,
  STICKER_SETS,
  STICKER_TABS,
  STYLE_GROUPS,
  STYLE_PRESETS,
  getFontPreset,
  getStylePreset
} from "./constants";
import {
  canvasToBlob,
  downloadBlob,
  downloadJson,
  extractMd2CardFrontmatter,
  normalizeProject,
  paginateMarkdown,
  readFileAsDataUrl,
  smartFormatCardMarkdown,
  smartFormatMarkdownInput,
  smartRewriteToRedNoteMarkdown,
  splitTitleLines
} from "./utils";

function getInitialProject() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return normalizeProject();
    }
    return normalizeProject(JSON.parse(saved));
  } catch {
    return normalizeProject();
  }
}

function ToolbarButton({ icon: Icon, children, onClick, variant = "muted" }) {
  return (
    <button className={`toolbar-btn toolbar-btn-${variant}`} onClick={onClick} type="button">
      <Icon size={16} strokeWidth={2.1} />
      <span>{children}</span>
    </button>
  );
}

function ControlSection({ title, description, children }) {
  return (
    <section className="control-section">
      <div className="section-head">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DownloadProgress({ progress }) {
  if (!progress.open) {
    return null;
  }

  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="download-progress" role="status">
      <div className="download-progress-copy">
        <span>{progress.title}</span>
        <span>{percentage}%</span>
      </div>
      <div
        aria-label={progress.title}
        aria-valuemax={progress.total}
        aria-valuemin={0}
        aria-valuenow={progress.current}
        className="download-progress-track"
        role="progressbar"
      >
        <div className="download-progress-fill" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function ToolButton({ icon: Icon, label, description, active, onClick, compact = false }) {
  return (
    <button
      className={`tool-btn ${active ? "is-active" : ""} ${compact ? "is-compact" : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className="tool-btn-icon">
        <Icon size={18} strokeWidth={2.1} />
      </span>
      <span className="tool-btn-copy">
        <strong>{label}</strong>
      </span>
    </button>
  );
}

function MarkdownGuide() {
  return (
    <details className="markdown-guide">
      <summary>Markdown 語法與用法</summary>
      <div className="markdown-guide-body">
        <section className="markdown-guide-section">
          <h3>基礎格式</h3>
          <p>適合一般知識卡與條列內容。</p>
          <pre>{`# 主標題
## 章節標題
- 重點一
- 重點二
1. 步驟一
2. 步驟二
> 引用內容`}</pre>
        </section>

        <section className="markdown-guide-section">
          <h3>分頁</h3>
          <p>用 `---` 強制切成下一張卡片。</p>
          <pre>{`第一頁內容

---

第二頁內容`}</pre>
        </section>

        <section className="markdown-guide-section">
          <h3>強調語法</h3>
          <p>支援 md2card 常見擴充語法。</p>
          <pre>{`這是 ==重點標示==
這是 ^底線強調^
**粗體**
*斜體*`}</pre>
        </section>

        <section className="markdown-guide-section">
          <h3>圖片</h3>
          <p>一般圖片可直接插入，也可指定尺寸。</p>
          <pre>{`![封面圖](https://example.com/cover.jpg)
![產品示意|400x280](https://example.com/demo.jpg)`}</pre>
        </section>

        <section className="markdown-guide-section">
          <h3>欄位排版</h3>
          <p>相鄰欄位會自動組成雙欄或三欄。</p>
          <pre>{`:::left
- 左邊內容
:::

:::right
- 右邊內容
:::

:::left
左
:::

:::center
中
:::

:::right
右
:::`}</pre>
        </section>

        <section className="markdown-guide-section">
          <h3>Frontmatter</h3>
          <p>放在最上方，可自動同步封面標題與作者。</p>
          <pre>{`---
title: 三步驟寫好知識卡
author: @YourBrand
---

## 內容從這裡開始`}</pre>
        </section>
      </div>
    </details>
  );
}

async function waitForPaint() {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

const MODE_META = {
  gen: {
    title: "生成",
    description: "Markdown 轉卡片"
  },
  merge: {
    title: "合併",
    description: "背景疊圖批量輸出"
  }
};

const GENERATOR_TOOLS = [
  {
    id: "style",
    label: "風格",
    description: "版型、主題色、場景",
    icon: Palette
  },
  {
    id: "content",
    label: "內容",
    description: "標題、作者、Markdown",
    icon: FileText
  },
  {
    id: "background",
    label: "背景",
    description: "底圖與封面圖",
    icon: FileImage
  },
  {
    id: "footer",
    label: "頁腳",
    description: "頁碼或文案",
    icon: Type
  },
  {
    id: "stickers",
    label: "貼圖",
    description: "角色貼圖與調整",
    icon: Sticker
  },
  {
    id: "download",
    label: "下載",
    description: "輸出圖片",
    icon: Download
  }
];

const MERGER_TOOLS = [
  {
    id: "assets",
    label: "素材",
    description: "背景與內容圖片",
    icon: Layers3
  },
  {
    id: "footer",
    label: "頁腳",
    description: "頁碼或文案",
    icon: Type
  },
  {
    id: "download",
    label: "下載",
    description: "輸出圖片",
    icon: Download
  }
];

function getCoverTitleSizeClass(title) {
  const plain = String(title || "").replace(/\s+/g, "");
  const lines = String(title || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const score = Math.max(plain.length, longestLine * 1.7 + Math.max(lines.length - 1, 0) * 3);

  if (score >= 44) return "title-size-xxs";
  if (score >= 34) return "title-size-xs";
  if (score >= 26) return "title-size-sm";
  if (score >= 18) return "title-size-md";
  return "title-size-lg";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getCoverTitleStyle(title) {
  const lines = splitTitleLines(title);
  const safeLines = lines.length ? lines : [""];
  const plain = safeLines.join("").replace(/\s+/g, "");
  const longestLine = safeLines.reduce((max, line) => Math.max(max, line.length), 0);
  const lineCount = safeLines.length;
  const density = longestLine * 1.9 + plain.length * 0.45 + Math.max(lineCount - 1, 0) * 6;

  const fontSize = clamp(112 - (density - 12) * 1.15, 50, 104);
  const gap = clamp(18 - lineCount * 2 - Math.max(0, longestLine - 10) * 0.22, 8, 14);
  const lineHeight = clamp(
    0.94 + Math.max(lineCount - 1, 0) * 0.035 + Math.max(0, 78 - fontSize) * 0.0024,
    0.94,
    1.16
  );

  return {
    "--cover-title-font-size": `${fontSize}px`,
    "--cover-title-gap": `${gap}px`,
    "--cover-title-line-height": lineHeight
  };
}

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex) {
  const value = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return { r: 37, g: 99, b: 235 };
  }

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function mixRgb(source, target, ratio) {
  return {
    r: clampChannel(source.r * (1 - ratio) + target.r * ratio),
    g: clampChannel(source.g * (1 - ratio) + target.g * ratio),
    b: clampChannel(source.b * (1 - ratio) + target.b * ratio)
  };
}

function rgbString(rgb, alpha = 1) {
  if (alpha === 1) {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function buildThemeVars(theme, fontId) {
  const base = hexToRgb(theme);
  const white = { r: 255, g: 255, b: 255 };
  const dark = { r: 15, g: 23, b: 42 };
  const rose = hexToRgb("fb7185");
  const amber = hexToRgb("f97316");
  const fontPreset = getFontPreset(fontId);

  return {
    "--theme": rgbString(base),
    "--theme-soft": rgbString(mixRgb(base, white, 0.84)),
    "--theme-pale": rgbString(mixRgb(base, white, 0.92)),
    "--theme-line": rgbString(mixRgb(base, white, 0.64)),
    "--theme-deep": rgbString(mixRgb(base, dark, 0.26)),
    "--theme-shadow": rgbString(mixRgb(base, white, 0.76)),
    "--theme-tint": rgbString(base, 0.14),
    "--theme-surface": rgbString(mixRgb(base, white, 0.68)),
    "--theme-ink": rgbString(mixRgb(base, dark, 0.28)),
    "--theme-rose": rgbString(mixRgb(base, rose, 0.6)),
    "--theme-accent": rgbString(mixRgb(base, amber, 0.72)),
    "--font-ui-sans": fontPreset.sans,
    "--font-ui-serif": fontPreset.serif,
    "--font-ui-rounded": fontPreset.rounded
  };
}

function base64PngToBlob(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: "image/png" });
}

const EXPORT_BATCH_SIZE = 4;
const SERVERLESS_EXPORT_BATCH_SIZE = 1;
const MERGE_OVERLAY_SCALE_MIN = 0.25;
const MERGE_OVERLAY_SCALE_MAX = 3;
const MERGE_OVERLAY_SCALE_STEP = 0.05;
const MERGE_OVERLAY_OFFSET_MIN = -800;
const MERGE_OVERLAY_OFFSET_MAX = 800;
const MERGE_OVERLAY_OFFSET_STEP = 2;
const MOBILE_EXPORT_BATCH_SIZE = 2;
const EMPTY_MOBILE_EXPORT_PROGRESS = {
  open: false,
  current: 0,
  total: 0,
  title: ""
};

function getExportServiceUnavailableMessage() {
  if (import.meta.env.PROD) {
    return "匯出服務不可用。請確認 Vercel 已部署 `/api/export_png`，且 serverless function 能啟動 Chromium。";
  }

  return "匯出服務不可用。請使用 `npm run dev` 或 `npm run preview` 啟動；為了保持版面精準度，下載不再使用瀏覽器端備援匯出。";
}

function getExportEndpointCandidates() {
  return import.meta.env.PROD ? ["/api/export_png", "/__export_png"] : ["/__export_png", "/api/export_png"];
}

function getExportBatchSize(isMobileViewport) {
  if (import.meta.env.PROD) {
    return SERVERLESS_EXPORT_BATCH_SIZE;
  }

  return isMobileViewport ? MOBILE_EXPORT_BATCH_SIZE : EXPORT_BATCH_SIZE;
}

function isExportTransportError(error) {
  const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
  return (
    message.includes("/__export_png") ||
    message.includes("匯出服務不可用") ||
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("networkerror") ||
    message.includes("network error") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("connection closed") ||
    message.includes("connection terminated") ||
    message.includes("the network connection was lost")
  );
}

function readCssRulesFromSheet(node) {
  try {
    const rules = Array.from(node?.sheet?.cssRules || []);
    if (!rules.length) {
      return "";
    }

    return rules.map((rule) => rule.cssText).join("\n");
  } catch {
    return "";
  }
}

async function readExportError(response) {
  const contentType = response.headers.get("content-type") || "";
  const bodyText = await response.text();

  if (contentType.includes("application/json")) {
    try {
      const payload = JSON.parse(bodyText);
      return payload?.error || "Export failed";
    } catch {
      return bodyText || "Export failed";
    }
  }

  if (response.status === 404 || contentType.includes("text/html")) {
    return getExportServiceUnavailableMessage();
  }

  return bodyText || `Export failed (HTTP ${response.status})`;
}

async function fetchExportEndpoint(body) {
  const endpoints = getExportEndpointCandidates();
  let lastError;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        return response;
      }

      const message = await readExportError(response);
      const error = new Error(message);
      error.status = response.status;
      throw error;
    } catch (error) {
      lastError = error;
      if (!isExportTransportError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error(getExportServiceUnavailableMessage());
}

function CoverCard({ project, stylePreset }) {
  const titleLines = splitTitleLines(project.title);
  const variant = stylePreset.variant;
  const titleSizeClass = getCoverTitleSizeClass(project.title);
  const titleStyle = getCoverTitleStyle(project.title);

  return (
    <div className={`cover-layout cover-${variant} ${project.coverImg ? "has-cover-image" : "no-cover-image"}`}>
      <div className="cover-visual">
        {project.coverImg ? (
          <img alt="cover" className="cover-image" src={project.coverImg} />
        ) : (
          <>
            <div className="cover-pattern cover-pattern-a" />
            <div className="cover-pattern cover-pattern-b" />
            <div className="cover-pattern cover-pattern-c" />
            <div className="cover-orb cover-orb-a" />
            <div className="cover-orb cover-orb-b" />
            <div className="cover-grid" />
            <div className="cover-noise" />
          </>
        )}
      </div>
      <div className="cover-copy cover-copy-title-only">
        <h1 className={`cover-title ${titleSizeClass}`} style={titleStyle}>
          {titleLines.map((line, index) => (
            <span key={`${line}-${index}`}>{line}</span>
          ))}
        </h1>
      </div>
    </div>
  );
}

function formatScaleLabel(value) {
  return `${Math.round(Number(value || 1) * 100)}%`;
}

function formatOffsetLabel(value) {
  const nextValue = Math.round(Number(value || 0));
  if (nextValue > 0) {
    return `+${nextValue}px`;
  }

  return `${nextValue}px`;
}

function ContentCard({ html, cardNumber, project, stylePreset }) {
  const variant = stylePreset.variant;

  return (
    <div className={`content-layout content-${variant}`}>
      <div className="content-meta">
        <div className="content-index">{String(cardNumber).padStart(2, "0")}</div>
        <div className="content-rule" />
      </div>
      <div className="content-panel markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
      {project.showAuthor && project.author ? <div className="content-signoff">{project.author}</div> : null}
    </div>
  );
}

function Footer({ project, pageNumber, totalCards }) {
  if (project.footerMode === "none") {
    return null;
  }

  const label =
    project.footerMode === "text" ? project.adText || " " : `${pageNumber} / ${totalCards}`;

  return <div className="card-footer">{label}</div>;
}

function GeneratorCard({
  card,
  cardIndex,
  totalCards,
  project,
  stylePreset,
  previewScale,
  selected,
  stickers,
  activeSticker,
  onSelect,
  onStickerSelect,
  onStickerDown,
  onStickerRemove,
  cardRef,
  shellClassName = ""
}) {
  const variant = stylePreset.variant;

  return (
    <div
      className={`preview-card-shell ${selected ? "is-selected" : ""} ${shellClassName}`}
      onClick={() => onSelect(cardIndex)}
      style={{
        width: CANVAS.width * previewScale,
        height: CANVAS.height * previewScale
      }}
    >
      <div
        className="preview-card-transform"
        style={{
          width: CANVAS.width,
          height: CANVAS.height,
          transform: `scale(${previewScale})`
        }}
      >
        <div
          className={`card-root variant-${variant} ${project.useDefaultBg ? "has-default-frame" : ""}`}
          ref={cardRef}
          style={buildThemeVars(project.theme, project.font)}
        >
          {project.useDefaultBg ? (
            <div
              className="default-background-layer"
              style={{ backgroundImage: `url(${DEFAULT_BACKGROUND})` }}
            />
          ) : null}
          {project.uploadedBaseImg ? (
            <img alt="" className="card-base-image" src={project.uploadedBaseImg} />
          ) : null}
          <div className="card-surface">
            {card.kind === "cover" ? (
              <CoverCard project={project} stylePreset={stylePreset} />
            ) : (
              <ContentCard
                html={card.html}
                cardNumber={cardIndex + 1}
                project={project}
                stylePreset={stylePreset}
              />
            )}
            {stickers.map((sticker) => {
              const isActive =
                activeSticker &&
                activeSticker.cardIndex === cardIndex &&
                activeSticker.stickerId === sticker.id;

              return (
                <div
                  className={`sticker-item ${isActive ? "is-active" : ""}`}
                  key={sticker.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onStickerSelect(cardIndex, sticker.id);
                  }}
                  onPointerDown={(event) => onStickerDown(event, cardIndex, sticker.id)}
                  style={{
                    transform: `translate(${sticker.x}px, ${sticker.y}px) scale(${sticker.scale}) ${
                      sticker.flipX ? "scaleX(-1)" : ""
                    }`
                  }}
                >
                  <img alt="" draggable="false" src={sticker.src} />
                  <button
                    className="sticker-remove"
                    data-export-remove="true"
                    onClick={(event) => {
                      event.stopPropagation();
                      onStickerRemove(cardIndex, sticker.id);
                    }}
                    type="button"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
          <Footer project={project} pageNumber={cardIndex + 1} totalCards={totalCards} />
        </div>
      </div>
    </div>
  );
}

function MergerCard({ project, previewScale, cardRef, displayIndex, shellClassName = "", onSelect }) {
  const safeIndex = Math.max(0, Math.min(displayIndex ?? project.currentMergeIndex, Math.max(project.mergeOverlays.length - 1, 0)));
  const contentImage = project.mergeOverlays[safeIndex];
  const mergeFrameStyle = {
    left: 0,
    right: 0,
    top: 120,
    bottom: 60,
    "--merge-overlay-scale": project.mergeOverlayScale || 1,
    "--merge-overlay-offset-x": `${project.mergeOverlayOffsetX || 0}px`,
    "--merge-overlay-offset-y": `${project.mergeOverlayOffsetY || 0}px`
  };

  return (
    <div
      className={`preview-card-shell merger-preview-shell ${shellClassName}`}
      onClick={onSelect}
      style={{
        width: CANVAS.width * previewScale,
        height: CANVAS.height * previewScale
      }}
    >
      <div
        className="preview-card-transform"
        style={{
          width: CANVAS.width,
          height: CANVAS.height,
          transform: `scale(${previewScale})`
        }}
      >
        <div
          className={`card-root variant-minimal ${project.useDefaultBgMerger ? "has-default-frame" : ""}`}
          ref={cardRef}
          style={buildThemeVars(project.theme, project.font)}
        >
          {project.useDefaultBgMerger ? (
            <div
              className="default-background-layer"
              style={{ backgroundImage: `url(${DEFAULT_BACKGROUND})` }}
            />
          ) : null}
          <div className="card-surface merge-surface">
            <div className="merge-media-frame" style={mergeFrameStyle}>
              {contentImage ? (
                <div className="merge-content-stage">
                  <img alt="" className="merge-content-image" src={contentImage} />
                </div>
              ) : (
                <div className="merge-placeholder">尚未上傳內容</div>
              )}
              {project.mergeBg ? (
                <img alt="" className="merge-background-image" src={project.mergeBg} />
              ) : null}
            </div>
          </div>
          <Footer
            project={project}
            pageNumber={safeIndex + 1}
            totalCards={Math.max(project.mergeOverlays.length, 1)}
          />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [project, setProject] = useState(getInitialProject);
  const [pages, setPages] = useState([]);
  const [previewScale, setPreviewScale] = useState(0.28);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 720px)").matches : false,
  );
  const [mobilePreviewZoom, setMobilePreviewZoom] = useState(1);
  const [activeSticker, setActiveSticker] = useState(null);
  const [activeToolByMode, setActiveToolByMode] = useState({
    gen: GENERATOR_TOOLS[0].id,
    merge: MERGER_TOOLS[0].id
  });
  const [isToolPanelExpanded, setIsToolPanelExpanded] = useState(false);
  const [mobileDownloadSelection, setMobileDownloadSelection] = useState({
    gen: [0],
    merge: []
  });
  const [mobileExportItems, setMobileExportItems] = useState([]);
  const [isPreparingMobileExport, setIsPreparingMobileExport] = useState(false);
  const [mobileExportProgress, setMobileExportProgress] = useState(EMPTY_MOBILE_EXPORT_PROGRESS);
  const [exportState, setExportState] = useState({
    open: false,
    title: "準備中"
  });

  const deferredContent = useDeferredValue(project.content);
  const previewPaneRef = useRef(null);
  const measureRef = useRef(null);
  const importRef = useRef(null);
  const generatorCardRefs = useRef({});
  const mergerCardRef = useRef(null);
  const exportGeneratorRef = useRef(null);
  const exportMergerRef = useRef(null);
  const exportStylesCacheRef = useRef({
    hrefs: "",
    css: ""
  });
  const dragRef = useRef(null);
  const previewTouchRef = useRef({
    startX: 0,
    startY: 0,
    startDistance: 0,
    startZoom: 1,
    isPinching: false
  });
  const toolSheetTouchRef = useRef({
    startY: 0,
    startX: 0
  });

  const stylePreset = getStylePreset(project.style);
  const groupedStylePresets = STYLE_GROUPS.map((group) => ({
    ...group,
    items: STYLE_PRESETS.filter((item) => item.group === group.id)
  })).filter((group) => group.items.length);
  const currentTools = project.mode === "gen" ? GENERATOR_TOOLS : MERGER_TOOLS;
  const activeTool = activeToolByMode[project.mode];
  const cards = [{ kind: "cover" }, ...pages.map((html) => ({ kind: "content", html }))];
  const effectivePreviewScale = previewScale * (isMobile ? mobilePreviewZoom : 1);
  const currentPreviewIndex = project.mode === "gen" ? project.selectedCardIndex : project.currentMergeIndex;
  const totalPreviewCount =
    project.mode === "gen" ? cards.length : Math.max(project.mergeOverlays.length, 1);
  const currentActiveSticker = activeSticker
    ? (project.cardIcons[String(activeSticker.cardIndex)] || []).find(
        (item) => item.id === activeSticker.stickerId,
      )
    : null;
  const mobileGeneratorWindow = isMobile
    ? [project.selectedCardIndex - 1, project.selectedCardIndex, project.selectedCardIndex + 1]
        .filter((index) => index >= 0 && index < cards.length)
        .map((index) => ({
          card: cards[index],
          index,
          position:
            index < project.selectedCardIndex ? "prev" : index > project.selectedCardIndex ? "next" : "current"
        }))
    : cards.map((card, index) => ({ card, index, position: "current" }));
  const mobileMergeWindow = isMobile
    ? [project.currentMergeIndex - 1, project.currentMergeIndex, project.currentMergeIndex + 1]
        .filter((index) => index >= 0 && index < Math.max(project.mergeOverlays.length, 1))
        .map((index) => ({
          index,
          position:
            index < project.currentMergeIndex ? "prev" : index > project.currentMergeIndex ? "next" : "current"
        }))
    : [{ index: project.currentMergeIndex, position: "current" }];

  function syncPreviewScale() {
    if (!previewPaneRef.current) {
      return;
    }

    const paneWidth = previewPaneRef.current.clientWidth;
    if (paneWidth <= 0) {
      return;
    }

    const widthPadding = isMobile ? 72 : 40;
    let nextScale = (paneWidth - widthPadding) / CANVAS.width;

    if (isMobile) {
      const paneTop = previewPaneRef.current.getBoundingClientRect().top;
      const previewHeadHeight =
        previewPaneRef.current.querySelector(".preview-head")?.getBoundingClientRect().height || 0;
      const sheetHeight = document.querySelector(".controls-panel")?.getBoundingClientRect().height || 0;
      const viewportHeight = window.innerHeight;
      const availableHeight = viewportHeight - paneTop - previewHeadHeight - sheetHeight - 12;

      if (availableHeight > 0) {
        nextScale = Math.min(nextScale, availableHeight / CANVAS.height);
      }

      nextScale = Math.min(0.32, Math.max(0.12, nextScale));
    } else {
      nextScale = Math.min(0.36, Math.max(0.18, nextScale));
    }

    setPreviewScale(nextScale);
  }

  function getTouchDistance(touches) {
    if (touches.length < 2) {
      return 0;
    }

    const [first, second] = touches;
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  }

  function goPrevPreviewItem() {
    if (project.mode === "gen") {
      updateProjectField("selectedCardIndex", Math.max(project.selectedCardIndex - 1, 0));
      setActiveSticker(null);
      return;
    }

    updateProjectField("currentMergeIndex", Math.max(project.currentMergeIndex - 1, 0));
  }

  function goNextPreviewItem() {
    if (project.mode === "gen") {
      updateProjectField("selectedCardIndex", Math.min(project.selectedCardIndex + 1, cards.length - 1));
      setActiveSticker(null);
      return;
    }

    updateProjectField(
      "currentMergeIndex",
      Math.min(project.currentMergeIndex + 1, project.mergeOverlays.length - 1),
    );
  }

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  }, [project]);

  useEffect(
    () => () => {
      mobileExportItems.forEach((item) => URL.revokeObjectURL(item.url));
    },
    [mobileExportItems],
  );

  useEffect(() => {
    setActiveToolByMode((prev) => {
      if (prev.gen && prev.merge) {
        return prev;
      }

      return {
        gen: prev.gen || GENERATOR_TOOLS[0].id,
        merge: prev.merge || MERGER_TOOLS[0].id
      };
    });
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 720px)");
    const handleChange = (event) => setIsMobile(event.matches);

    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useLayoutEffect(() => {
    const computePages = () => {
      if (!measureRef.current) {
        return;
      }

      const nextPages = paginateMarkdown(deferredContent, measureRef.current);
      startTransition(() => {
        setPages(nextPages);
      });
    };

    computePages();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(computePages).catch(() => {});
    }
  }, [deferredContent, project.style, project.author, project.showAuthor]);

  useEffect(() => {
    if (project.selectedCardIndex > cards.length - 1) {
      setProject((prev) => ({
        ...prev,
        selectedCardIndex: Math.max(cards.length - 1, 0)
      }));
    }
  }, [cards.length, project.selectedCardIndex]);

  useEffect(() => {
    if (project.currentMergeIndex > Math.max(project.mergeOverlays.length - 1, 0)) {
      setProject((prev) => ({
        ...prev,
        currentMergeIndex: Math.max(prev.mergeOverlays.length - 1, 0)
      }));
    }
  }, [project.currentMergeIndex, project.mergeOverlays.length]);

  useEffect(() => {
    if (!previewPaneRef.current) {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width - 40;
      const nextScale = Math.min(0.36, Math.max(0.18, width / CANVAS.width));
      setPreviewScale(nextScale);
    });

    observer.observe(previewPaneRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        syncPreviewScale();
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [isMobile, isToolPanelExpanded, project.mode]);

  useEffect(() => {
    setMobilePreviewZoom(1);
  }, [isMobile, project.mode, project.selectedCardIndex, project.currentMergeIndex]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (!dragRef.current) {
        return;
      }

      const { originX, originY, startX, startY, cardIndex, stickerId } = dragRef.current;
      const dx = (event.clientX - startX) / effectivePreviewScale;
      const dy = (event.clientY - startY) / effectivePreviewScale;

      setProject((prev) => {
        const key = String(cardIndex);
        const nextStickers = (prev.cardIcons[key] || []).map((sticker) =>
          sticker.id === stickerId
            ? {
                ...sticker,
                x: originX + dx,
                y: originY + dy
              }
            : sticker,
        );

        return {
          ...prev,
          cardIcons: {
            ...prev.cardIcons,
            [key]: nextStickers
          }
        };
      });
    };

    const handlePointerUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [effectivePreviewScale]);

  function updateProjectField(key, value) {
    if (key === "content") {
      const { metadata } = extractMd2CardFrontmatter(value);

      setProject((prev) => ({
        ...prev,
        content: value,
        title:
          typeof metadata.title === "string" && metadata.title.trim()
            ? metadata.title.trim()
            : prev.title,
        author:
          typeof metadata.author === "string" && metadata.author.trim()
            ? metadata.author.trim()
            : prev.author
      }));
      return;
    }

    setProject((prev) => ({
      ...prev,
      [key]: value
    }));
  }

  function updateFooterMode(value) {
    setProject((prev) => ({
      ...prev,
      footerMode: value
    }));
  }

  function formatMarkdownContent() {
    const formatted = smartFormatMarkdownInput(project.content);
    updateProjectField("content", formatted);
  }

  function formatCardMarkdownContent() {
    const formatted = smartFormatCardMarkdown(project.content);
    updateProjectField("content", formatted);
  }

  function rewriteToRedNoteMarkdownContent() {
    const formatted = smartRewriteToRedNoteMarkdown(project.content);
    updateProjectField("content", formatted);
  }

  function setActiveTool(toolId) {
    setActiveToolByMode((prev) => ({
      ...prev,
      [project.mode]: toolId
    }));
  }

  function selectSticker(cardIndex, stickerId) {
    setActiveSticker({ cardIndex, stickerId });
    setProject((prev) => ({
      ...prev,
      selectedCardIndex: cardIndex
    }));
  }

  function updateMobileExportItems(items) {
    setMobileExportItems((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.url));
      return items;
    });
  }

  function handlePreviewTouchStart(event) {
    if (!isMobile) {
      return;
    }

    if (event.touches.length >= 2) {
      previewTouchRef.current = {
        ...previewTouchRef.current,
        startDistance: getTouchDistance(event.touches),
        startZoom: mobilePreviewZoom,
        isPinching: true
      };
      return;
    }

    const [touch] = event.touches;
    previewTouchRef.current = {
      ...previewTouchRef.current,
      startX: touch.clientX,
      startY: touch.clientY,
      isPinching: false
    };
  }

  function handlePreviewTouchMove(event) {
    if (!isMobile || event.touches.length < 2 || !previewTouchRef.current.isPinching) {
      return;
    }

    const nextDistance = getTouchDistance(event.touches);
    if (!nextDistance || !previewTouchRef.current.startDistance) {
      return;
    }

    event.preventDefault();
    const zoomRatio = nextDistance / previewTouchRef.current.startDistance;
    const nextZoom = Math.max(0.85, Math.min(2.4, previewTouchRef.current.startZoom * zoomRatio));
    setMobilePreviewZoom(nextZoom);
  }

  function handlePreviewTouchEnd(event) {
    if (!isMobile) {
      return;
    }

    if (previewTouchRef.current.isPinching) {
      if (event.touches.length < 2) {
        previewTouchRef.current.isPinching = false;
      }
      return;
    }

    const touch = event.changedTouches?.[0];
    if (!touch) {
      return;
    }

    const dx = touch.clientX - previewTouchRef.current.startX;
    const dy = touch.clientY - previewTouchRef.current.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX < 56 || absX <= absY * 1.2) {
      return;
    }

    if (dx < 0) {
      goNextPreviewItem();
      return;
    }

    goPrevPreviewItem();
  }

  function handleToolSheetTouchStart(event) {
    const touch = event.touches?.[0];
    if (!touch || !isMobile) {
      return;
    }

    toolSheetTouchRef.current = {
      startX: touch.clientX,
      startY: touch.clientY
    };
  }

  function handleToolSheetTouchEnd(event) {
    const touch = event.changedTouches?.[0];
    if (!touch || !isMobile) {
      return;
    }

    const dx = touch.clientX - toolSheetTouchRef.current.startX;
    const dy = touch.clientY - toolSheetTouchRef.current.startY;

    if (Math.abs(dy) < 36 || Math.abs(dy) <= Math.abs(dx)) {
      return;
    }

    if (dy < 0) {
      setIsToolPanelExpanded(true);
      return;
    }

    setIsToolPanelExpanded(false);
  }

  async function handleSingleImageUpload(event, targetKey) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    updateProjectField(targetKey, dataUrl);
    event.target.value = "";
  }

  async function handleMergeOverlayUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    const images = await Promise.all(files.map((file) => readFileAsDataUrl(file)));
    setProject((prev) => ({
      ...prev,
      mergeOverlays: images,
      currentMergeIndex: 0
    }));
    event.target.value = "";
  }

  function addSticker(src) {
    const key = String(project.selectedCardIndex);
    const newSticker = {
      id: `sticker-${Date.now()}`,
      src,
      x: 710,
      y: 900,
      scale: 1,
      flipX: false
    };

    setProject((prev) => ({
      ...prev,
      cardIcons: {
        ...prev.cardIcons,
        [key]: [...(prev.cardIcons[key] || []), newSticker]
      }
    }));
    setActiveSticker({
      cardIndex: project.selectedCardIndex,
      stickerId: newSticker.id
    });
  }

  function removeSticker(cardIndex, stickerId) {
    const key = String(cardIndex);
    setProject((prev) => ({
      ...prev,
      cardIcons: {
        ...prev.cardIcons,
        [key]: (prev.cardIcons[key] || []).filter((sticker) => sticker.id !== stickerId)
      }
    }));

    if (activeSticker && activeSticker.stickerId === stickerId) {
      setActiveSticker(null);
    }
  }

  function updateActiveStickerField(field, value) {
    if (!activeSticker) {
      return;
    }

    const key = String(activeSticker.cardIndex);
    setProject((prev) => ({
      ...prev,
      cardIcons: {
        ...prev.cardIcons,
        [key]: (prev.cardIcons[key] || []).map((sticker) =>
          sticker.id === activeSticker.stickerId
            ? {
                ...sticker,
                [field]: value
              }
            : sticker,
        )
      }
    }));
  }

  function handleStickerDown(event, cardIndex, stickerId) {
    event.stopPropagation();
    const targetSticker = (project.cardIcons[String(cardIndex)] || []).find(
      (item) => item.id === stickerId,
    );

    if (!targetSticker) {
      return;
    }

    selectSticker(cardIndex, stickerId);
    dragRef.current = {
      cardIndex,
      stickerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: targetSticker.x,
      originY: targetSticker.y
    };
  }

  function resetProject() {
    const confirmed = window.confirm("確定要重置整個專案嗎？");
    if (!confirmed) {
      return;
    }

    const nextProject = normalizeProject();
    setProject(nextProject);
    setActiveSticker(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  function exportProjectJson() {
    downloadJson("md-to-rednote-project.json", project);
  }

  async function importProjectJson(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const raw = await file.text();
      const nextProject = normalizeProject(JSON.parse(raw));
      setProject(nextProject);
      setActiveSticker(null);
    } catch {
      window.alert("JSON 檔案格式無效。");
    } finally {
      event.target.value = "";
    }
  }

  function buildCaptureClone(node, { removePattern = false } = {}) {
    if (!node) {
      throw new Error("Capture node not found");
    }

    const source =
      node.classList?.contains("preview-card-shell") ? node : node.closest?.(".preview-card-shell") || node;
    const clone = source.cloneNode(true);
    clone.classList.add("capture-clone");
    clone.classList.remove("is-selected");
    clone.querySelectorAll('[data-export-remove="true"]').forEach((item) => item.remove());

    if (removePattern) {
      clone.querySelectorAll(".default-background-layer").forEach((item) => item.remove());
    }

    const clonedShell = clone.classList.contains("preview-card-shell") ? clone : null;
    const clonedTransform = clone.querySelector(".preview-card-transform");
    const clonedCardRoot = clone.querySelector(".card-root");

    if (clonedShell) {
      Object.assign(clonedShell.style, {
        width: `${CANVAS.width}px`,
        height: `${CANVAS.height}px`,
        background: "transparent",
        boxShadow: "none",
        borderRadius: "0"
      });
    }

    if (clonedTransform) {
      Object.assign(clonedTransform.style, {
        width: `${CANVAS.width}px`,
        height: `${CANVAS.height}px`,
        transform: "none"
      });
    }

    if (clonedCardRoot) {
      Object.assign(clonedCardRoot.style, {
        width: `${CANVAS.width}px`,
        height: `${CANVAS.height}px`
      });
    }

    Object.assign(clone.style, {
      width: `${CANVAS.width}px`,
      height: `${CANVAS.height}px`,
      transform: "none",
      margin: "0"
    });

    return clone;
  }

  async function collectExportStyles() {
    const styleNodes = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'));
    const hrefSignature = styleNodes
      .map((node) => {
        if (node.tagName === "STYLE") {
          return `style:${node.textContent?.length || 0}`;
        }

        return `link:${node.getAttribute("href") || ""}`;
      })
      .join("|");

    if (exportStylesCacheRef.current.hrefs === hrefSignature && exportStylesCacheRef.current.css) {
      return exportStylesCacheRef.current;
    }

    const chunks = [];

    for (const node of styleNodes) {
      if (node.tagName === "STYLE") {
        chunks.push(node.textContent || "");
        continue;
      }

      if (node.tagName === "LINK") {
        const rulesCss = readCssRulesFromSheet(node);
        if (rulesCss) {
          chunks.push(rulesCss);
          continue;
        }

        const href = node.getAttribute("href");
        if (!href) {
          continue;
        }

        try {
          const response = await fetch(new URL(href, window.location.origin).toString());
          if (!response.ok) {
            throw new Error(`Failed to load stylesheet: ${href}`);
          }

          chunks.push(await response.text());
        } catch (error) {
          console.warn("Skip stylesheet during export", href, error);
        }
      }
    }

    const css = chunks.join("\n");
    exportStylesCacheRef.current = {
      hrefs: hrefSignature,
      css
    };
    return exportStylesCacheRef.current;
  }

  async function exportNodeToBlob(node, options = {}, sharedStyles) {
    const clone = buildCaptureClone(node, options);
    const stylesBundle = sharedStyles || (await collectExportStyles());
    const styles = stylesBundle.css;
    const response = await fetchExportEndpoint({
      html: clone.outerHTML,
      styles,
      width: CANVAS.width,
      height: CANVAS.height,
      scale: 1,
      transparent: true,
      baseUrl: `${window.location.origin}/`
    });

    return response.blob();
  }

  async function exportItemsToBlobs(items, sharedStyles) {
    const stylesBundle = sharedStyles || (await collectExportStyles());
    const styles = stylesBundle.css;
    if (!items.length) {
      return [];
    }
    const response = await fetchExportEndpoint({
      items,
      styles,
      baseUrl: `${window.location.origin}/`
    });

    const payload = await response.json();
    return Array.isArray(payload?.images) ? payload.images.map((item) => base64PngToBlob(item)) : [];
  }

  async function captureNode(node, options = {}, sharedStyles) {
    try {
      return await exportNodeToBlob(node, options, sharedStyles);
    } catch (error) {
      if (isExportTransportError(error)) {
        throw new Error(getExportServiceUnavailableMessage());
      }

      throw error;
    }
  }

  async function captureItems(items, sharedStyles) {
    try {
      return await exportItemsToBlobs(items, sharedStyles);
    } catch (error) {
      if (isExportTransportError(error)) {
        throw new Error(getExportServiceUnavailableMessage());
      }

      throw error;
    }
  }

  function toggleMobileDownloadIndex(index) {
    const key = project.mode;
    setMobileDownloadSelection((prev) => {
      const current = new Set(prev[key] || []);
      if (current.has(index)) {
        current.delete(index);
      } else {
        current.add(index);
      }

      return {
        ...prev,
        [key]: Array.from(current).sort((left, right) => left - right)
      };
    });
  }

  function getGeneratorCaptureNode(index) {
    return generatorCardRefs.current[index] || exportGeneratorRef.current;
  }

  function getMergerCaptureNode() {
    return mergerCardRef.current || exportMergerRef.current;
  }

  function createExportItem(node, options = {}) {
    return {
      html: buildCaptureClone(node, options).outerHTML,
      width: CANVAS.width,
      height: CANVAS.height,
      scale: 1,
      transparent: true
    };
  }

  async function captureItemsInBatches(items, sharedStyles, onBatchStart, batchSizeOverride) {
    const blobs = [];
    const batchSize = batchSizeOverride || getExportBatchSize(isMobile);

    for (let start = 0; start < items.length; start += batchSize) {
      const batchIndex = Math.floor(start / batchSize);
      const batchItems = items.slice(start, start + batchSize);

      if (onBatchStart) {
        onBatchStart({
          batchIndex,
          batchCount: Math.ceil(items.length / batchSize),
          start,
          end: Math.min(start + batchItems.length, items.length),
          total: items.length
        });
      }

      const batchBlobs = await captureItems(batchItems, sharedStyles);
      blobs.push(...batchBlobs);
    }

    return blobs;
  }

  async function prepareMobileExportItems() {
    const selected =
      project.mode === "gen"
        ? (mobileDownloadSelection.gen || []).filter((index) => index >= 0 && index < cards.length)
        : (mobileDownloadSelection.merge || []).filter(
            (index) => index >= 0 && index < Math.max(project.mergeOverlays.length, 1),
          );

    if (!selected.length) {
      window.alert("請先選擇至少一張。");
      return;
    }

    setIsPreparingMobileExport(true);
    setMobileExportProgress({
      open: true,
      current: 0,
      total: selected.length,
      title: "正在準備圖片..."
    });

    try {
      const nextItems = [];
      const styles = await collectExportStyles();

      if (project.mode === "gen") {
        const originalIndex = project.selectedCardIndex;
        const items = [];
        const exportedIndexes = [];

        for (const [selectedIndex, index] of selected.entries()) {
          setMobileExportProgress({
            open: true,
            current: selectedIndex + 1,
            total: selected.length,
            title: `正在準備第 ${selectedIndex + 1} 張照片，共 ${selected.length} 張`
          });

          setProject((prev) => ({
            ...prev,
            selectedCardIndex: index
          }));

          await waitForPaint();

          const node = getGeneratorCaptureNode(index);
          if (!node) {
            continue;
          }

          items.push(createExportItem(node));
          exportedIndexes.push(index);
        }

        const blobs = await captureItemsInBatches(
          items,
          styles,
          ({ end, total }) => {
            setMobileExportProgress({
              open: true,
              current: end,
              total,
              title: `正在生成第 ${end} 張照片，共 ${total} 張`
            });
          },
          1,
        );
        blobs.forEach((blob, arrayIndex) => {
          const index = exportedIndexes[arrayIndex];
          nextItems.push({
            id: `gen-${index}`,
            label: `${index + 1}.png`,
            url: URL.createObjectURL(blob)
          });
        });

        setProject((prev) => ({
          ...prev,
          selectedCardIndex: originalIndex
        }));
      } else {
        const originalIndex = project.currentMergeIndex;
        const items = [];
        const exportedIndexes = [];

        for (const [selectedIndex, index] of selected.entries()) {
          setMobileExportProgress({
            open: true,
            current: selectedIndex + 1,
            total: selected.length,
            title: `正在準備第 ${selectedIndex + 1} 張照片，共 ${selected.length} 張`
          });

          setProject((prev) => ({
            ...prev,
            currentMergeIndex: index
          }));

          await waitForPaint();

          const node = getMergerCaptureNode();
          if (!node) {
            continue;
          }

          items.push(createExportItem(node));
          exportedIndexes.push(index);
        }

        const blobs = await captureItemsInBatches(
          items,
          styles,
          ({ end, total }) => {
            setMobileExportProgress({
              open: true,
              current: end,
              total,
              title: `正在生成第 ${end} 張照片，共 ${total} 張`
            });
          },
          1,
        );
        blobs.forEach((blob, arrayIndex) => {
          const index = exportedIndexes[arrayIndex];
          nextItems.push({
            id: `merge-${index}`,
            label: `${index + 1}.png`,
            url: URL.createObjectURL(blob)
          });
        });

        setProject((prev) => ({
          ...prev,
          currentMergeIndex: originalIndex
        }));
      }

      updateMobileExportItems(nextItems);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "未知錯誤";
      window.alert(`圖片準備失敗：${message}`);
    } finally {
      setIsPreparingMobileExport(false);
      setMobileExportProgress(EMPTY_MOBILE_EXPORT_PROGRESS);
    }
  }

  async function exportGenerator() {
    setExportState({
      open: true,
      title: "正在匯出卡片..."
    });

    try {
      const zip = new JSZip();
      const originalIndex = project.selectedCardIndex;
      const styles = await collectExportStyles();
      const items = [];
      const exportedIndexes = [];

      for (let index = 0; index < cards.length; index += 1) {
        setExportState({
          open: true,
          title: `正在處理第 ${index + 1} 張，共 ${cards.length} 張`
        });

        if (isMobile) {
          setProject((prev) => ({
            ...prev,
            selectedCardIndex: index
          }));

          await waitForPaint();
        }

        const node = getGeneratorCaptureNode(index);
        if (!node) {
          continue;
        }

        items.push(createExportItem(node));
        exportedIndexes.push(index);
      }

      const blobs = await captureItemsInBatches(items, styles, ({ end, total }) => {
        setExportState({
          open: true,
          title: `正在生成圖片 ${end} / ${total}`
        });
      });
      blobs.forEach((blob, arrayIndex) => {
        const index = exportedIndexes[arrayIndex];
        zip.file(`${index + 1}.png`, blob);
      });

      if (isMobile) {
        setProject((prev) => ({
          ...prev,
          selectedCardIndex: originalIndex
        }));
      }

      const content = await zip.generateAsync({ type: "blob" });
      downloadBlob(`md-to-rednote-${Date.now()}.zip`, content);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "未知錯誤";
      window.alert(`下載失敗：${message}`);
    } finally {
      setExportState({
        open: false,
        title: ""
      });
    }
  }

  async function exportMerger() {
    if (!project.mergeOverlays.length) {
      window.alert("請先上傳至少一張內容圖片。");
      return;
    }

    setExportState({
      open: true,
      title: "正在匯出合併卡片..."
    });

    try {
      const styles = await collectExportStyles();
      if (project.mergeOverlays.length === 1) {
        await waitForPaint();
        const node = getMergerCaptureNode();
        const blob = await captureNode(node, {}, styles);
        downloadBlob(`merge-${Date.now()}.png`, blob);
        return;
      }

      const zip = new JSZip();
      const originalIndex = project.currentMergeIndex;
      const items = [];
      const exportedIndexes = [];
      for (let index = 0; index < project.mergeOverlays.length; index += 1) {
        setExportState({
          open: true,
          title: `正在處理內容 ${index + 1} / ${project.mergeOverlays.length}`
        });

        setProject((prev) => ({
          ...prev,
          currentMergeIndex: index
        }));

        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        await waitForPaint();
        const node = getMergerCaptureNode();
        if (!node) {
          continue;
        }

        items.push(createExportItem(node));
        exportedIndexes.push(index);
      }

      const blobs = await captureItemsInBatches(items, styles, ({ end, total }) => {
        setExportState({
          open: true,
          title: `正在生成圖片 ${end} / ${total}`
        });
      });
      blobs.forEach((blob, arrayIndex) => {
        const index = exportedIndexes[arrayIndex];
        zip.file(`merge-${index + 1}.png`, blob);
      });

      setProject((prev) => ({
        ...prev,
        currentMergeIndex: originalIndex
      }));

      const content = await zip.generateAsync({ type: "blob" });
      downloadBlob(`merge-batch-${Date.now()}.zip`, content);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "未知錯誤";
      window.alert(`下載失敗：${message}`);
    } finally {
      setExportState({
        open: false,
        title: ""
      });
    }
  }

  function handleMainExport() {
    if (project.mode === "merge") {
      exportMerger();
      return;
    }
    exportGenerator();
  }

  function renderFooterSettings() {
    return (
      <ControlSection description="頁腳可顯示頁碼或自定義文案。" title="頁腳">
        <div className="segmented">
          {[
            { id: "page", label: "頁碼" },
            { id: "text", label: "文字" },
            { id: "none", label: "無" }
          ].map((item) => (
            <button
              className={`seg-btn ${project.footerMode === item.id ? "is-active" : ""}`}
              key={item.id}
              onClick={() => updateFooterMode(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        {project.footerMode === "text" ? (
          <label className="field">
            <span>頁腳文字</span>
            <input
              onChange={(event) => updateProjectField("adText", event.target.value)}
              type="text"
              value={project.adText}
            />
          </label>
        ) : null}
      </ControlSection>
    );
  }

  function renderGeneratorToolPanel() {
    if (activeTool === "style") {
      return (
        <ControlSection
          description="先決定版型，再開始填內容。不同風格現在會切換不同排版，不只是換顏色。"
          title="風格格式"
        >
          <div className="style-groups">
            {groupedStylePresets.map((group) => (
              <section className="style-group" key={group.id}>
                <div className="style-group-head">{group.name}</div>
                <div className="chip-grid style-grid">
                  {group.items.map((item) => (
                    <button
                      className={`chip-btn style-chip ${project.style === item.id ? "is-active" : ""}`}
                      key={item.id}
                      onClick={() => updateProjectField("style", item.id)}
                      type="button"
                    >
                      <span className={`style-chip-preview variant-${item.variant}`} />
                      <span>{item.name}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="field-grid">
            <label className="field">
              <span>主題色</span>
              <div className="color-input-wrap">
                <input
                  className="color-input"
                  onChange={(event) => updateProjectField("theme", event.target.value)}
                  type="color"
                  value={project.theme}
                />
                <input
                  onChange={(event) => updateProjectField("theme", event.target.value)}
                  type="text"
                  value={project.theme}
                />
              </div>
            </label>
            <label className="field">
              <span>字體組</span>
              <select
                onChange={(event) => updateProjectField("font", event.target.value)}
                value={project.font}
              >
                {FONT_PRESETS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </ControlSection>
      );
    }

    if (activeTool === "content") {
      return (
        <ControlSection description="從 Markdown 直接生成封面與內容卡片。" title="內容設定">
          <label className="field">
            <span>封面標題</span>
            <textarea
              onChange={(event) => updateProjectField("title", event.target.value)}
              rows={3}
              value={project.title}
            />
          </label>
          <label className="field">
            <span>作者</span>
            <input
              onChange={(event) => updateProjectField("author", event.target.value)}
              type="text"
              value={project.author}
            />
          </label>
          <label className="field checkbox-row">
            <span>顯示作者</span>
            <input
              checked={project.showAuthor}
              onChange={(event) => updateProjectField("showAuthor", event.target.checked)}
              type="checkbox"
            />
          </label>
          <label className="field">
            <span className="field-label-row">
              <span>Markdown 內容</span>
              <span className="field-label-actions">
                <button className="field-inline-action" onClick={formatMarkdownContent} type="button">
                  <Sparkles size={14} strokeWidth={2.2} />
                  <span>整理格式</span>
                </button>
                <button className="field-inline-action is-primary" onClick={formatCardMarkdownContent} type="button">
                  <Sparkles size={14} strokeWidth={2.2} />
                  <span>整理成卡片 Markdown</span>
                </button>
                <button
                  className="field-inline-action is-accent"
                  onClick={rewriteToRedNoteMarkdownContent}
                  type="button"
                >
                  <Sparkles size={14} strokeWidth={2.2} />
                  <span>整理成小紅書風格</span>
                </button>
              </span>
            </span>
            <textarea
              className="markdown-input"
              onChange={(event) => updateProjectField("content", event.target.value)}
              rows={24}
              value={project.content}
            />
          </label>
          <MarkdownGuide />
        </ControlSection>
      );
    }

    if (activeTool === "background") {
      return (
        <ControlSection
          description="預覽可以有底紋，但匯出時沒有自訂底圖就會自動走純白。"
          title="背景與封面圖"
        >
          <label className="field checkbox-row">
            <span>預覽使用默認底紋</span>
            <input
              checked={project.useDefaultBg}
              onChange={(event) => updateProjectField("useDefaultBg", event.target.checked)}
              type="checkbox"
            />
          </label>
          <div className="field-grid two-up">
            <label className="upload-card">
              <FileImage size={18} strokeWidth={2.1} />
              <span>上傳底圖</span>
              <input
                accept="image/*"
                onChange={(event) => handleSingleImageUpload(event, "uploadedBaseImg")}
                type="file"
              />
            </label>
            <label className="upload-card">
              <Images size={18} strokeWidth={2.1} />
              <span>上傳封面圖</span>
              <input
                accept="image/*"
                onChange={(event) => handleSingleImageUpload(event, "coverImg")}
                type="file"
              />
            </label>
          </div>
        </ControlSection>
      );
    }

    if (activeTool === "footer") {
      return renderFooterSettings();
    }

    if (activeTool === "download") {
      const selected = mobileDownloadSelection.gen || [];

      return (
        <ControlSection title="下載">
          <div className="download-select-grid">
            {cards.map((_, index) => (
              <button
                className={`download-chip ${selected.includes(index) ? "is-active" : ""}`}
                disabled={isPreparingMobileExport}
                key={`download-gen-${index}`}
                onClick={() => toggleMobileDownloadIndex(index)}
                type="button"
              >
                {index + 1}
              </button>
            ))}
          </div>
          <div className="download-actions">
            <button
              className="seg-btn"
              disabled={isPreparingMobileExport}
              onClick={() =>
                setMobileDownloadSelection((prev) => ({
                  ...prev,
                  gen: cards.map((_, index) => index)
                }))
              }
              type="button"
            >
              全選
            </button>
            <button
              className="seg-btn"
              disabled={isPreparingMobileExport}
              onClick={() =>
                setMobileDownloadSelection((prev) => ({
                  ...prev,
                  gen: []
                }))
              }
              type="button"
            >
              清空
            </button>
            <button
              className="seg-btn is-wide"
              disabled={isPreparingMobileExport}
              onClick={prepareMobileExportItems}
              type="button"
            >
              {isPreparingMobileExport ? "準備中" : "產生圖片"}
            </button>
          </div>
          <DownloadProgress progress={mobileExportProgress} />
          {mobileExportItems.length ? (
            <div className="mobile-export-gallery">
              {mobileExportItems.map((item) => (
                <a
                  className="mobile-export-item"
                  download={item.label}
                  href={item.url}
                  key={item.id}
                  rel="noreferrer"
                  target="_blank"
                >
                  <img alt={item.label} src={item.url} />
                  <span>{item.label}</span>
                </a>
              ))}
            </div>
          ) : null}
        </ControlSection>
      );
    }

    return (
      <ControlSection title="貼圖">
        <div className="active-sticker-panel">
          <div className="active-sticker-title">
            <Sticker size={16} strokeWidth={2.2} />
            <span>貼圖控制</span>
          </div>
          <label className="field">
            <span>縮放</span>
            <input
              disabled={!currentActiveSticker}
              max="2.2"
              min="0.5"
              onChange={(event) => updateActiveStickerField("scale", Number(event.target.value))}
              step="0.1"
              type="range"
              value={currentActiveSticker?.scale || 1}
            />
          </label>
          <button
            className="seg-btn is-wide"
            disabled={!currentActiveSticker}
            onClick={() => currentActiveSticker && updateActiveStickerField("flipX", !currentActiveSticker.flipX)}
            type="button"
          >
            左右翻轉
          </button>
        </div>
        <div className="segmented">
          {STICKER_TABS.map((tab) => (
            <button
              className={`seg-btn ${project.stickerTab === tab.id ? "is-active" : ""}`}
              key={tab.id}
              onClick={() => updateProjectField("stickerTab", tab.id)}
              type="button"
            >
              {tab.name}
            </button>
          ))}
        </div>
        <div className="sticker-grid">
          {(STICKER_SETS[project.stickerTab] || []).map((item) => (
            <button className="sticker-pick" key={item.id} onClick={() => addSticker(item.src)} type="button">
              <img alt="" src={item.src} />
            </button>
          ))}
        </div>
      </ControlSection>
    );
  }

  function renderMergerToolPanel() {
    if (activeTool === "assets") {
      return (
        <ControlSection
          description="上傳一張圖片背景與多張內容圖，即可批量輸出。圖片背景會蓋在內容上方。"
          title="合併素材"
        >
          <label className="field checkbox-row">
            <span>預覽使用默認底紋</span>
            <input
              checked={project.useDefaultBgMerger}
              onChange={(event) => updateProjectField("useDefaultBgMerger", event.target.checked)}
              type="checkbox"
            />
          </label>
          <div className="field-grid two-up">
            <label className="upload-card">
              <Layers3 size={18} strokeWidth={2.1} />
              <span>上傳圖片背景</span>
              <input
                accept="image/*"
                onChange={(event) => handleSingleImageUpload(event, "mergeBg")}
                type="file"
              />
            </label>
            <label className="upload-card">
              <Images size={18} strokeWidth={2.1} />
              <span>上傳內容</span>
              <input accept="image/*" multiple onChange={handleMergeOverlayUpload} type="file" />
            </label>
          </div>
          <div className="overlay-count">目前內容數量：{project.mergeOverlays.length}</div>
          <label className="field">
            <span className="field-label-row">
              <span>內容縮放</span>
              <span className="field-value-chip">{formatScaleLabel(project.mergeOverlayScale)}</span>
            </span>
            <input
              max={String(MERGE_OVERLAY_SCALE_MAX)}
              min={String(MERGE_OVERLAY_SCALE_MIN)}
              onChange={(event) =>
                updateProjectField("mergeOverlayScale", Number(event.target.value))
              }
              step={String(MERGE_OVERLAY_SCALE_STEP)}
              type="range"
              value={project.mergeOverlayScale}
            />
            <span className="field-hint">控制上傳內容圖的縮放倍率，預覽與匯出會同步套用。</span>
          </label>
          <label className="field">
            <span className="field-label-row">
              <span>X 軸位移</span>
              <span className="field-value-chip">{formatOffsetLabel(project.mergeOverlayOffsetX)}</span>
            </span>
            <input
              max={String(MERGE_OVERLAY_OFFSET_MAX)}
              min={String(MERGE_OVERLAY_OFFSET_MIN)}
              onChange={(event) =>
                updateProjectField("mergeOverlayOffsetX", Number(event.target.value))
              }
              step={String(MERGE_OVERLAY_OFFSET_STEP)}
              type="range"
              value={project.mergeOverlayOffsetX}
            />
          </label>
          <label className="field">
            <span className="field-label-row">
              <span>Y 軸位移</span>
              <span className="field-value-chip">{formatOffsetLabel(project.mergeOverlayOffsetY)}</span>
            </span>
            <input
              max={String(MERGE_OVERLAY_OFFSET_MAX)}
              min={String(MERGE_OVERLAY_OFFSET_MIN)}
              onChange={(event) =>
                updateProjectField("mergeOverlayOffsetY", Number(event.target.value))
              }
              step={String(MERGE_OVERLAY_OFFSET_STEP)}
              type="range"
              value={project.mergeOverlayOffsetY}
            />
            <span className="field-hint">`X` 控制左右，`Y` 控制上下，預覽與匯出同步。</span>
          </label>
          <div className="field-grid">
            <button
              className="seg-btn"
              onClick={() => updateProjectField("mergeOverlayScale", 1)}
              type="button"
            >
              縮放重置
            </button>
            <button
              className="seg-btn"
              onClick={() => {
                updateProjectField("mergeOverlayOffsetX", 0);
                updateProjectField("mergeOverlayOffsetY", 0);
              }}
              type="button"
            >
              位置重置
            </button>
          </div>
        </ControlSection>
      );
    }

    if (activeTool === "download") {
      const mergeCount = Math.max(project.mergeOverlays.length, 1);
      const selected = mobileDownloadSelection.merge || [];

      return (
        <ControlSection title="下載">
          <div className="download-select-grid">
            {Array.from({ length: mergeCount }, (_, index) => (
              <button
                className={`download-chip ${selected.includes(index) ? "is-active" : ""}`}
                disabled={isPreparingMobileExport}
                key={`download-merge-${index}`}
                onClick={() => toggleMobileDownloadIndex(index)}
                type="button"
              >
                {index + 1}
              </button>
            ))}
          </div>
          <div className="download-actions">
            <button
              className="seg-btn"
              disabled={isPreparingMobileExport}
              onClick={() =>
                setMobileDownloadSelection((prev) => ({
                  ...prev,
                  merge: Array.from({ length: mergeCount }, (_, index) => index)
                }))
              }
              type="button"
            >
              全選
            </button>
            <button
              className="seg-btn"
              disabled={isPreparingMobileExport}
              onClick={() =>
                setMobileDownloadSelection((prev) => ({
                  ...prev,
                  merge: []
                }))
              }
              type="button"
            >
              清空
            </button>
            <button
              className="seg-btn is-wide"
              disabled={isPreparingMobileExport}
              onClick={prepareMobileExportItems}
              type="button"
            >
              {isPreparingMobileExport ? "準備中" : "產生圖片"}
            </button>
          </div>
          <DownloadProgress progress={mobileExportProgress} />
          {mobileExportItems.length ? (
            <div className="mobile-export-gallery">
              {mobileExportItems.map((item) => (
                <a
                  className="mobile-export-item"
                  download={item.label}
                  href={item.url}
                  key={item.id}
                  rel="noreferrer"
                  target="_blank"
                >
                  <img alt={item.label} src={item.url} />
                  <span>{item.label}</span>
                </a>
              ))}
            </div>
          ) : null}
        </ControlSection>
      );
    }

    return renderFooterSettings();
  }

  return (
    <div className="app-shell">
      <input
        accept=".json"
        className="hidden-input"
        onChange={importProjectJson}
        ref={importRef}
        type="file"
      />

      <header className="topbar">
        <div className="topbar-main">
          <div className="brand-block">
            <div className="brand-mark">
              <Sparkles size={18} strokeWidth={2.1} />
            </div>
            <div>
              <div className="brand-title">MdToRedNote Studio</div>
              <div className="brand-subtitle">React rewrite with white-safe export</div>
            </div>
          </div>

          <div className="toolbar">
            <ToolbarButton icon={FolderOpen} onClick={() => importRef.current?.click()}>
              匯入 JSON
            </ToolbarButton>
            <ToolbarButton icon={Save} onClick={exportProjectJson}>
              備份專案
            </ToolbarButton>
            <ToolbarButton icon={RefreshCcw} onClick={resetProject}>
              重置
            </ToolbarButton>
          </div>
        </div>

        <div className="topbar-nav">
          <div className="mode-switch">
            {Object.entries(MODE_META).map(([modeId, meta]) => (
              <button
                className={`mode-btn ${project.mode === modeId ? "is-active" : ""}`}
                key={modeId}
                onClick={() => updateProjectField("mode", modeId)}
                type="button"
              >
                <strong>{meta.title}</strong>
                <small>{meta.description}</small>
              </button>
            ))}
          </div>

          <div className="mode-meta-chip">{MODE_META[project.mode].description}</div>
        </div>
      </header>

      <main className={`workspace ${isToolPanelExpanded ? "is-sheet-expanded" : ""}`}>
        <aside className={`sidebar controls-panel ${isToolPanelExpanded ? "is-expanded" : ""}`}>
          <div className="tools-shell">
            <div className="tool-sheet-bar">
              <div
                className="tool-sheet-handle"
              />
              <div
                className="tool-sheet-gesture-layer"
                onTouchEnd={handleToolSheetTouchEnd}
                onTouchStart={handleToolSheetTouchStart}
              />
              <button
                aria-label={isToolPanelExpanded ? "縮小工具欄" : "展開工具欄"}
                className="tool-sheet-toggle"
                onClick={() => setIsToolPanelExpanded((prev) => !prev)}
                type="button"
              >
                {isToolPanelExpanded ? (
                  <Minimize2 size={12} strokeWidth={2.2} />
                ) : (
                  <Maximize2 size={12} strokeWidth={2.2} />
                )}
              </button>
            </div>

            <div className="tool-dock">
              {currentTools.map((tool) => (
                <ToolButton
                  active={activeTool === tool.id}
                  description={tool.description}
                  icon={tool.icon}
                  key={tool.id}
                  label={tool.label}
                  onClick={() => setActiveTool(tool.id)}
                />
              ))}
            </div>

            <div className="tool-panel">
              {project.mode === "gen" ? renderGeneratorToolPanel() : renderMergerToolPanel()}
            </div>
          </div>
        </aside>

        <section className="preview-panel" ref={previewPaneRef}>
          <div className="preview-head">
            <div>
              <h2>{project.mode === "gen" ? "卡片預覽" : "合併預覽"}</h2>
              <p>手機可雙指縮放，左右滑動切換。</p>
            </div>

            <div className="preview-head-actions">
              <div className="preview-page-indicator">
                {currentPreviewIndex + 1} / {totalPreviewCount}
              </div>
              {project.mode === "merge" && project.mergeOverlays.length > 1 ? (
                <div className="merge-nav">
                  <button
                    className="seg-btn"
                    disabled={project.currentMergeIndex <= 0}
                    onClick={() =>
                      updateProjectField("currentMergeIndex", Math.max(project.currentMergeIndex - 1, 0))
                    }
                    type="button"
                  >
                    上一張
                  </button>
                  <button
                    className="seg-btn"
                    disabled={project.currentMergeIndex >= project.mergeOverlays.length - 1}
                    onClick={() =>
                      updateProjectField(
                        "currentMergeIndex",
                        Math.min(project.currentMergeIndex + 1, project.mergeOverlays.length - 1),
                      )
                    }
                    type="button"
                  >
                    下一張
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div
            className={`preview-canvas-zone ${isMobile ? "is-mobile-carousel" : ""}`}
            onTouchEnd={handlePreviewTouchEnd}
            onTouchMove={handlePreviewTouchMove}
            onTouchStart={handlePreviewTouchStart}
          >
            {project.mode === "gen" ? (
              mobileGeneratorWindow.map(({ card, index, position }) => (
                <GeneratorCard
                  activeSticker={activeSticker}
                  card={card}
                  cardIndex={index}
                  cardRef={(node) => {
                    if (position === "current") {
                      generatorCardRefs.current[index] = node;
                    }
                  }}
                  key={`card-${index}`}
                  onSelect={(cardIndex) => {
                    updateProjectField("selectedCardIndex", cardIndex);
                    setActiveSticker(null);
                  }}
                  onStickerSelect={selectSticker}
                  onStickerDown={handleStickerDown}
                  onStickerRemove={removeSticker}
                  previewScale={effectivePreviewScale}
                  project={project}
                  selected={project.selectedCardIndex === index}
                  shellClassName={isMobile ? `mobile-card-${position}` : ""}
                  stickers={project.cardIcons[String(index)] || []}
                  stylePreset={stylePreset}
                  totalCards={cards.length}
                />
              ))
            ) : (
              mobileMergeWindow.map(({ index, position }) => (
                <MergerCard
                  cardRef={position === "current" ? mergerCardRef : null}
                  displayIndex={index}
                  key={`merge-${index}`}
                  onSelect={() => updateProjectField("currentMergeIndex", index)}
                  previewScale={effectivePreviewScale}
                  project={project}
                  shellClassName={isMobile ? `mobile-card-${position}` : ""}
                />
              ))
            )}
          </div>
        </section>
      </main>

      <div className="measure-root">
        <div ref={measureRef} />
      </div>

      <div className="export-render-root" aria-hidden="true">
        <GeneratorCard
          activeSticker={null}
          card={cards[Math.min(project.selectedCardIndex, Math.max(cards.length - 1, 0))] || cards[0]}
          cardIndex={Math.min(project.selectedCardIndex, Math.max(cards.length - 1, 0))}
          cardRef={exportGeneratorRef}
          onSelect={() => {}}
          onStickerDown={() => {}}
          onStickerRemove={() => {}}
          onStickerSelect={() => {}}
          previewScale={1}
          project={project}
          selected={false}
          stickers={project.cardIcons[String(Math.min(project.selectedCardIndex, Math.max(cards.length - 1, 0)))] || []}
          stylePreset={stylePreset}
          totalCards={cards.length}
        />
        <MergerCard
          cardRef={exportMergerRef}
          displayIndex={project.currentMergeIndex}
          onSelect={() => {}}
          previewScale={1}
          project={project}
        />
      </div>

      {exportState.open ? (
        <div className="export-overlay">
          <div className="export-panel">
            <div className="spinner" />
            <div>{exportState.title}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
