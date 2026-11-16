import * as stylex from "@stylexjs/stylex";
import { tokens } from "./tokens.stylex";

/** Semantic type roles; compose with local color and layout, not new font sizes. */
export const typography = stylex.create({
  caption: {
    fontFamily: tokens.fontUi,
    fontSize: tokens.fontCaption,
    fontWeight: 400,
    lineHeight: 1.4,
  },
  metadata: {
    fontFamily: tokens.fontUi,
    fontSize: tokens.fontCaption,
    fontVariantNumeric: tokens.numericVariant,
    fontWeight: 400,
    lineHeight: 1.5,
  },
  body: {
    fontFamily: tokens.fontUi,
    fontSize: tokens.fontBody,
    fontWeight: 400,
    lineHeight: 1.5,
  },
  emphasis: {
    fontFamily: tokens.fontUi,
    fontSize: tokens.fontBody,
    fontWeight: 650,
    lineHeight: 1.5,
  },
  control: {
    fontFamily: tokens.fontUi,
    fontSize: tokens.fontControl,
    fontWeight: 400,
    lineHeight: 1.35,
  },
  section: {
    fontFamily: tokens.fontUi,
    fontSize: tokens.fontSection,
    fontWeight: 650,
    lineHeight: 1.35,
  },
  page: {
    fontFamily: tokens.fontUi,
    fontSize: tokens.fontPage,
    fontWeight: 650,
    letterSpacing: "-0.02em",
    lineHeight: 1.2,
  },
  display: {
    fontFamily: tokens.fontUi,
    fontSize: tokens.fontDisplay,
    fontWeight: 650,
    letterSpacing: "-0.025em",
    lineHeight: 1.1,
  },
});
