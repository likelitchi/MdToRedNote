export const STORAGE_KEY = "md_to_rednote_studio";

export const CANVAS = {
  width: 1080,
  height: 1350,
  headerHeight: 140,
  footerHeight: 90,
  paddingX: 92,
  paddingTop: 168,
  paddingBottom: 116,
};

export const DEFAULT_BACKGROUND = "/frame.png";

export const STYLE_GROUPS = [
  { id: "classic", name: "經典實用" },
  { id: "editorial", name: "雜誌排版" },
  { id: "retro", name: "復古紙感" },
  { id: "mood", name: "氛圍配色" }
];

export const STYLE_PRESETS = [
  { id: "minimal", name: "極簡專欄", variant: "minimal", family: "sans", group: "classic" },
  { id: "memo", name: "課堂筆記", variant: "memo", family: "rounded", group: "classic" },
  { id: "journal", name: "手帳整理", variant: "journal", family: "serif", group: "classic" },
  { id: "tutorial", name: "教程化", variant: "tutorial", family: "sans", group: "classic" },
  { id: "review", name: "測評風", variant: "review", family: "sans", group: "classic" },
  { id: "painpoint", name: "痛點法", variant: "painpoint", family: "sans", group: "classic" },
  { id: "poster", name: "海報焦點", variant: "poster", family: "sans", group: "classic" },
  { id: "tech", name: "科技簡報", variant: "tech", family: "sans", group: "classic" },
  { id: "comic", name: "漫畫活力", variant: "comic", family: "rounded", group: "classic" },
  { id: "magazine", name: "雜誌感", variant: "magazine", family: "serif", group: "editorial" },
  { id: "modern", name: "現代編輯", variant: "modern", family: "sans", group: "editorial" },
  { id: "elegant", name: "清新柔光", variant: "elegant", family: "serif", group: "editorial" },
  { id: "darkpro", name: "暗色專業", variant: "darkpro", family: "sans", group: "editorial" },
  { id: "reading", name: "閱讀筆記", variant: "reading", family: "serif", group: "editorial" },
  { id: "vintage", name: "復古紙感", variant: "vintage", family: "serif", group: "retro" },
  { id: "typewriter", name: "打字機札記", variant: "typewriter", family: "serif", group: "retro" },
  { id: "deco", name: "裝飾派海報", variant: "deco", family: "serif", group: "retro" },
  { id: "washi", name: "和風雜誌", variant: "washi", family: "serif", group: "retro" },
  { id: "film", name: "膠片年鑑", variant: "film", family: "sans", group: "retro" },
  { id: "warmsoft", name: "暖霧生活", variant: "warmsoft", family: "serif", group: "mood" },
  { id: "dreamy", name: "夢幻漸變", variant: "dreamy", family: "serif", group: "mood" },
  { id: "forest", name: "森林綠境", variant: "forest", family: "sans", group: "mood" },
  { id: "rosegold", name: "玫瑰金霧", variant: "rosegold", family: "serif", group: "mood" }
];

export const FONT_PRESETS = [
  {
    id: "balanced",
    name: "平衡黑體",
    sans: '"Inter", "Noto Sans TC", sans-serif',
    serif: '"Source Serif 4", "Noto Serif TC", serif',
    rounded: '"Nunito", "Noto Sans TC", sans-serif'
  },
  {
    id: "editorial",
    name: "編輯感",
    sans: '"IBM Plex Sans", "Noto Sans TC", sans-serif',
    serif: '"Spectral", "Noto Serif TC", serif',
    rounded: '"IBM Plex Sans", "Noto Sans TC", sans-serif'
  },
  {
    id: "friendly",
    name: "親和圓潤",
    sans: '"Nunito", "Noto Sans TC", sans-serif',
    serif: '"Source Serif 4", "Noto Serif TC", serif',
    rounded: '"Nunito", "Noto Sans TC", sans-serif'
  },
  {
    id: "classic",
    name: "經典襯線",
    sans: '"Inter", "Noto Sans TC", sans-serif',
    serif: '"Cormorant Garamond", "Noto Serif TC", serif',
    rounded: '"Nunito", "Noto Sans TC", sans-serif'
  }
];

export const STYLE_MIGRATION = {
  playful: "comic",
  frame: "minimal",
  immersive: "poster",
  visualflow: "magazine",
  solid: "poster",
  dark: "tech",
  paper: "journal",
  ink: "journal",
  dry: "review",
  nostalgia: "journal"
};

export const SCENE_PRESETS = [
  { id: "default", name: "默認", badge: "" },
  { id: "newbie", name: "新手版", badge: "新手友好" },
  { id: "pro", name: "專業版", badge: "專業拆解" },
  { id: "case", name: "案例版", badge: "案例實戰" },
  { id: "checklist", name: "清單版", badge: "步驟清單" }
];

export const STICKER_TABS = [
  { id: "princess", name: "Princess" },
  { id: "doctor", name: "Doctor" }
];

export const STICKER_SETS = {
  princess: Array.from({ length: 13 }, (_, idx) => ({
    id: `princess-${idx + 1}`,
    src: `/character/princess/princess-${idx + 1}.png`
  })),
  doctor: Array.from({ length: 12 }, (_, idx) => ({
    id: `doctor-${idx + 1}`,
    src: `/character/doctor/doctor-${idx + 1}.png`
  }))
};

export const DEFAULT_PROJECT = {
  mode: "gen",
  title: "IG 知識分享模板\n3 步驟做出高收藏貼文",
  author: "@YourBrand",
  content:
    "## 1. 一頁只講一個重點\n讀者 3 秒要看懂你在講什麼。\n\n---\n\n## 2. 標題先寫結論\n先給結果，再補方法和例子。\n\n---\n\n## 3. 用一致的語氣與配色\n固定模板，品牌感會更快建立。",
  footerMode: "page",
  adText: "收藏 + 分享給朋友",
  theme: "#2563eb",
  style: "minimal",
  font: "balanced",
  scene: "default",
  useDefaultBg: true,
  uploadedBaseImg: null,
  coverImg: null,
  selectedCardIndex: 0,
  cardIcons: {},
  useDefaultBgMerger: true,
  mergeBg: null,
  mergeOverlays: [],
  mergeOverlayScale: 1,
  mergeOverlayOffsetX: 0,
  mergeOverlayOffsetY: 0,
  currentMergeIndex: 0,
  showAuthor: false,
  stickerTab: "princess"
};

export function getStylePreset(styleId) {
  return (
    STYLE_PRESETS.find((item) => item.id === styleId) ||
    STYLE_PRESETS.find((item) => item.id === "minimal")
  );
}

export function getFontPreset(fontId) {
  return (
    FONT_PRESETS.find((item) => item.id === fontId) ||
    FONT_PRESETS.find((item) => item.id === "balanced")
  );
}

export function getScenePreset(sceneId) {
  return (
    SCENE_PRESETS.find((item) => item.id === sceneId) ||
    SCENE_PRESETS[0]
  );
}
