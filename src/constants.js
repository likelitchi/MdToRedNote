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

export const STYLE_PRESETS = [
  { id: "minimal", name: "極簡專欄", variant: "minimal", family: "sans" },
  { id: "memo", name: "課堂筆記", variant: "memo", family: "rounded" },
  { id: "journal", name: "手帳整理", variant: "journal", family: "serif" },
  { id: "magazine", name: "雜誌感", variant: "magazine", family: "serif" },
  { id: "tutorial", name: "教程化", variant: "tutorial", family: "sans" },
  { id: "review", name: "測評風", variant: "review", family: "sans" },
  { id: "painpoint", name: "痛點法", variant: "painpoint", family: "sans" },
  { id: "poster", name: "海報焦點", variant: "poster", family: "sans" },
  { id: "tech", name: "科技簡報", variant: "tech", family: "sans" },
  { id: "comic", name: "漫畫活力", variant: "comic", family: "rounded" },
  { id: "elegant", name: "清新柔光", variant: "elegant", family: "serif" }
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
  scene: "default",
  useDefaultBg: true,
  uploadedBaseImg: null,
  coverImg: null,
  selectedCardIndex: 0,
  cardIcons: {},
  useDefaultBgMerger: true,
  mergeBg: null,
  mergeOverlays: [],
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

export function getScenePreset(sceneId) {
  return (
    SCENE_PRESETS.find((item) => item.id === sceneId) ||
    SCENE_PRESETS[0]
  );
}
