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
import html2canvas from "html2canvas";
import JSZip from "jszip";
import {
  CANVAS,
  DEFAULT_BACKGROUND,
  STORAGE_KEY,
  STICKER_SETS,
  STICKER_TABS,
  STYLE_PRESETS,
  getStylePreset
} from "./constants";
import {
  canvasToBlob,
  downloadBlob,
  downloadJson,
  normalizeProject,
  paginateMarkdown,
  readFileAsDataUrl,
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
  const score = Math.max(plain.length, longestLine * 1.5);

  if (score >= 34) return "title-size-xs";
  if (score >= 26) return "title-size-sm";
  if (score >= 20) return "title-size-md";
  return "title-size-lg";
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

function buildExportThemeVars(theme) {
  const base = hexToRgb(theme);
  const white = { r: 255, g: 255, b: 255 };
  const dark = { r: 15, g: 23, b: 42 };

  return {
    "--export-theme": rgbString(base),
    "--export-theme-soft": rgbString(mixRgb(base, white, 0.84)),
    "--export-theme-pale": rgbString(mixRgb(base, white, 0.92)),
    "--export-theme-line": rgbString(mixRgb(base, white, 0.64)),
    "--export-theme-deep": rgbString(mixRgb(base, dark, 0.26)),
    "--export-theme-shadow": rgbString(mixRgb(base, white, 0.76)),
    "--export-theme-tint": rgbString(base, 0.14)
  };
}

function CoverCard({ project, stylePreset }) {
  const titleLines = splitTitleLines(project.title);
  const variant = stylePreset.variant;
  const titleSizeClass = getCoverTitleSizeClass(project.title);

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
        <h1 className={`cover-title ${titleSizeClass}`}>
          {titleLines.map((line, index) => (
            <span key={`${line}-${index}`}>{line}</span>
          ))}
        </h1>
      </div>
    </div>
  );
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
          style={{ "--theme": project.theme }}
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
            <Footer project={project} pageNumber={cardIndex + 1} totalCards={totalCards} />
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
    bottom: 60
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
          style={{ "--theme": project.theme }}
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
                <img alt="" className="merge-content-image" src={contentImage} />
              ) : (
                <div className="merge-placeholder">尚未上傳內容</div>
              )}
              {project.mergeBg ? (
                <img alt="" className="merge-background-image" src={project.mergeBg} />
              ) : null}
            </div>
            <Footer
              project={project}
              pageNumber={safeIndex + 1}
              totalCards={Math.max(project.mergeOverlays.length, 1)}
            />
          </div>
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

  async function waitForRenderableAssets(root) {
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // Ignore font readiness failures and continue export.
      }
    }

    const images = Array.from(root.querySelectorAll("img"));
    await Promise.all(
      images.map(
        (image) =>
          new Promise((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }

            image.onload = () => resolve();
            image.onerror = () => resolve();
          }),
      ),
    );
  }

  async function captureNode(node, { removePattern = false } = {}) {
    if (!node) {
      throw new Error("Capture node not found");
    }

    const clone = node.cloneNode(true);
    clone.classList.add("capture-clone", "export-safe");
    clone.querySelectorAll('[data-export-remove="true"]').forEach((item) => item.remove());
    Object.entries(buildExportThemeVars(project.theme)).forEach(([key, value]) => {
      clone.style.setProperty(key, value);
    });

    if (removePattern) {
      clone.querySelectorAll(".default-background-layer").forEach((item) => item.remove());
    }

    Object.assign(clone.style, {
      position: "fixed",
      top: "0",
      left: "-12000px",
      width: `${CANVAS.width}px`,
      height: `${CANVAS.height}px`,
      transform: "none",
      margin: "0",
      zIndex: "9999"
    });

    document.body.appendChild(clone);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await waitForRenderableAssets(clone);

    try {
      return await html2canvas(clone, {
        width: CANVAS.width,
        height: CANVAS.height,
        backgroundColor: "#ffffff",
        scale: 1,
        useCORS: true,
        allowTaint: true,
        logging: false
      });
    } finally {
      clone.remove();
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

    try {
      const nextItems = [];

      if (project.mode === "gen") {
        const originalIndex = project.selectedCardIndex;

        for (const index of selected) {
          setProject((prev) => ({
            ...prev,
            selectedCardIndex: index
          }));

          await waitForPaint();

          const node = isMobile ? exportGeneratorRef.current : generatorCardRefs.current[index];
          if (!node) {
            continue;
          }

          const canvas = await captureNode(node);
          const blob = await canvasToBlob(canvas);
          nextItems.push({
            id: `gen-${index}`,
            label: `${index + 1}.png`,
            url: URL.createObjectURL(blob)
          });
        }

        setProject((prev) => ({
          ...prev,
          selectedCardIndex: originalIndex
        }));
      } else {
        const originalIndex = project.currentMergeIndex;

        for (const index of selected) {
          setProject((prev) => ({
            ...prev,
            currentMergeIndex: index
          }));

          await waitForPaint();

          const node = isMobile ? exportMergerRef.current : mergerCardRef.current;
          if (!node) {
            continue;
          }

          const canvas = await captureNode(node);
          const blob = await canvasToBlob(canvas);
          nextItems.push({
            id: `merge-${index}`,
            label: `${index + 1}.png`,
            url: URL.createObjectURL(blob)
          });
        }

        setProject((prev) => ({
          ...prev,
          currentMergeIndex: originalIndex
        }));
      }

      updateMobileExportItems(nextItems);
    } catch (error) {
      console.error(error);
      window.alert("圖片準備失敗。");
    } finally {
      setIsPreparingMobileExport(false);
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

        const node = isMobile ? exportGeneratorRef.current : generatorCardRefs.current[index];
        if (!node) {
          continue;
        }

        const canvas = await captureNode(node);
        const blob = await canvasToBlob(canvas);
        zip.file(`${index + 1}.png`, blob);
      }

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
      if (project.mergeOverlays.length === 1) {
        const canvas = await captureNode(isMobile ? exportMergerRef.current : mergerCardRef.current);
        const blob = await canvasToBlob(canvas);
        downloadBlob(`merge-${Date.now()}.png`, blob);
        return;
      }

      const zip = new JSZip();
      const originalIndex = project.currentMergeIndex;
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

        const canvas = await captureNode(isMobile ? exportMergerRef.current : mergerCardRef.current);
        const blob = await canvasToBlob(canvas);
        zip.file(`merge-${index + 1}.png`, blob);
      }

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
          <div className="chip-grid style-grid">
            {STYLE_PRESETS.map((item) => (
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
            <span>Markdown 內容</span>
            <textarea
              onChange={(event) => updateProjectField("content", event.target.value)}
              rows={14}
              value={project.content}
            />
          </label>
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
            <button className="seg-btn is-wide" onClick={prepareMobileExportItems} type="button">
              {isPreparingMobileExport ? "準備中" : "產生圖片"}
            </button>
          </div>
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
            <button className="seg-btn is-wide" onClick={prepareMobileExportItems} type="button">
              {isPreparingMobileExport ? "準備中" : "產生圖片"}
            </button>
          </div>
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
            <ToolbarButton icon={Download} onClick={handleMainExport} variant="primary">
              {project.mode === "merge" && project.mergeOverlays.length > 1 ? "批量下載" : "下載"}
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
          selected
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
