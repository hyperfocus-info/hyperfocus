import { expect,test } from "bun:test";
import { mkdir,mkdtemp,rm } from "node:fs/promises";
import { join,resolve,sep } from "node:path";
import { createCodexConnectionAdapter } from "./codex-connection";

// Explicit opt-in uses the installed official CLI with an empty, owned home.
// No user account is read, login started, model invoked, or cloud allocated.
test.skipIf(process.env.HYPERFOCUS_CODEX_ACCOUNT_TEST!=="1")("official Codex detects a fresh disconnected host and creates its private home",async()=>{
  const executable=Bun.which("codex");if(!executable)throw Error("Install the pinned official Codex CLI first.");
  const parent=resolve(import.meta.dir,"../../.local/account-tests");await mkdir(parent,{recursive:true});
  const directory=await mkdtemp(join(parent,"fresh-"));
  try{
    const adapter=createCodexConnectionAdapter({ownerId:"isolated-test",executable,codexHome:join(directory,"codex")});
    const status=await adapter.inspect(AbortSignal.timeout(20000));
    expect(status.state).toBe("disconnected");expect(status.credentialSource).toBe("missing");
    expect(await Bun.file(join(directory,"codex/auth.json")).exists()).toBe(false);
  }finally{
    if(!directory.startsWith(parent+sep))throw Error("Invalid cleanup target.");
    // Bun's maxRetries misses some Windows EBUSY paths after a child exits.
    for(let attempt=0;;attempt++){
      try{await rm(directory,{recursive:true,force:true});break;}
      catch(error){if(attempt===7||!(error instanceof Error)||!("code" in error)||!["EBUSY","EPERM","ENOTEMPTY"].includes(String(error.code)))throw error;
        await Bun.sleep(125*(attempt+1));}
    }
  }
},30000);
