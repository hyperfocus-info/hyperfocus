import { inspectWindowsProcessTrees } from '../windows-inspection.ts';

const report = inspectWindowsProcessTrees({ rootPids: [process.pid] });
const self = report.processes.find(entry => entry.pid === process.pid);
console.log(JSON.stringify({ retained: self?.commandLine.includes('“impact”') === true, visibleWindows: report.visibleWindows.length }));
