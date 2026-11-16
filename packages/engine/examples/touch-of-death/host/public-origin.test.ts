import {expect,test} from 'bun:test';
import {createDemoOriginPolicy} from './public-origin.ts';
const origin='https://fighters.example',local='http://127.0.0.1:8802';
function request(path='/',headers:Record<string,string>={},method='GET'){return new Request(local+path,{method,headers:{host:'fighters.example',...headers}});}
test('public origin is exact HTTPS and loopback default remains unchanged',()=>{
 for(const publicOrigin of ['http://fighters.example','https://fighters.example/','https://user@fighters.example','https://fighters.example/path','https://fighters.example?x','https://fighters.example#x','invalid'])expect(()=>createDemoOriginPolicy({port:8802,publicOrigin})).toThrow();
 for(const port of [0,-1,1.5,65536,NaN])expect(()=>createDemoOriginPolicy({port})).toThrow();
 const policy=createDemoOriginPolicy({port:8802});expect(policy.origin).toBe(local);expect(policy.endpoint).toBe('ws://127.0.0.1:8802');expect(policy.guard(request('/arbitrary'))).toBeUndefined();const r=request();expect(policy.guestRequest(r)).toBe(r);expect(()=>policy.guestRequest(new Request(origin))).toThrow();
});
test('public HTTP allowlist excludes engine/admin/archive endpoints regardless of forwarding',()=>{
 const p=createDemoOriginPolicy({port:8802,publicOrigin:origin});expect(p.endpoint).toBe('wss://fighters.example');
 for(const path of ['/','/tod-demo.json','/tod-guest-session','/tod-guest-recovery','/tod-ai-policy','/tod-ai-candidates'])expect(p.guard(request(path))).toBeUndefined();
 for(const path of ['/stats.json','/healthz','/moderation','/moderation.js','/moderation/api','/combat-recordings.json','/combat-recording.pb','/combat-recording.json','/combat-config.json','/admin'])expect(p.guard(request(path))?.status).toBe(404);
 expect(p.guard(request('/',{host:'evil.example','x-forwarded-host':'fighters.example',forwarded:'host=fighters.example;proto=https'}))?.status).toBe(403);
 expect(p.guard(new Request(local))?.status).toBe(403);
});
test('only exact public origin may upgrade on root; local operational endpoints remain scoped',()=>{
 const p=createDemoOriginPolicy({port:8802,publicOrigin:origin});expect(p.guard(request('/',{upgrade:'websocket',origin}))).toBeUndefined();
 const rejectedHeaders: Record<string,string>[] = [{upgrade:'websocket'},{upgrade:'websocket',origin:'https://other.example'},{upgrade:'websocket',origin:'null'},{upgrade:'websocket',origin,host:'127.0.0.1:8802'}];
 for(const headers of rejectedHeaders)expect(p.guard(request('/',headers))?.status).toBe(403);
 expect(p.guard(request('/tod-demo.json',{upgrade:'websocket',origin}))?.status).toBe(403);
 for(const path of ['/healthz','/stats.json','/moderation','/moderation.js','/moderation/api'])expect(p.guard(request(path,{host:'127.0.0.1:8802'}))).toBeUndefined();
 expect(p.guard(request('/stats.json',{host:'127.0.0.1:8802'},'POST'))?.status).toBe(404);expect(p.guard(request('/tod-guest-session',{host:'127.0.0.1:8802'},'POST'))?.status).toBe(404);
});
test('TLS normalization preserves body/path/query and does not trust forwarded origin',async()=>{
 const p=createDemoOriginPolicy({port:8802,publicOrigin:origin});const original=new Request(local+'/tod-guest-session?retry=1',{method:'POST',headers:{host:'fighters.example',origin,'content-type':'application/json','x-forwarded-proto':'http','x-forwarded-host':'evil.example'},body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"lease":"abc"}'));c.close();}})});
 const normalized=p.guestRequest(original);expect(normalized.url).toBe(origin+'/tod-guest-session?retry=1');expect(normalized.method).toBe('POST');expect(normalized.headers.get('origin')).toBe(origin);expect(await normalized.text()).toBe('{"lease":"abc"}');expect(()=>p.guestRequest(request('/',{host:'evil.example'}))).toThrow();
});


test('normalized guest issuance uses configured HTTPS and emits Secure cookie',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join,dirname,resolve}=await import('node:path');const {createGuestSessionService}=await import('./guest-session/service.ts');
 const root=await mkdtemp(join(tmpdir(),'tod-public-origin-')),p=createDemoOriginPolicy({port:8802,publicOrigin:origin}),service=createGuestSessionService({databasePath:join(root,'guest.sqlite'),origin:p.origin});
 try{const original=new Request(local+'/tod-guest-session',{method:'POST',headers:{host:'fighters.example',origin,'content-type':'application/json'},body:'{}'});expect(p.guard(original)).toBeUndefined();const response=(await service.handle(p.guestRequest(original)))!;expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toContain('; Secure');expect(new URL(p.guestRequest(request('//evil.example/path')).url).origin).toBe(origin);
 const hostile=new Request(local+'/tod-guest-session',{method:'POST',headers:{host:'fighters.example',origin:'https://evil.example','content-type':'application/json'},body:'{}'});expect((await service.handle(p.guestRequest(hostile)))!.status).toBe(403);
 }finally{service.close();if(dirname(resolve(root))!==resolve(tmpdir()))throw Error('Unsafe fixture cleanup');await rm(root,{recursive:true,force:true});}
});


