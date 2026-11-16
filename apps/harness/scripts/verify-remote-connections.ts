import { browserExecutable,connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { chromium } from "playwright";
import { mkdir,writeFile } from "node:fs/promises";
import { resolve,join } from "node:path";
import { parseArgs } from "node:util";
import { connectionAccessReceiptSchema } from "@hyperfocus/ai-core/connections";

const {values}=parseArgs({options:{"access-file":{type:"string"}}});
if(!values["access-file"])throw Error("Provide a separate one-use Connections access receipt; do not consume the user's link.");
const access=connectionAccessReceiptSchema.parse(await Bun.file(resolve(values["access-file"])).json()),origin=new URL(access.url).origin;
if(new URL(origin).protocol!=="https:")throw Error("Remote verification requires HTTPS.");
const output=resolve(import.meta.dir,"../../../.local/swarm/campaign-repair/remote-connections-ui");await mkdir(output,{recursive:true});
const owned=await connectHeadlessBrowser({executable:browserExecutable(),connect:endpoint=>chromium.connectOverCDP(endpoint)});
const context=await owned.browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errors:string[]=[];let ownerCredentialSent=false;
context.on("page",page=>page.on("pageerror",error=>errors.push(error.message)));
context.on("request",request=>{if(request.headers().authorization||request.headers()["x-harness-session-token"])ownerCredentialSent=true;});
let page=await context.newPage();
try{
  await page.goto(access.url,{waitUntil:"domcontentloaded"});await page.getByRole("region",{name:"Codex connection"}).waitFor();
  await page.getByText("Live updates",{exact:true}).waitFor();
  if(new URL(page.url()).hash)throw Error("Bootstrap credential remained in URL.");
  const officialLink=page.getByRole("link",{name:"Authorize Codex",exact:true});
  const deviceAuthorizationVisible=await officialLink.isVisible();
  if(deviceAuthorizationVisible&&await officialLink.getAttribute("href")!=="https://auth.openai.com/codex/device")throw Error("Unexpected provider authorization URL.");
  const states=()=>page.getByRole("region").getByRole("status").allTextContents();
  const before=await states();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error("Phone viewport overflows.");
  // Screenshots omit the active code; the access receipt remains private.
  await page.screenshot({path:join(output,"phone.png"),fullPage:true,mask:deviceAuthorizationVisible?[page.getByRole("region",{name:"Codex connection"}).locator("strong").last()]:[]});
  await context.setOffline(true);await page.close();await context.setOffline(false);
  page=await context.newPage();await page.goto(origin+"/connections",{waitUntil:"domcontentloaded"});
  await page.getByRole("region",{name:"Codex connection"}).waitFor();await page.getByText("Live updates",{exact:true}).waitFor();
  const after=await states();if(errors.length||ownerCredentialSent)throw Error(JSON.stringify({errors,ownerCredentialSent}));
  const receipt={verifiedAt:new Date().toISOString(),origin,realCloud:true,realBrowser:true,simulatedProvider:false,
    deviceAuthorizationVisible,before,after,sessionResumedAfterNetworkLoss:true,bootstrapRemoved:true,ownerCredentialSent,pageErrors:errors,
    limitations:["Browser closure/reconnection proves observation independence; this does not prove completed account authorization or an engineering campaign."]};
  await writeFile(join(output,"results.json"),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
}finally{await context.close();await owned.close();}
