import * as stylex from "@stylexjs/stylex";
import { For,Show } from "solid-js";
import { rightAlignedNumbersEnabled } from "../../lib/visual-flags";
import { backgroundJobsStyles as styles } from "../background-jobs.styles";
import { isRightAlignedHealthHeader } from "./job-display-values";

export function HealthTable(props: {
  title: string;
  headers: string[];
  rows: string[][];
  emptyMessage: string;
}) {
  return (
    <section>
      <div class={stylex.attrs(styles.healthTableTitle).class}>{props.title}</div>
      <Show
        when={props.rows.length > 0}
        fallback={<div class={stylex.attrs(styles.healthTableEmpty).class}>{props.emptyMessage}</div>}
      >
        <div class={stylex.attrs(styles.healthTable).class} role="region" aria-label={`${props.title} table`} tabIndex={0}>
          <div role="table" aria-label={props.title}>
          <div role="row" class={[stylex.attrs(styles.healthTableHeader).class, healthTableColumnClass(props.headers.length)].join(" ")}>
            <For each={props.headers}>{(header) => <div role="columnheader" class={stylex.attrs(rightAlignedNumbersEnabled() && isRightAlignedHealthHeader(header) && styles.numeric).class}>{header}</div>}</For>
          </div>
          <div role="rowgroup" class={stylex.attrs(styles.healthTableBody).class}>
            <For each={props.rows}>
              {(row) => (
                <div role="row" class={[stylex.attrs(styles.healthTableRow).class, healthTableColumnClass(row.length)].join(" ")}>
                  <For each={row}>{(cell, index) => <div role="cell" class={stylex.attrs(styles.minWidthZero, styles.breakAll, rightAlignedNumbersEnabled() && isRightAlignedHealthHeader(props.headers[index()]) && styles.numeric).class}>{cell}</div>}</For>
                </div>
              )}
            </For>
          </div>
          </div>
        </div>
      </Show>
    </section>
  );
}

function healthTableColumnClass(columnCount: number) {
  switch (columnCount) {
    case 3:
      return stylex.attrs(styles.columnsThree).class;
    case 4:
      return stylex.attrs(styles.columnsFour).class;
    case 5:
      return stylex.attrs(styles.columnsFive).class;
    case 6:
      return stylex.attrs(styles.columnsSix).class;
    default:
      return stylex.attrs(styles.columnsThree).class;
  }
}