test('public network binding cannot expose admin routes with a forged backend Host', () => {
  const policy = createDemoOriginPolicy({ port: 8802, publicOrigin: origin, publicBinding: true });
  for (const path of ['/stats.json', '/healthz', '/moderation', '/moderation.js', '/moderation/api']) expect(policy.guard(request(path, { host: '127.0.0.1:8802' }))?.status).toBe(403);
  expect(policy.guard(request('/tod-health'))).toBeUndefined();
  expect(policy.guard(request('/tod-health', { host: 'healthcheck.railway.app' }))).toBeUndefined();
  expect(policy.guard(request('/stats.json', { host: 'healthcheck.railway.app' }))?.status).toBe(403);
});

test('an explicit preview address serves local play while session, policy and socket authority stays at the public origin', () => {
  const previewOrigin = 'https://touch-of-death-production.up.railway.app';
  const previewHeaders = { host: new URL(previewOrigin).host };
  const policy = createDemoOriginPolicy({ port: 8802, publicOrigin: origin, publicBinding: true, previewOrigin });
  for (const path of ['/', '/tod-demo.json', '/tod-health']) expect(policy.guard(request(path, previewHeaders))).toBeUndefined();
  expect(policy.guard(request('/', previewHeaders, 'HEAD'))).toBeUndefined();
  expect(policy.isPreview(request('/', previewHeaders))).toBe(true);
  expect(policy.isPreview(request())).toBe(false);
  for (const path of ['/', '/tod-guest-session', '/tod-guest-recovery', '/tod-ai-candidates']) expect(policy.guard(request(path, previewHeaders, 'POST'))?.status).toBe(403);
  for (const path of ['/tod-ai-policy', '/stats.json', '/moderation', '/combat-recordings.json']) expect(policy.guard(request(path, previewHeaders))?.status).toBe(403);
  expect(policy.guard(request('/', { ...previewHeaders, upgrade: 'websocket', origin: previewOrigin }))?.status).toBe(403);
  expect(policy.guard(request('/', { ...previewHeaders, upgrade: 'websocket', origin }))?.status).toBe(403);
  expect(() => policy.guestRequest(request('/tod-guest-session', previewHeaders, 'POST'))).toThrow();
  expect(policy.guard(request('/', { host: 'other.up.railway.app', 'x-forwarded-host': previewHeaders.host }))?.status).toBe(403);
  expect(policy.guard(request('/', { upgrade: 'websocket', origin }))).toBeUndefined();
  expect(policy.endpoint).toBe('wss://fighters.example');
});

test('preview address configuration rejects implicit, insecure, malformed or duplicate origins', () => {
  for (const previewOrigin of ['invalid', 'http://preview.example', 'https://preview.example/', 'https://preview.example/path', 'https://preview.example?x', 'https://preview.example#x', 'https://user@preview.example', origin]) {
    expect(() => createDemoOriginPolicy({ port: 8802, publicOrigin: origin, previewOrigin })).toThrow();
  }
  expect(() => createDemoOriginPolicy({ port: 8802, previewOrigin: 'https://preview.example' })).toThrow();
  expect(createDemoOriginPolicy({ port: 8802, publicOrigin: origin }).guard(request('/', { host: 'touch-of-death-production.up.railway.app' }))?.status).toBe(403);
});
