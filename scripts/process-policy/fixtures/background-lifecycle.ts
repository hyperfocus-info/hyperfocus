import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";

const role = process.argv[2] ?? "supervisor";
const failure = process.argv.includes("--fail-parent");
console.log(JSON.stringify({ role, pid: process.pid }));

if (role === "supervisor") {
  const child = spawnBackgroundProcess({
    cmd: [process.execPath, import.meta.path, "dev"],
    stdout: "inherit", stderr: "inherit"
  });
  if (failure) setTimeout(() => process.exit(23), 3_000);
  await child.exited;
} else if (role === "dev") {
  const hot = spawnBackgroundProcess({
    cmd: [process.execPath, "--hot", import.meta.path, "hot-server"],
    stdout: "inherit", stderr: "inherit"
  });
  const build = spawnBackgroundProcess({
    cmd: [process.execPath, import.meta.path, "build"],
    stdout: "inherit", stderr: "inherit"
  });
  await Promise.all([hot.exited, build.exited]);
} else {
  setInterval(() => {}, 1_000);
}
