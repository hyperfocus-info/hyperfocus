import { createHash,createHmac,randomBytes,timingSafeEqual } from "node:crypto";
import type { Database } from "bun:sqlite";
import { z } from "zod";

const credential=z.string().regex(/^[a-f0-9]{64}$/);
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
export function sameSecret(left:string,right:string){const a=Buffer.from(left),b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b);}
export function secureBrowserCookie(name:string,options:{token:string;expiresAt:number}){
  if(!/^__Host-[a-z-]+$/.test(name))throw Error("Invalid host cookie name.");
  return `${name}=${options.token}; Path=/; Secure; HttpOnly; SameSite=Strict; Expires=${new Date(options.expiresAt).toUTCString()}`;
}
/** One-use handoff to a revocable cookie. Hosts define and enforce the exact capability scope. */
export function createBrowserGrantStore<T extends {id:string;expiresAt:number}>(options:{db:Database;namespace:string;cookieName:string;csrfContext:string;
  parse:(input:unknown)=>T;now?:()=>number;deploymentExpiresAt?:number;bootstrapMs?:number}){
  if(!/^[a-z_]+$/.test(options.namespace))throw Error("Invalid grant namespace.");
  const {db}=options,now=options.now??Date.now,accessTable=`${options.namespace}_access`,sessionTable=`${options.namespace}_sessions`;
  const csrf=(token:string)=>createHmac("sha256",token).update(options.csrfContext).digest("hex");
  db.exec(`CREATE TABLE IF NOT EXISTS ${accessTable}(id TEXT PRIMARY KEY,data TEXT NOT NULL,code_hash TEXT NOT NULL UNIQUE,
    code_until_ms INTEGER NOT NULL,consumed_at_ms INTEGER,revoked_at_ms INTEGER);
    CREATE TABLE IF NOT EXISTS ${sessionTable}(token_hash TEXT PRIMARY KEY,access_id TEXT NOT NULL,revoked_at_ms INTEGER);`);
  function active(data:string){const access=options.parse(JSON.parse(data));
    if(access.expiresAt<=now()||options.deploymentExpiresAt!==undefined&&options.deploymentExpiresAt<=now())throw Error("Browser access expired. Request a new link from the trusted host.");return access;}
  function mint(scope:Omit<T,"id"|"expiresAt">,expiresInMs:number){
    if(!Number.isFinite(expiresInMs)||expiresInMs<=0)throw Error("Invalid browser expiry.");
    const expiresAt=Math.min(now()+expiresInMs,options.deploymentExpiresAt??Infinity);
    if(expiresAt<=now())throw Error("The approved deployment lifetime has expired.");
    const access=options.parse({...scope,id:crypto.randomUUID(),expiresAt}),code=randomBytes(32).toString("hex");
    db.query(`INSERT INTO ${accessTable} VALUES(?,?,?,?,NULL,NULL)`).run(access.id,JSON.stringify(access),hash(code),Math.min(expiresAt,now()+(options.bootstrapMs??86400000)));
    return {access,code};
  }
  function exchange(input:unknown){const code=credential.parse(input);return db.transaction(()=>{
    const row=db.query<{id:string;data:string;code_until_ms:number;consumed_at_ms:number|null;revoked_at_ms:number|null},[string]>(`SELECT * FROM ${accessTable} WHERE code_hash=?`).get(hash(code));
    if(!row||row.revoked_at_ms!==null||row.consumed_at_ms!==null||row.code_until_ms<=now())throw Error("This browser link is invalid, expired or already used.");
    const access=active(row.data),token=randomBytes(32).toString("hex");
    db.query(`UPDATE ${accessTable} SET consumed_at_ms=? WHERE id=?`).run(now(),row.id);
    db.query(`INSERT INTO ${sessionTable} VALUES(?,?,NULL)`).run(hash(token),row.id);
    return {access,token,csrfToken:csrf(token)};
  }).immediate();}
  function authenticate(cookie:string|null){
    const matches=(cookie??"").split(";").map(value=>value.trim()).filter(value=>value.startsWith(`${options.cookieName}=`));
    if(matches.length!==1)throw Error("Browser session required.");
    const token=credential.parse(matches[0]!.slice(options.cookieName.length+1));
    const row=db.query<{data:string},[string]>(`SELECT a.data FROM ${sessionTable} s JOIN ${accessTable} a ON a.id=s.access_id
      WHERE s.token_hash=? AND s.revoked_at_ms IS NULL AND a.revoked_at_ms IS NULL`).get(hash(token));
    if(!row)throw Error("Browser session is unavailable or revoked.");return {access:active(row.data),token,csrfToken:csrf(token)};
  }
  function revoke(id:string){const result=db.query(`UPDATE ${accessTable} SET revoked_at_ms=? WHERE id=?`).run(now(),z.string().uuid().parse(id));if(!result.changes)throw Error("Unknown browser access.");}
  function logout(token:string){db.query(`UPDATE ${sessionTable} SET revoked_at_ms=? WHERE token_hash=?`).run(now(),hash(credential.parse(token)));}
  function pair(access:T){
    const code=randomBytes(32).toString("hex");active(JSON.stringify(access));
    const changed=db.query(`UPDATE ${accessTable} SET code_hash=?,code_until_ms=?,consumed_at_ms=NULL WHERE id=? AND revoked_at_ms IS NULL`).run(hash(code),Math.min(access.expiresAt,now()+(options.bootstrapMs??86400000)),access.id);
    if(!changed.changes)throw Error("Browser access was revoked.");return {access,code};
  }
  return {mint,exchange,authenticate,revoke,logout,pair};
}
