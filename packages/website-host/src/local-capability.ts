import { mkdir, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Local loopback capability; keep it outside portable project/export directories. */
export async function readLocalCapability(directory: string) {
  await mkdir(directory,{recursive:true});
  const path=join(directory,'.local-capability');
  let handle;
  try {handle=await open(path,'wx',0o600);await handle.writeFile(crypto.randomUUID()+crypto.randomUUID());}
  catch(error){if(!(error instanceof Error)||!('code' in error)||error.code!=='EEXIST')throw error;}
  finally{await handle?.close();}
  for(let attempt=0;attempt<10;attempt++) {
    const value=await readFile(path,'utf8');
    if(/^[a-f0-9-]{72}$/.test(value))return value;
    if(value.length)throw new Error('Local capability file is invalid.');
    await Bun.sleep(10);
  }
  throw new Error('Local capability initialization did not finish.');
}
