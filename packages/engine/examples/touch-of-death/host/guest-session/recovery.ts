import type { Database } from 'bun:sqlite';
import { guestRejected } from './request.ts';
const day=86400000, pendingTtl=600000;
const digest=(key:string)=>new Bun.CryptoHasher('sha256').update(key).digest('hex');
/** Recovery credentials belong to this host's identity store, never player/game state. */
export function createGuestRecovery(options:{db:Database;now:()=>number;rate:(key:string,maximum:number,time:number)=>void;onRestore?:(userId:string)=>Promise<void>}) {
 const {db}=options;
 db.run('CREATE TABLE IF NOT EXISTS tod_guest_recovery (user_id TEXT PRIMARY KEY, active_hash TEXT UNIQUE, pending_hash TEXT UNIQUE, pending_until INTEGER NOT NULL)');
 let lane:Promise<unknown>=Promise.resolve();
 function account(cookie:string|undefined,time:number){const row=cookie?db.query<{user_id:string;expires:number},[string]>('SELECT user_id,expires FROM tod_guest_accounts WHERE cookie_hash=?').get(digest(cookie)):null;if(!row||row.expires<=time)throw guestRejected('Valid guest access is required to save a recovery key.',401,'guest-identity-unavailable');return row.user_id;}
 async function run(value:Record<string,unknown>,cookie:string|undefined){
  if(Object.keys(value).some(key=>key!=='operation'&&key!=='key')||typeof value.operation!=='string'||!['prepare','confirm','restore'].includes(value.operation)||typeof value.key!=='string'||!/^[a-f0-9]{64}$/.test(value.key))throw guestRejected('Invalid recovery request.',400,'guest-recovery-invalid');
  const time=options.now(),keyHash=digest(value.key);
  db.transaction(()=>{db.run('DELETE FROM tod_guest_rates WHERE start<=?',[time-60000]);options.rate('global-recovery',30,time);}).immediate();
  if(value.operation!=='restore'){
   db.transaction(()=>{
    const userId=account(cookie,time);options.rate(`recovery:${userId}`,10,time);
    db.run('UPDATE tod_guest_recovery SET pending_hash=NULL,pending_until=0 WHERE pending_until<=?',[time]);
    db.run('DELETE FROM tod_guest_recovery WHERE active_hash IS NULL AND pending_hash IS NULL');
    const row=db.query<{active_hash:string|null;pending_hash:string|null;pending_until:number},[string]>('SELECT active_hash,pending_hash,pending_until FROM tod_guest_recovery WHERE user_id=?').get(userId);
    if(value.operation==='prepare'){
     if(row?.active_hash===keyHash)return;
     if(db.query('SELECT 1 FROM tod_guest_recovery WHERE user_id<>? AND (active_hash=? OR pending_hash=?)').get(userId,keyHash,keyHash))throw guestRejected('Recovery key is unavailable.',409,'guest-recovery-invalid');
     if(!row&&(db.query<{count:number},[]>('SELECT count(*) AS count FROM tod_guest_recovery').get()!.count>=10000))throw guestRejected('Recovery capacity reached. Ask the host for help.',503,'guest-recovery-retry');
     db.run('INSERT INTO tod_guest_recovery VALUES (?,NULL,?,?) ON CONFLICT(user_id) DO UPDATE SET pending_hash=excluded.pending_hash,pending_until=excluded.pending_until',[userId,keyHash,time+pendingTtl]);
    }else{
     if(row?.active_hash===keyHash)return;
     if(!row||row.pending_hash!==keyHash||row.pending_until<=time)throw guestRejected('Prepare and save this recovery key again before confirming.',409,'guest-recovery-pending-expired');
     db.run('UPDATE tod_guest_recovery SET active_hash=?,pending_hash=NULL,pending_until=0 WHERE user_id=?',[keyHash,userId]);
    }
   }).immediate();return {};
  }
  const userId=db.transaction(()=>{
   const row=db.query<{user_id:string},[string]>('SELECT user_id FROM tod_guest_recovery WHERE active_hash=?').get(keyHash);
   if(!row)throw guestRejected('This recovery key is invalid or has been replaced.',401,'guest-recovery-invalid');
   options.rate(`recovery:${row.user_id}`,10,time);
   // Block old cookies from minting credentials while live connections are evicted.
   db.run('UPDATE tod_guest_accounts SET expires=0 WHERE user_id=?',[row.user_id]);
   db.run('DELETE FROM tod_guest_leases WHERE user_id=?',[row.user_id]);return row.user_id;
  }).immediate();
  try{await options.onRestore?.(userId);}catch{throw guestRejected('Could not finish restoring access. Retry with the same recovery key.',503,'guest-recovery-retry');}
  const cookieValue=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
  db.transaction(()=>{
   const current=options.now();db.run('DELETE FROM tod_guest_accounts WHERE expires<=?',[current]);
   if(!db.query('SELECT 1 FROM tod_guest_accounts WHERE user_id=?').get(userId)&&db.query<{count:number},[]>('SELECT count(*) AS count FROM tod_guest_accounts').get()!.count>=10000)throw guestRejected('Guest capacity reached. Retry later.',503,'guest-recovery-retry');
   db.run('DELETE FROM tod_guest_accounts WHERE user_id=?',[userId]);db.run('INSERT INTO tod_guest_accounts VALUES (?,?,?)',[digest(cookieValue),userId,current+30*day]);
  }).immediate();return {cookie:cookieValue};
 }
 return {handle(value:Record<string,unknown>,cookie:string|undefined):Promise<{cookie?:string}>{const task=lane.then(()=>run(value,cookie));lane=task.catch(()=>undefined);return task;}};
}
