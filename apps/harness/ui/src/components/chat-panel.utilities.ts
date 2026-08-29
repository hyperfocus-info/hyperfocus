import * as stylex from "@stylexjs/stylex";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });
const waitingBreathe = stylex.keyframes({
  "0%, 100%": { backgroundColor: "var(--muted)", filter: "brightness(1)", opacity: 0.72, transform: "scale(1)" },
  "50%": { backgroundColor: "var(--success)", filter: "brightness(1.15)", opacity: 1, transform: "scale(1.375)" }
});

/** Atomic StyleX declarations used by the chat panel's dense application layout. */
export const chatUtilityStyles = stylex.create({
  absolute: {
    "position": "absolute"
  },
  agentWaitingDot: {
    "borderRadius": "999px",
    "animationDuration": "3.6s",
    "animationIterationCount": "infinite",
    "animationName": waitingBreathe,
    "animationTimingFunction": "cubic-bezier(.45, 0, .55, 1)",
    "backgroundColor": "var(--muted)",
    "opacity": 0.72,
    "transform": "scale(1)",
    "height": ".3rem",
    "width": ".3rem",
  },
  agentWaitingDot2: {
    "animationDelay": ".5s"
  },
  agentWaitingDot3: {
    "animationDelay": "1s"
  },
  agentWaitingDots: {
    "gap": ".25rem",
    "alignItems": "center",
    "display": "flex",
  },
  animateSpin: {
    "animationDuration": "1s",
    "animationIterationCount": "infinite",
    "animationName": spin,
    "animationTimingFunction": "linear",
  },
  bgVariableAccent: {
    "backgroundColor": "var(--accent)"
  },
  bgVariableBorder: {
    "backgroundColor": "var(--border)"
  },
  bgVariablePanel: {
    "backgroundColor": "var(--panel)"
  },
  bgVariablePanelStrong: {
    "backgroundColor": "var(--panel-strong)"
  },
  bgVariableWarning: {
    "backgroundColor": "var(--warning)"
  },
  bgAmber50: {
    "backgroundColor": "#fffbeb"
  },
  bgBlack10: {
    "backgroundColor": "#0000001a"
  },
  bgEmerald50: {
    "backgroundColor": "#ecfdf5"
  },
  bgRose50: {
    "backgroundColor": "#fff1f2"
  },
  bgSky5080: {
    "backgroundColor": "#f0f9ffcc"
  },
  bgWhite38: {
    "backgroundColor": "#ffffff61"
  },
  bgWhite40: {
    "backgroundColor": "#fff6"
  },
  bgWhite45: {
    "backgroundColor": "#ffffff73"
  },
  bgWhite55: {
    "backgroundColor": "#ffffff8c"
  },
  bgWhite60: {
    "backgroundColor": "#fff9"
  },
  bgWhite65: {
    "backgroundColor": "#ffffffa6"
  },
  bgWhite70: {
    "backgroundColor": "#ffffffb3"
  },
  bgWhite75: {
    "backgroundColor": "#ffffffbf"
  },
  bgWhite85: {
    "backgroundColor": "#ffffffd9"
  },
  block: {
    "display": "block"
  },
  border: {
    "borderStyle": "solid",
    "borderWidth": "1px"
  },
  borderVariableAccent: {
    "borderColor": "var(--accent)"
  },
  borderVariableAccent35: {
    "borderColor": "var(--accent)"
  },
  borderVariableBorder: {
    "borderColor": "var(--border)"
  },
  borderVariableWarning: {
    "borderColor": "var(--warning)"
  },
  borderAmber300: {
    "borderColor": "#fcd34d"
  },
  borderB: {
    "borderBottomStyle": "solid",
    "borderBottomWidth": "1px"
  },
  borderDashed: {
    "borderStyle": "dashed"
  },
  borderEmerald50030: {
    "borderColor": "#00bb7f4d"
  },
  borderRose300: {
    "borderColor": "#fda4af"
  },
  borderSky200: {
    "borderColor": "#bae6fd"
  },
  borderT0: {
    "borderTopStyle": "solid",
    "borderTopWidth": "0"
  },
  borderTeal70020: {
    "borderColor": "#00776e33"
  },
  bottom3: {
    "bottom": "0.75rem"
  },
  bottom775rem: {
    "bottom": "7.75rem"
  },
  breakAll: {
    "wordBreak": "break-all"
  },
  disabledCursorNotAllowed: {
    "cursor": {
      ":disabled": "not-allowed"
    }
  },
  disabledOpacity50: {
    "opacity": {
      ":disabled": ".5"
    }
  },
  flex: {
    "display": "flex"
  },
  flex1: {
    "flex": "1"
  },
  flexCol: {
    "flexDirection": "column"
  },
  flexWrap: {
    "flexWrap": "wrap"
  },
  fontDisplay: {
    "fontFamily": "Aptos Display, Segoe UI, sans-serif"
  },
  fontMedium: {
    "fontWeight": 500
  },
  fontMono: {
    "fontFamily": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  },
  fontNormal: {
    "fontWeight": 400
  },
  fontSemibold: {
    "fontWeight": 600
  },
  gap05: {
    "gap": "0.125rem"
  },
  gap1: {
    "gap": "0.25rem"
  },
  gap15: {
    "gap": "0.375rem"
  },
  gap2: {
    "gap": "0.5rem"
  },
  gap3: {
    "gap": "0.75rem"
  },
  gap4: {
    "gap": "1rem"
  },
  grid: {
    "display": "grid"
  },
  h1: {
    "height": "0.25rem"
  },
  h2: {
    "height": "0.5rem"
  },
  h3: {
    "height": "0.75rem"
  },
  h35: {
    "height": "0.875rem"
  },
  h4: {
    "height": "1rem"
  },
  h5: {
    "height": "1.25rem"
  },
  h7: {
    "height": "1.75rem"
  },
  h8: {
    "height": "2rem"
  },
  h9: {
    "height": "2.25rem"
  },
  hAuto: {
    "height": "auto"
  },
  hFull: {
    "height": "100%"
  },
  hPx: {
    "height": "1px"
  },
  hidden: {
    "display": "none"
  },
  hoverBgBlack5: {
    "backgroundColor": {
      ":hover": "#0000000d"
    }
  },
  hoverBorderVariableAccent: {
    "borderColor": {
      ":hover": "var(--accent)"
    }
  },
  inlineFlex: {
    "display": "inline-flex"
  },
  inset0: {
    "inset": "0rem"
  },
  insetX0: {
    "insetInline": "0rem"
  },
  insetY0: {
    "insetBlock": "0rem"
  },
  itemsCenter: {
    "alignItems": "center"
  },
  itemsStart: {
    "alignItems": "flex-start"
  },
  justifyBetween: {
    "justifyContent": "space-between"
  },
  justifyCenter: {
    "justifyContent": "center"
  },
  justifyEnd: {
    "justifyContent": "flex-end"
  },
  justifyStart: {
    "justifyContent": "flex-start"
  },
  leading5: {
    "lineHeight": "1.25rem"
  },
  leading6: {
    "lineHeight": "1.5rem"
  },
  left0: {
    "left": "0rem"
  },
  left8: {
    "left": "2rem"
  },
  lgFlex: {
    "display": {
      "default": null,
      "@media (min-width: 1024px)": "flex"
    }
  },
  lgFlexRow: {
    "flexDirection": {
      "default": null,
      "@media (min-width: 1024px)": "row"
    }
  },
  lgGridCols3: {
    "gridTemplateColumns": {
      "default": null,
      "@media (min-width: 1024px)": "repeat(3, minmax(0, 1fr))"
    }
  },
  lgGridColsMinmax12rem18remMinmax01fr: {
    "gridTemplateColumns": {
      "default": null,
      "@media (min-width: 1024px)": "minmax(12rem, 18rem) minmax(0, 1fr)"
    }
  },
  lgHidden: {
    "display": {
      "default": null,
      "@media (min-width: 1024px)": "none"
    }
  },
  lgItemsCenter: {
    "alignItems": {
      "default": null,
      "@media (min-width: 1024px)": "center"
    }
  },
  lgItemsStart: {
    "alignItems": {
      "default": null,
      "@media (min-width: 1024px)": "flex-start"
    }
  },
  lgJustifyBetween: {
    "justifyContent": {
      "default": null,
      "@media (min-width: 1024px)": "space-between"
    }
  },
  lgJustifyEnd: {
    "justifyContent": {
      "default": null,
      "@media (min-width: 1024px)": "flex-end"
    }
  },
  lineClamp3: {
    "overflow": "hidden",
    "WebkitBoxOrient": "vertical",
    "WebkitLineClamp": "3",
    "display": "-webkit-box",
  },
  maxH64: {
    "maxHeight": "16rem"
  },
  maxH72: {
    "maxHeight": "18rem"
  },
  maxW2xl: {
    "maxWidth": "var(--container-2xl)"
  },
  maxW56: {
    "maxWidth": "14rem"
  },
  maxWFull: {
    "maxWidth": "100%"
  },
  mb2: {
    "marginBottom": "0.5rem"
  },
  mb3: {
    "marginBottom": "0.75rem"
  },
  mdGridCols2: {
    "gridTemplateColumns": {
      "default": null,
      "@media (min-width: 768px)": "repeat(2, minmax(0, 1fr))"
    }
  },
  mdP8: {
    "padding": {
      "default": null,
      "@media (min-width: 768px)": "2rem"
    }
  },
  mdText165rem: {
    "fontSize": {
      "default": null,
      "@media (min-width: 768px)": "1.65rem"
    }
  },
  mdText21rem: {
    "fontSize": {
      "default": null,
      "@media (min-width: 768px)": "2.1rem"
    }
  },
  minH0: {
    "minHeight": "0rem"
  },
  minH18: {
    "minHeight": "4.5rem"
  },
  minH44: {
    "minHeight": "11rem"
  },
  minH56: {
    "minHeight": "14rem"
  },
  minH80: {
    "minHeight": "20rem"
  },
  minW0: {
    "minWidth": "0rem"
  },
  mt1: {
    "marginTop": "0.25rem"
  },
  mt2: {
    "marginTop": "0.5rem"
  },
  mt3: {
    "marginTop": "0.75rem"
  },
  normalCase: {
    "textTransform": "none"
  },
  opacity75: {
    "opacity": ".75"
  },
  overflowAuto: {
    "overflow": "auto"
  },
  overflowHidden: {
    "overflow": "hidden"
  },
  p1: {
    "padding": "0.25rem"
  },
  p2: {
    "padding": "0.5rem"
  },
  p3: {
    "padding": "0.75rem"
  },
  p4: {
    "padding": "1rem"
  },
  p5: {
    "padding": "1.25rem"
  },
  p6: {
    "padding": "1.5rem"
  },
  p8: {
    "padding": "2rem"
  },
  p08rem: {
    "padding": ".8rem"
  },
  panelShell: {
    "borderColor": "var(--border)",
    "borderRadius": ".75rem",
    "borderStyle": "solid",
    "borderWidth": "1px",
    "overflow": "auto",
    "backdropFilter": "blur(12px)",
    "backgroundColor": "var(--panel)",
    "boxShadow": "0 8px 24px #0f172a0f",
    "position": "relative",
  },
  pb2: {
    "paddingBottom": "0.5rem"
  },
  pb3: {
    "paddingBottom": "0.75rem"
  },
  pl2: {
    "paddingLeft": "0.5rem"
  },
  placeItemsCenter: {
    "placeItems": "center"
  },
  pointerEventsAuto: {
    "pointerEvents": "auto"
  },
  pointerEventsNone: {
    "pointerEvents": "none"
  },
  pr2: {
    "paddingRight": "0.5rem"
  },
  pt2: {
    "paddingTop": "0.5rem"
  },
  pt4: {
    "paddingTop": "1rem"
  },
  px1: {
    "paddingInline": "0.25rem"
  },
  px15: {
    "paddingInline": "0.375rem"
  },
  px2: {
    "paddingInline": "0.5rem"
  },
  px25: {
    "paddingInline": "0.625rem"
  },
  px3: {
    "paddingInline": "0.75rem"
  },
  py05: {
    "paddingBlock": "0.125rem"
  },
  py1: {
    "paddingBlock": "0.25rem"
  },
  py15: {
    "paddingBlock": "0.375rem"
  },
  py2: {
    "paddingBlock": "0.5rem"
  },
  relative: {
    "position": "relative"
  },
  right8: {
    "right": "2rem"
  },
  rounded: {
    "borderRadius": ".25rem"
  },
  rounded2xl: {
    "borderRadius": "var(--radius-2xl)"
  },
  rounded3xl: {
    "borderRadius": "var(--radius-3xl)"
  },
  rounded125rem: {
    "borderRadius": "1.25rem"
  },
  rounded12rem: {
    "borderRadius": "1.2rem"
  },
  rounded135rem: {
    "borderRadius": "1.35rem"
  },
  rounded175rem: {
    "borderRadius": "1.75rem"
  },
  roundedFull: {
    "borderRadius": "3.40282e38px"
  },
  roundedLg: {
    "borderRadius": "var(--radius-lg)"
  },
  roundedMd: {
    "borderRadius": "var(--radius-md)"
  },
  roundedXl: {
    "borderRadius": "var(--radius-xl)"
  },
  shadowLg: {
    "boxShadow": "0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1)"
  },
  shadowSm: {
    "boxShadow": "0 1px 3px 0 rgb(0 0 0 / .1), 0 1px 2px -1px rgb(0 0 0 / .1)"
  },
  shadowXl: {
    "boxShadow": "0 20px 25px -5px rgb(0 0 0 / .1), 0 8px 10px -6px rgb(0 0 0 / .1)"
  },
  shrink0: {
    "flexShrink": "0"
  },
  smGridCols2: {
    "gridTemplateColumns": {
      "default": null,
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))"
    }
  },
  spaceY2: {
    "gap": ".5rem",
    "display": "flex",
    "flexDirection": "column",
  },
  spaceY3: {
    "gap": ".75rem",
    "display": "flex",
    "flexDirection": "column",
  },
  textVariableAccent: {
    "color": "var(--accent)"
  },
  textVariableAccentStrong: {
    "color": "var(--accent-strong)"
  },
  textVariableForeground: {
    "color": "var(--foreground)"
  },
  textVariableMuted: {
    "color": "var(--muted)"
  },
  textVariableWarningStrong: {
    "color": "var(--warning-strong)"
  },
  text0375rem: {
    "fontSize": ".375rem"
  },
  text045rem: {
    "fontSize": ".45rem"
  },
  text0525rem: {
    "fontSize": ".525rem"
  },
  text052rem: {
    "fontSize": ".52rem"
  },
  text055rem: {
    "fontSize": ".55rem"
  },
  text05625rem: {
    "fontSize": ".5625rem"
  },
  text0575rem: {
    "fontSize": ".575rem"
  },
  text0585rem: {
    "fontSize": ".585rem"
  },
  text05rem: {
    "fontSize": ".5rem"
  },
  text0625rem: {
    "fontSize": ".625rem"
  },
  text0675rem: {
    "fontSize": ".675rem"
  },
  text06rem: {
    "fontSize": ".6rem"
  },
  text075rem: {
    "fontSize": ".75rem"
  },
  text07rem: {
    "fontSize": ".7rem"
  },
  text135rem: {
    "fontSize": "1.35rem"
  },
  text175rem: {
    "fontSize": "1.75rem"
  },
  textAmber800: {
    "color": "#92400e"
  },
  textAmber900: {
    "color": "#78350f"
  },
  textCenter: {
    "textAlign": "center"
  },
  textEmerald700: {
    "color": "#047857"
  },
  textLeft: {
    "textAlign": "left"
  },
  textRose800: {
    "color": "#9f1239"
  },
  textSky950: {
    "color": "#082f49"
  },
  textSm: {
    "fontSize": "var(--text-sm)",
    "lineHeight": "1.25rem"
  },
  textXs: {
    "fontSize": "var(--text-xs)",
    "lineHeight": "1rem"
  },
  themeSelectedSurface: {
    "background": "var(--accent)"
  },
  tracking006em: {
    "letterSpacing": "-.06em"
  },
  tracking012em: {
    "letterSpacing": ".12em"
  },
  tracking014em: {
    "letterSpacing": ".14em"
  },
  tracking016em: {
    "letterSpacing": ".16em"
  },
  tracking018em: {
    "letterSpacing": ".18em"
  },
  tracking01em: {
    "letterSpacing": ".1em"
  },
  tracking02em: {
    "letterSpacing": ".2em"
  },
  trackingNormal: {
    "letterSpacing": "var(--tracking-normal)"
  },
  transition: {
    "transitionDuration": "150ms",
    "transitionProperty": "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter, display, pointer-events",
    "transitionTimingFunction": "cubic-bezier(0.4, 0, 0.2, 1)",
  },
  transitionWidth: {
    "transitionDuration": "150ms",
    "transitionProperty": "width",
    "transitionTimingFunction": "cubic-bezier(0.4, 0, 0.2, 1)",
  },
  truncate: {
    "overflow": "hidden",
    "textOverflow": "ellipsis",
    "whiteSpace": "nowrap"
  },
  uppercase: {
    "textTransform": "uppercase"
  },
  w1: {
    "width": "0.25rem"
  },
  w3: {
    "width": "0.75rem"
  },
  w35: {
    "width": "0.875rem"
  },
  w4: {
    "width": "1rem"
  },
  w5: {
    "width": "1.25rem"
  },
  w7: {
    "width": "1.75rem"
  },
  w8: {
    "width": "2rem"
  },
  w9: {
    "width": "2.25rem"
  },
  wFit: {
    "width": "fit-content"
  },
  wFull: {
    "width": "100%"
  },
  whitespaceNormal: {
    "whiteSpace": "normal"
  },
  wrapBreakWords: {
    "overflowWrap": "anywhere"
  },
  z10: {
    "zIndex": 10
  },
  z20: {
    "zIndex": 20
  }
});
