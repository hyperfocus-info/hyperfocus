#!/usr/bin/env bun
import { runEditorCli } from "./editor-cli.ts";

await runEditorCli(process.argv.slice(2));
