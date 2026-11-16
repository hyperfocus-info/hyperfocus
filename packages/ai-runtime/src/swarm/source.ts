import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, lstat, realpath } from "node:fs/promises";
import path from "node:path";
export async function swarmGit(options: {
  root: string;
  args: string[];
  input?: Uint8Array;
  env?: Record<string, string | undefined>;
  allowFailure?: boolean;
}) {
  const child = spawnBackgroundProcess({ cmd: ["git", ...options.args], cwd: options.root, env: options.env ? { ...process.env, ...options.env } : undefined, stdin: options.input ?? "ignore", stdout: "pipe", stderr: "pipe", timeout: 120000 });
  const [output, error, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code !== 0 && !options.allowFailure)
    throw new Error(`Git ${options.args[0]} failed (${code}): ${error.slice(0, 1000)}`);
  return { output: output.trimEnd(), error, code };
}
export async function readSwarmSourceContext(root: string) {
  const head = await swarmGit({ root, args: ["rev-parse", "--verify", "HEAD"], allowFailure: true });
  if (head.code !== 0)
    throw Error("Create an initial Git commit before submitting this project to Swarm.");
  const revision = head.output;
  const remote = await swarmGit({ root, args: ["remote", "get-url", "origin"], allowFailure: true });
  let url = remote.code === 0 ? remote.output : "";
  if (/^https?:/.test(url)) {
    const parsed = new URL(url);
    parsed.password = "";
    parsed.username = "";
    parsed.search = "";
    url = parsed.href;
  }
  const dirty = (await swarmGit({ root, args: ["status", "--porcelain", "-uno"] })).output.length > 0 || (await swarmGit({ root, args: ["ls-files", "--others", "--exclude-standard"] })).output.length > 0;
  return { repository: { url, revision }, dirty, sourceSnapshotRequired: dirty || !url };
}
const envTemplate = /(^|\/)\.env\.(example|sample|template)$/i;
const forbidden = /(^|\/)(node_modules|\.git|\.ssh|\.aws|\.azure|\.gcloud)(\/|$)|(^|\/)\.config\/gcloud(\/|$)|(^|\/)\.docker\/config\.json$|(^|\/)(\.env(?:\..+)?|\.npmrc|\.yarnrc(?:\.yml)?|\.git-credentials|\.gitconfig|\.?netrc|_netrc|\.pypirc|\.dockercfg|id_rsa|id_ed25519|id_ecdsa|id_dsa|auth\.(?:json|ya?ml)|credentials(?:\.json)?|application_default_credentials\.json|[^/]+\.(?:pem|p12|pfx|key))$/i;
/** Templates still require separate content validation before snapshot inclusion. */
export function isSwarmSensitivePath(file: string) { return forbidden.test(file); }
const placeholder = /^(?:|YOUR_[A-Z0-9_]+|REPLACE_ME|CHANGE_ME|CHANGEME|TODO|TBD|\$\{[A-Z_][A-Z0-9_]*\}|<[A-Z_][A-Z0-9_]*>)$/;
function assertSafeEnvTemplate(file: string, content: string) {
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim())
      continue;
    const comment = line.trimStart().startsWith("#");
    const assignment = /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*?)\s*$/.exec(comment ? line.trimStart().slice(1) : line);
    if (comment && !assignment)
      continue;
    let value = assignment?.[1] ?? "\n";
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1);
    if (!placeholder.test(value))
      throw Error(`Source snapshot refused populated environment template: ${file}. Use empty values or documented placeholders (YOUR_NAME, REPLACE_ME, <NAME>, or \${NAME}).`);
  }
}
async function listSnapshotPaths(root: string) {
  return [...new Set((await swarmGit({ root, args: ["ls-files", "--cached", "--others", "--exclude-standard", "-z"] })).output.split("\0").filter(file => file && !/(^|\/)\.local(\/|$)/i.test(file)))].sort();
}
async function stageSnapshotFiles(root: string, env: Record<string, string>, files: string[]) {
  if (!files.length)
    return;
  await swarmGit({ root, args: ["--literal-pathspecs", "add", "--pathspec-from-file=-", "--pathspec-file-nul"], env, input: new TextEncoder().encode(files.join("\0") + "\0") });
  // Inspect the captured blob, not a working file that could change between validation and staging.
  for (const file of files.filter(file => envTemplate.test(file)))
    assertSafeEnvTemplate(file, (await swarmGit({ root, args: ["cat-file", "blob", `:${file}`], env })).output);
}
type SourceIdentity = {revision:string;baseRevision:string;tree:string;fileCount:number};
type ExistingSource = {id:string;sha256:string;bytes:number};
type SourceOptions = {root:string;maxBytes?:number};
type SourceSnapshot=SourceIdentity&{sha256:string;bytes:Uint8Array<ArrayBuffer>;existingSource?:undefined};
type ReusedSourceSnapshot=SourceIdentity&{sha256:string;bytes?:undefined;existingSource:ExistingSource};
export function createSwarmSourceSnapshot(options:SourceOptions&{findExisting:(identity:SourceIdentity)=>Promise<ExistingSource|undefined>}):Promise<SourceSnapshot|ReusedSourceSnapshot>;
export function createSwarmSourceSnapshot(options:SourceOptions):Promise<SourceSnapshot>;
export async function createSwarmSourceSnapshot(options:SourceOptions&{findExisting?:(identity:SourceIdentity)=>Promise<ExistingSource|undefined>}):Promise<SourceSnapshot|ReusedSourceSnapshot> {
  const root = path.resolve((await swarmGit({ root: options.root, args: ["rev-parse", "--show-toplevel"] })).output);
  const scratch = path.join(root, ".local", "swarm");
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(path.join(scratch, "source-"));
  const env = { GIT_INDEX_FILE: path.join(directory, "index"), GIT_AUTHOR_NAME: "Hyperfocus snapshot", GIT_AUTHOR_EMAIL: "snapshot@localhost", GIT_COMMITTER_NAME: "Hyperfocus snapshot", GIT_COMMITTER_EMAIL: "snapshot@localhost", GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z" };
  const ref = `refs/hyperfocus/swarm/${crypto.randomUUID()}`;
  try {
    const baseRevision = (await swarmGit({ root, args: ["rev-parse", "HEAD"] })).output;
    const listed = await listSnapshotPaths(root);
    const files: string[] = [];
    let total = 0;
    // Independent metadata reads were serialized for thousands of source files.
    // Keep concurrency bounded and accumulate in the original deterministic order.
    for (let offset=0;offset<listed.length;offset+=32) {
      const batch=await Promise.all(listed.slice(offset,offset+32).map(async file=>{
        if(isSwarmSensitivePath(file)&&!envTemplate.test(file))throw Error(`Source snapshot refused potentially sensitive path: ${file}`);
        const absolute=path.resolve(root,file);
        if(!absolute.startsWith(root+path.sep))throw Error("Source path escapes repository.");
        const info=await lstat(absolute).catch(()=>undefined);
        if(!info)return;
        if(info.isSymbolicLink()&&!(await realpath(absolute)).startsWith(root+path.sep))throw Error(`Source symlink escapes repository: ${file}`);
        return info.isFile()||info.isSymbolicLink()?{file,size:info.size}:undefined;
      }));
      for(const item of batch){
        if(!item)continue;
        total+=item.size;
        if(total>(options.maxBytes??536870912))throw Error("Workspace source exceeds snapshot limit; configure a smaller reviewed source scope.");
        files.push(item.file);
      }
    }
    await swarmGit({ root, args: ["read-tree", "--empty"], env });
    await stageSnapshotFiles(root, env, files);
    const tree = (await swarmGit({ root, args: ["write-tree"], env })).output;
    const revision = (await swarmGit({ root, args: ["commit-tree", tree, "-m", `Immutable swarm snapshot of ${baseRevision}`], env })).output;
    const existingSource=await options.findExisting?.({revision,baseRevision,tree,fileCount:files.length});
    if(existingSource){
      if(JSON.stringify(await listSnapshotPaths(root))!==JSON.stringify(listed))throw Error("Source file membership changed while snapshotting; retry from a stable workspace.");
      await stageSnapshotFiles(root,env,files);
      if((await swarmGit({root,args:["write-tree"],env})).output!==tree||(await swarmGit({root,args:["rev-parse","HEAD"]})).output!==baseRevision)throw Error("Source changed while snapshotting; retry from a stable workspace.");
      return {revision,baseRevision,tree,fileCount:files.length,sha256:existingSource.sha256,existingSource};
    }
    await swarmGit({ root, args: ["update-ref", ref, revision] });
    const bundle = path.join(directory, "source.bundle");
    await swarmGit({ root, args: ["-c", "pack.threads=1", "-c", "pack.window=0", "-c", "pack.compression=6", "bundle", "create", "--version=2", bundle, ref] });
    if (JSON.stringify(await listSnapshotPaths(root)) !== JSON.stringify(listed))
      throw Error("Source file membership changed while snapshotting; retry from a stable workspace.");
    await stageSnapshotFiles(root, env, files);
    if ((await swarmGit({ root, args: ["write-tree"], env })).output !== tree)
      throw Error("Source changed while snapshotting; retry from a stable workspace.");
    if ((await swarmGit({ root, args: ["rev-parse", "HEAD"] })).output !== baseRevision)
      throw Error("Source revision changed while snapshotting; retry from a stable workspace.");
    const raw = await readFile(bundle);
    const headerEnd = raw.indexOf("\n\n");
    if (headerEnd < 0 || raw.subarray(0, headerEnd).toString() !== `# v2 git bundle\n${revision} ${ref}`)
      throw Error("Unexpected source bundle header.");
    // The temporary ref is only an object-retention guard; it must not change immutable source identity.
    const bytes = new Uint8Array(Buffer.concat([Buffer.from(`# v2 git bundle\n${revision} refs/hyperfocus/swarm/snapshot\n\n`), raw.subarray(headerEnd + 2)]));
    if (bytes.length > 268435456)
      throw Error("Compressed source bundle exceeds the configured 256 MiB upload limit.");
    return { revision, baseRevision, tree, sha256: createHash("sha256").update(bytes).digest("hex"), bytes, fileCount: files.length };
  }
  finally {
    await swarmGit({ root, args: ["update-ref", "-d", ref], allowFailure: true });
    // This directory was created here under the resolved repository .local owner.
    await rm(directory, { recursive: true, force: true });
  }
}
