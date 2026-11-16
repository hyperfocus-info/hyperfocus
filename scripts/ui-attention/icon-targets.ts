import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser } from "playwright-core";
import { inspectRequiredControls } from "@hyperfocus/ui/attention/required-controls";
import { stylexSolidPlugin } from "@hyperfocus/ui/build/stylex-solid-plugin";

/** Real shared controls and a legacy negative control, using the caller-owned browser. */
export async function verifyIconTargets({browser}:{browser:Browser}){
 const directory=resolve(".local/ui-attention/icon-buttons");await mkdir(directory,{recursive:true});
 const build=await Bun.build({entrypoints:[resolve("packages/ui/scripts/design-system/icon-buttons/fixture.tsx")],outdir:directory,target:"browser",format:"iife",naming:"main.[ext]",plugins:[stylexSolidPlugin({generate:"dom",hydratable:false})]});
 assert.ok(build.success,build.logs.map(String).join("\n"));
 await Bun.write(directory+"/index.html",'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="main.css"><div id="root"></div><script src="main.js"></script></html>');
 const reports:object[]=[];
 for(const [name,width,scale,touch]of [["desktop",1440,1,false],["tablet",820,1,false],["phone",390,1,true],["large-text",390,2,true]] as const){
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:touch});
  try{
   const page=await context.newPage();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
   await page.goto(pathToFileURL(directory+"/index.html").href);await page.locator("#toolbar button").first().waitFor();
   await page.evaluate(s=>document.documentElement.style.fontSize=s*100+"%",scale);
   const size=await page.locator("#size-reference").evaluate(e=>e.getBoundingClientRect().width);
   const targets=[];
   for(let i=0;i<8;i++){
    const target=page.getByRole("button",{name:"Toolbar action "+i,exact:true});await target.scrollIntoViewIfNeeded();
    const box=await target.boundingBox();assert.ok(box);
    const hit=await page.evaluate(inspectRequiredControls,['#toolbar button[aria-label="Toolbar action '+i+'"]']);
    const bounds={width:box.width,height:box.height,ownsHit:hit.passed};
    assert.ok(bounds.width>=size-1&&bounds.height>=size-1,name+": icon target collapsed "+JSON.stringify(bounds));assert.ok(bounds.ownsHit,name+": icon center is covered");
    await target.click();assert.equal(await page.locator("#result").innerText(),"toolbar-"+i);targets.push(bounds);
   }
   const legacy=await page.locator("#legacy button").evaluateAll(buttons=>buttons.map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
   assert.ok(legacy.some(b=>b.width<size-1),"The deliberately shrinking legacy wrapper must fail the target-size check");
   const legacyHit=await page.evaluate(inspectRequiredControls,["#legacy button"]);assert.equal(legacyHit.passed,false,"Existing hit inspector rejects the collapsed legacy controls");
   const text=await page.getByRole("button",{name:"Long text action",exact:true}).boundingBox();assert.ok(text&&text.width<=155,"Text buttons must retain responsive wrapping");
   const first=page.getByRole("button",{name:"Toolbar action 0",exact:true});await first.focus();const tooltip=page.getByRole("tooltip").filter({hasText:"Help for action 0"});await tooltip.waitFor();assert.ok((await first.getAttribute("aria-describedby"))?.split(" ").includes("caller-help"));await page.keyboard.press("Escape");await tooltip.waitFor({state:"hidden"});assert.equal(await first.getAttribute("aria-describedby"),"caller-help");
   const close=page.getByRole("button",{name:"Close preferences",exact:true});await close.scrollIntoViewIfNeeded();const closeBox=await close.boundingBox();assert.ok(closeBox&&closeBox.width>=size-1);await close.click();assert.equal(await page.locator("#result").innerText(),"settings-closed");
   assert.deepEqual(errors,[]);reports.push({name,width,scale,touch,size,targets,legacy});
  }finally{await context.close();}
 }
 await Bun.write(directory+"/report.json",JSON.stringify({passed:true,cases:reports,scope:"Compiled shared Button/Tooltip and SettingsWorkspace; host journeys remain separate"},null,2));
 return reports;
}
