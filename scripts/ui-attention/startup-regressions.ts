import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { verifyAttention } from './verify';

// Disposable HTTP fixtures, never an application server or user-state endpoint.
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
  const path=new URL(request.url).pathname;
  return new Response(path==='/ready'?'<main id="ready"><button style="cursor:pointer">Open</button></main>':'Service unavailable',{
    status:path==='/failed'?503:200,headers:{'content-type':'text/html'},
  });
}});
try {
  for(const state of ['failed','empty','ready']) {
    const report=await verifyAttention({url:`http://127.0.0.1:${server.port}/${state}`,ready:'#ready',output:resolve('.local/design-system/navigation-2026-10-26/startup-regressions',state)});
    assert.equal(report.passed,state==='ready',`${state}: ${JSON.stringify(report.errors)}`);
    assert.equal(report.cases.length,state==='ready'?4:0);
    if(state==='failed')assert.match(report.errors.join(' '),/HTTP 503/);
    if(state==='empty')assert.match(report.errors.join(' '),/startup/);
  }
  console.log('Verified failed HTTP, missing readiness and successful application startup.');
} finally {server.stop(true);}
