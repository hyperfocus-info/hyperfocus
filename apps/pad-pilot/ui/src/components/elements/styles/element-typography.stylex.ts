import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  label: {
    fontFeatureSettings: '"tnum"',
    fontVariantNumeric: "tabular-nums",
  },
});

export const labelTypographyClass = stylex.attrs(styles.label).class;
