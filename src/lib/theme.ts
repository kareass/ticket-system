import type { ThemeConfig } from "antd";

/**
 * 视觉令牌 —— 全站唯一来源（方向：柔和 · 苔绿）
 *
 * 设计约定（改任何一色前先读这段）：
 * 1. **强调色当填充** 与 **强调色当文字** 是两个不同色值，不可互换。
 *    #7C8C6A 在白底上只有 3.61:1，达不到正文 4.5:1；因此：
 *    - `accent`    仅用于填充、描边、标记条等**非文字**处
 *    - `accentInk` 用于强调色的**文字/图标**（5.08:1）
 *    主按钮不用实心强调色底（白字压浅橄榄仅 3.61:1），改「浅底 + 强调描边 + 深字」。
 * 2. **次要文字** 与 **装饰灰** 也是两个值：`ink2` 是可读的次要文字（5.05:1），
 *    `ornament` 只许用在三角、图标、圆点等非文字处（4.2:1，当正文不合格）。
 * 3. 圆角分两档：卡片 14px、控件 10px —— 全套统一，不混第三档。
 * 4. 阴影一律用 ink 色调的极柔投影，禁止纯黑投影、禁止零偏移的彩色光晕。
 * 5. 颜色在本方向里是**稀缺资源**：系统名不再按色区分（列表里是等色文字），
 *    颜色只留给「未提交」（强调色）与「异常/逾期」（砖红）两件事。
 */

/* ------------------------------------------------------------------ */
/* 一、原始色板                                                        */
/* ------------------------------------------------------------------ */

export const MOSS = {
  /** 页面地色：米白微绿 */
  bg: "#F4F5F0",
  /** 卡片/表格底 */
  card: "#FFFFFF",
  /** 主文字 12.16:1 */
  ink: "#33372E",
  /** 次要文字 5.05:1（可读灰） */
  ink2: "#6B7160",
  /** 装饰灰 4.2:1 —— 仅三角/图标/圆点，禁止当正文 */
  ornament: "#7E8474",
  /** 强调色（填充/描边用） */
  accent: "#7C8C6A",
  /** 强调色的文字版本 5.08:1 */
  accentInk: "#62744F",
  /** 强调色 10% 浅底 */
  accentTint: "rgba(124, 140, 106, 0.10)",
  /** 强调色较实的浅底（悬停/选中） */
  accentTint2: "rgba(124, 140, 106, 0.18)",
  /** 发丝线 */
  line: "#E3E6DC",
  /** 略重的分隔线 */
  line2: "#DCE0D3",
  /** 行悬停底 */
  hover: "#F8F9F4",
  /** 危险/逾期文字 5.86:1 */
  danger: "#A34A34",
  /** 危险填充（白字 4.92:1） */
  dangerFill: "#B5533C",
  /** 危险浅底 */
  dangerTint: "rgba(181, 83, 60, 0.10)",
  /** 极柔投影（ink 色调，非纯黑） */
  shadow: "0 1px 4px rgba(51, 55, 46, 0.05)",
  shadowLift: "0 2px 10px rgba(51, 55, 46, 0.08)",
} as const;

/**
 * 系统语义色 —— **只用于需要着色区分的少数处**（如转需求标记、看板）。
 * 六个色值经脱饱和对齐到相近明度，在白底上 4.64~5.19:1，全部达标；
 * 它们是一排**同轻重的色**，谁都不抢谁 —— 这是苔绿方向允许用色的方式。
 */
export const SYSTEM_TINTS = {
  WMS: "#5B7796",
  ERP: "#7A6C8F",
  TMS: "#9A6A36",
  SCM: "#5F7A52",
  追溯中心: "#8E5F76",
  其他: "#6E7466",
} as const;

/* ------------------------------------------------------------------ */
/* 二、中文字体栈                                                      */
/* ------------------------------------------------------------------ */

/**
 * 不用网络字体：本系统按内网部署交付（见 docs/内网部署方案.md），
 * 外网 CDN 与构建期下载都可能不可用；CJK 网络字体体积过大也不适合内网分发。
 * 中文排版质感靠**度量**而非字体文件拿到：显式字重（中文只有 400/500/600 有意义）、
 * 等宽数字对齐、放弃负字距、标点全角。
 */
export const FONT_SANS =
  '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Source Han Sans SC", "Noto Sans SC", system-ui, -apple-system, sans-serif';

/** 数字/编号/日期专用：等宽 + 表格数字，让列能对齐 */
export const FONT_MONO =
  '"Cascadia Mono", "Consolas", "SF Mono", "Menlo", "DejaVu Sans Mono", ui-monospace, monospace';

/* ------------------------------------------------------------------ */
/* 三、antd 主题                                                       */
/* ------------------------------------------------------------------ */

