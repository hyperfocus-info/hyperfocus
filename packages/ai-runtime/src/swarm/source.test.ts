import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { createSwarmSourceSnapshot, swarmGit, isSwarmSensitivePath } from "./source";

test('source snapshots and candidate patches share sensitive-path classification', () => {
  for (const file of ['apps/game/.env', 'packages/lib/.aws/credentials', 'auth.json', 'nested/id_ed25519', '.git/config', '.env.example']) expect(isSwarmSensitivePath(file)).toBe(true);
  for (const file of ['package.json', 'apps/game/src/settings.ts', 'docs/auth.md']) expect(isSwarmSensitivePath(file)).toBe(false);
});

const owner=resolve(import.meta.dir,"../../../../.local/swarm-source-tests");
const directories:string[]=[];
afterEach(async()=>{for(const directory of directories.splice(0)){if(!resolve(directory).startsWith(owner+sep))throw Error("Fixture cleanup escaped its owner.");await rm(directory,{recursive:true,force:true});}});
async function repository() {
  await mkdir(owner,{recursive:true});const directory=await mkdtemp(join(owner,"run-"));directories.push(directory);
  const root=join(directory,"repo");await mkdir(root);
  await swarmGit({root,args:["init"]});await writeFile(join(root,"demo.txt"),"baseline\n");
  await swarmGit({root,args:["add","."]});await swarmGit({root,args:["-c","user.name=Fixture","-c","user.email=fixture@localhost","commit","-m","fixture"]});
  return {root,directory};
}

test("source retries have identical immutable bytes and preserve HEAD, index, and uncommitted work",async()=>{
  const {root,directory}=await repository();
  await writeFile(join(root,"demo.txt"),"staged work\n");await swarmGit({root,args:["add","demo.txt"]});
  await writeFile(join(root,"demo.txt"),"unstaged work\n");await writeFile(join(root,"new.txt"),"new work\n");
  const index=await readFile(join(root,".git/index"));const head=(await swarmGit({root,args:["rev-parse","HEAD"]})).output;
  const first=await createSwarmSourceSnapshot({root});await Bun.sleep(1100);const second=await createSwarmSourceSnapshot({root});
  expect(second.revision).toBe(first.revision);expect(second.sha256).toBe(first.sha256);expect(second.bytes).toEqual(first.bytes);
  expect(second.tree).toBe(first.tree);expect(second.baseRevision).toBe(head);
  expect(await readFile(join(root,".git/index"))).toEqual(index);expect(await readFile(join(root,"demo.txt"),"utf8")).toBe("unstaged work\n");
  expect((await swarmGit({root,args:["rev-parse","HEAD"]})).output).toBe(head);
  expect((await swarmGit({root,args:["for-each-ref","refs/hyperfocus/swarm"]})).output).toBe("");
  const bundle=join(directory,"snapshot.bundle");await writeFile(bundle,first.bytes);
  expect((await swarmGit({root,args:["bundle","verify",bundle]})).code).toBe(0);
},30000);

test("literal pathspecs capture bracket filenames without including ignored matching files",async()=>{
  const {root}=await repository();
  await writeFile(join(root,".gitignore"),"probe1.txt\n");await writeFile(join(root,"probe[1].txt"),"reviewed file\n");await writeFile(join(root,"probe1.txt"),"ignored private data\n");
  const snapshot=await createSwarmSourceSnapshot({root});const files=(await swarmGit({root,args:["ls-tree","-r","--name-only",snapshot.revision]})).output.split("\n");
  expect(files).toContain("probe[1].txt");expect(files).not.toContain("probe1.txt");
},15000);

test("an acknowledged immutable source skips bundle construction and rejects edits during lookup",async()=>{
  const {root}=await repository(),first=await createSwarmSourceSnapshot({root});let lookedUp="";
  const receipt={id:"a".repeat(64),sha256:first.sha256,bytes:first.bytes.length};
  const reused=await createSwarmSourceSnapshot({root,findExisting:async identity=>{lookedUp=identity.revision;return receipt;}});
  expect(lookedUp).toBe(first.revision);expect(reused.bytes).toBeUndefined();expect(reused.existingSource).toEqual(receipt);
  expect(reused.tree).toBe(first.tree);
  await expect(createSwarmSourceSnapshot({root,findExisting:async()=>{await writeFile(join(root,"demo.txt"),"Changed during acknowledgement\n");return receipt;}})).rejects.toThrow();
},30000);

test("credential configuration paths fail closed without echoing their contents",async()=>{
  const {root}=await repository();
  for(const file of [".npmrc",".yarnrc.yml",".git-credentials","auth.json","nested/auth.yaml",".docker/config.json",".aws/credentials"]){
    const target=join(root,file);await mkdir(dirname(target),{recursive:true});await writeFile(target,"fixture-private-credential-value");
    try {await createSwarmSourceSnapshot({root});throw Error("Sensitive source unexpectedly accepted");}
    catch(error){expect(String(error)).toContain("potentially sensitive path");expect(String(error)).not.toContain("fixture-private-credential-value");}
    await rm(target);
  }
},30000);

test("environment examples accept only documented placeholders and reject populated values",async()=>{
  const {root}=await repository();const file=join(root,".env.example");
  await writeFile(file,'# Values intentionally omitted\nEMPTY=\nQUOTED=""\nTOKEN=YOUR_API_TOKEN\nOTHER=REPLACE_ME\nREF=${TOKEN}\nNAME=<NAME>\n');
  const safe=await createSwarmSourceSnapshot({root});expect(safe.fileCount).toBe(2);
  for(const value of ["API_TOKEN=fixture-private-credential-value\n","ENDPOINT=https://production.internal\n","API_TOKEN=YOUR_TOKEN # fixture-private-credential-value\n","# API_TOKEN=fixture-private-credential-value\n"]){
    await writeFile(file,value);await expect(createSwarmSourceSnapshot({root})).rejects.toThrow("populated environment template");
  }
},30000);
