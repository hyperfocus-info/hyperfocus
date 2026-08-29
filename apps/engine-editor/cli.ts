#!/usr/bin/env bun
import { runEditorCli } from "./editor-cli.ts";

const exitCode = await runEditorCli(process.argv.slice(2));
if (exitCode !== 0) process.exit(exitCode);
process.exitCode = 0;
