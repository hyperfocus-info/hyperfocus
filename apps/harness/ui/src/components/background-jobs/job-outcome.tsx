import { Show } from 'solid-js';
import * as stylex from '@stylexjs/stylex';
import { typography } from '@hyperfocus/ui';
import type { BackgroundJobRun } from '@hyperfocus/ai-core/protocol';
import { formatShortTimestamp } from '../../lib/time-format';
import { StatusChip, type StatusChipTone } from '../primitives/status-chip';
import { jobsRosterStyles as styles } from './jobs-roster.styles';

export function JobOutcome(props: { run?: BackgroundJobRun; tone: StatusChipTone; pauseReason?: string }) {
  return <>
    <Show when={props.run} fallback={<p {...stylex.attrs(styles.copy)}>No recent run history is loaded for this job.</p>}>
      {run => <section aria-label="Latest run outcome" {...stylex.attrs(styles.outcome)}>
        <div {...stylex.attrs(styles.header)}><strong>Latest run</strong><StatusChip tone={props.tone}>{run().status}</StatusChip></div>
        <p {...stylex.attrs(styles.copy, run().failureMessage ? styles.warning : undefined)}>{run().failureMessage ?? run().summary ?? 'Execution is recorded below.'}</p>
        <span {...stylex.attrs(typography.caption, styles.copy)}>{formatShortTimestamp(run().completedAt ?? run().updatedAt)}</span>
      </section>}
    </Show>
    <Show when={props.pauseReason}>{reason => <p role="status" {...stylex.attrs(styles.warning)}>{reason()}</p>}</Show>
  </>;
}