export const antdTheme: ThemeConfig = {
  token: {
    /* 品牌色：用可读版本，antd 会拿它当链接色与按钮底 */
    colorPrimary: MOSS.accentInk,
    colorInfo: MOSS.accentInk,
    colorSuccess: "#5F7A52",
    colorWarning: "#9A6A36",
    colorError: MOSS.danger,

    /* 底与面 */
    colorBgBase: MOSS.bg,
    colorBgLayout: MOSS.bg,
    colorBgContainer: MOSS.card,
    colorBgElevated: MOSS.card,

    /* 字 */
    colorText: MOSS.ink,
    colorTextSecondary: MOSS.ink2,
    colorTextTertiary: MOSS.ornament,
    colorTextQuaternary: MOSS.ornament,
    colorTextHeading: MOSS.ink,
    colorLink: MOSS.accentInk,
    colorLinkHover: MOSS.accent,
    fontFamily: FONT_SANS,
    fontFamilyCode: FONT_MONO,
    fontSize: 14,
    /* 中文没有真正的细体，400 已是下限；行高给足，密表里中文才不挤 */
    lineHeight: 1.6,

    /* 线 */
    colorBorder: MOSS.line2,
    colorBorderSecondary: MOSS.line,
    colorSplit: MOSS.line,

    /* 形：卡片 14、控件 10，两档到底 */
    borderRadius: 10,
    borderRadiusLG: 14,
    borderRadiusSM: 8,
    borderRadiusXS: 6,

    /* 控件比 antd 默认(32) 高 2px，密表里点击更好点 */
    controlHeight: 34,
    controlHeightSM: 28,
    controlHeightLG: 40,

    /* antd 默认给按钮挂了一层蓝色投影，必须杀掉 */
    boxShadow: MOSS.shadow,
    boxShadowSecondary: MOSS.shadowLift,
  },
  components: {
    Layout: {
      siderBg: MOSS.card,
      bodyBg: MOSS.bg,
      headerBg: MOSS.card,
    },
    Menu: {
      itemBg: "transparent",
      itemColor: MOSS.ink,
      itemHoverBg: MOSS.hover,
      itemHoverColor: MOSS.ink,
      /* 当前项：强调色 10% 浅底 + 强调色文字，不用单边色条 */
      itemSelectedBg: MOSS.accentTint,
      itemSelectedColor: MOSS.accentInk,
      itemHeight: 40,
      itemBorderRadius: 10,
      itemMarginInline: 8,
      iconSize: 16,
      collapsedIconSize: 17,
      activeBarBorderWidth: 0,
    },
    Card: {
      colorBorderSecondary: MOSS.line,
      headerBg: "transparent",
      headerFontSize: 16,
      headerHeight: 52,
      paddingLG: 20,
      borderRadiusLG: 14,
    },
    Table: {
      headerBg: MOSS.card,
      headerColor: MOSS.ink,
      headerSplitColor: "transparent",
      headerBorderRadius: 0,
      borderColor: MOSS.line,
      rowHoverBg: MOSS.hover,
      cellPaddingBlock: 10,
      cellPaddingInline: 14,
      cellFontSize: 13,
      footerBg: MOSS.card,
    },
    Button: {
      primaryShadow: "none",
      defaultShadow: "none",
      dangerShadow: "none",
      fontWeight: 500,
      paddingInline: 16,
    },
    Input: {
      paddingBlock: 6,
      activeShadow: `0 0 0 3px ${MOSS.accentTint}`,
      hoverBorderColor: MOSS.accent,
      activeBorderColor: MOSS.accentInk,
    },
    InputNumber: {
      activeShadow: `0 0 0 3px ${MOSS.accentTint}`,
      hoverBorderColor: MOSS.accent,
      activeBorderColor: MOSS.accentInk,
    },
    Select: {
      optionSelectedBg: MOSS.accentTint,
      optionSelectedColor: MOSS.ink,
      optionSelectedFontWeight: 600,
      hoverBorderColor: MOSS.accent,
      activeBorderColor: MOSS.accentInk,
      activeOutlineColor: MOSS.accentTint,
      optionHeight: 32,
    },
    DatePicker: {
      hoverBorderColor: MOSS.accent,
      activeBorderColor: MOSS.accentInk,
      activeShadow: `0 0 0 3px ${MOSS.accentTint}`,
      cellHoverBg: MOSS.hover,
    },
    Tag: {
      defaultBg: MOSS.bg,
      defaultColor: MOSS.ink2,
      borderRadiusSM: 6,
    },
    Modal: {
      borderRadiusLG: 14,
      titleFontSize: 16,
      headerBg: MOSS.card,
      contentBg: MOSS.card,
    },
    Dropdown: {
      borderRadiusLG: 10,
      controlItemBgHover: MOSS.hover,
      controlItemBgActive: MOSS.accentTint,
    },
    Pagination: {
      itemActiveBg: MOSS.accentTint,
      colorPrimary: MOSS.accentInk,
      colorPrimaryHover: MOSS.accentInk,
    },
    Popconfirm: {
      /* 危险动作在气泡里也要用砖红，不用 antd 的冷红 */
      colorError: MOSS.danger,
    },
    Message: {
      contentBg: MOSS.card,
    },
    Tooltip: {
      colorBgSpotlight: MOSS.ink,
      colorTextLightSolid: MOSS.bg,
    },
    Form: {
      labelColor: MOSS.ink2,
      labelFontSize: 13,
      verticalLabelPadding: "0 0 6px",
      itemMarginBottom: 20,
    },
    Divider: {
      colorSplit: MOSS.line,
    },
    Empty: {
      colorTextDescription: MOSS.ink2,
    },
  },
};
