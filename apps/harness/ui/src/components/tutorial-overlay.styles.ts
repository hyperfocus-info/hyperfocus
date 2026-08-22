import * as stylex from "@stylexjs/stylex";

const fadeIn = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const bounce = stylex.keyframes({
  "0%, 100%": { transform: "scale(1)" },
  "38%": { transform: "scale(1.045)" },
  "70%": { transform: "scale(0.985)" }
});

/** Build-time StyleX presentation and target animation for guided tutorials. */
export const tutorialOverlayStyles = stylex.create({
  shell: { animationDuration: "200ms", animationName: fadeIn, animationTimingFunction: "ease-out", inset: 0, position: "fixed", zIndex: 120 },
  canvas: { height: "100%", inset: 0, pointerEvents: "none", position: "absolute", width: "100%" },
  backdrop: { backgroundColor: "rgb(0 0 0 / 0.22)", height: "100%", inset: 0, position: "absolute", width: "100%" },
  panel: { backdropFilter: "blur(18px)", backgroundColor: "rgb(16 20 24 / 0.86)", borderColor: "rgb(255 255 255 / 0.16)", borderRadius: "1.5rem", borderStyle: "solid", borderWidth: "1px", bottom: "1.25rem", boxShadow: "0 24px 90px rgb(0 0 0 / 0.32)", color: "white", padding: "1rem", position: "absolute", right: "1.25rem", width: "min(24rem, calc(100vw - 2rem))" },
  eyebrow: { color: "rgb(255 255 255 / 0.7)", fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase" },
  title: { color: "white", fontSize: "1.125rem", fontWeight: 600, marginTop: "0.5rem" },
  body: { color: "rgb(255 255 255 / 0.82)", fontSize: "0.875rem", lineHeight: "1.5rem", marginTop: "0.5rem" },
  fallback: { backgroundColor: "rgb(255 255 255 / 0.1)", borderColor: "rgb(255 255 255 / 0.15)", borderRadius: "1rem", borderStyle: "solid", borderWidth: "1px", color: "rgb(255 255 255 / 0.78)", fontSize: "0.75rem", lineHeight: "1.5rem", marginTop: "0.75rem", padding: "0.75rem" },
  actions: { display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" },
  tooltipTrigger: { display: "inline-flex" },
  button: { backgroundColor: "rgb(255 244 196 / 0.94)", borderColor: "rgb(255 255 255 / 0.16)", borderRadius: "9999px", borderStyle: "solid", borderWidth: "1px", color: "rgb(47 37 21)", cursor: { default: "pointer", ":disabled": "not-allowed" }, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", opacity: { default: 1, ":disabled": 0.45 }, paddingBlock: "0.55rem", paddingInline: "0.9rem", textTransform: "uppercase", transform: { default: null, ":hover:not(:disabled)": "translateY(-1px)" }, transition: "transform 160ms, background-color 160ms, opacity 160ms" },
  buttonSecondary: { backgroundColor: "rgb(255 255 255 / 0.1)", color: "rgb(255 255 255 / 0.9)" },
  targetBounce: { animationDuration: "720ms", animationName: bounce, animationTimingFunction: "cubic-bezier(.2, .85, .2, 1)" }
});
