import { launchHeadlessBrowser } from "../index";

const browser = await launchHeadlessBrowser({ executable: process.argv[2] ?? "" });
console.log(JSON.stringify({ pid: browser.pid, profileDir: browser.profileDir }));
// The regression deliberately kills this owner without allowing finally to run.
setInterval(() => {}, 1_000);
