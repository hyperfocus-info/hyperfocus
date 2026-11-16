import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright-core';
import { browserExecutable, connectHeadlessBrowser } from '@hyperfocus/desktop-runtime/automation';
import { inspectWindowsProcessTrees } from '@hyperfocus/desktop-runtime/automation/windows-inspection';
import { inspectAttention } from '@hyperfocus/ui/attention';

/** Read-only presentation review: no menu command, save, upload or account action. */
export async function verifyAttention(options:{url:string;output:string;ready:string;settings?:boolean;requireBranding?:boolean}) {
  const url=new URL(options.url);
  if(!['http:','https:'].includes(url.protocol))throw new Error('Provide an HTTP(S) app URL.');
  if(!options.ready?.trim())throw new Error('Provide the application ready-state locator; a successful HTTP response alone does not prove startup.');
  const output=resolve(options.output);await mkdir(output,{recursive:true});
  const owned=await connectHeadlessBrowser({executable:browserExecutable(),connect:endpoint=>chromium.connectOverCDP(endpoint)});
  const cases:Array<{state:string;inspection:ReturnType<typeof inspectAttention>;screenshot?:string}>=[],errors:string[]=[];
  async function record(page:Page,state:string) {
    const inspection=await page.evaluate(inspectAttention,{requireBranding:options.requireBranding??false});
    const screenshot=join(output,`${state}.png`);
    await page.screenshot({path:screenshot});cases.push({state,inspection,screenshot});
  }
  try {
    const context=await owned.browser.newContext();
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    for(const {width,height,scale} of [{width:1440,height:1000,scale:1},{width:820,height:900,scale:1},{width:390,height:844,scale:1},{width:390,height:844,scale:2}]) {
      const prefix=`${width}-${scale}x`;
      await page.setViewportSize({width,height});
      try {
        const response=await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:30_000});
        if(!response?.ok())throw new Error(`HTTP ${response?.status() ?? 'no response'}`);
        await page.locator(options.ready).first().waitFor({state:'visible',timeout:10_000});
      } catch(error) {
        errors.push(`${prefix} startup: ${error instanceof Error?error.message:String(error)}`);
        await page.screenshot({path:join(output,`${prefix}-startup-failed.png`)}).catch(()=>{});
        break;
      }
      await page.evaluate(scale=>{document.documentElement.style.setProperty('font-size',`${scale*100}%`,'important');},scale);
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      await record(page,`${prefix}-page`);
      const triggers=page.locator('[data-ui-navbar] [aria-haspopup="menu"]:visible,header:has([data-ui-home]) [aria-haspopup="menu"]:visible');
      for(let index=0;index<await triggers.count();index++) {
        const trigger=triggers.nth(index);
        try {
          await trigger.click();await page.locator('[role="menu"]:visible').last().waitFor({timeout:3_000});
          await record(page,`${prefix}-menu-${index}`);
          await trigger.click();
          if(await trigger.getAttribute('aria-expanded')==='true')throw new Error('Clicking the open trigger did not toggle it closed.');
          await trigger.click();await page.locator('[role="menu"]:visible').last().waitFor({timeout:3_000});
          await page.keyboard.press('Escape');
          if(await trigger.getAttribute('aria-expanded')==='true')throw new Error('Escape did not close the menu.');
        } catch(error) {errors.push(`${prefix} menu ${index}: ${error instanceof Error?error.message:String(error)}`);await page.keyboard.press('Escape');}
      }
      if(options.settings) {
        await page.keyboard.press('Control+,');
        const settings=page.locator('[data-ui-settings-workspace]:visible');
        try {
          await settings.waitFor({timeout:3_000});await record(page,`${prefix}-settings`);
          const close=settings.locator('[data-ui-settings-close]');if(await close.count())await close.click();
        }
        catch {errors.push(`${prefix}: Ctrl+, did not open the settings workspace.`);}
      }
    }
    const visibleWindows=process.platform==='win32'?inspectWindowsProcessTrees({rootPids:[owned.pid]}).visibleWindows:[];
    if(visibleWindows.length)errors.push('Verification opened a visible browser window.');
  } catch(error) {errors.push(error instanceof Error?error.message:String(error));}
  finally {try {await owned.browser.close();}finally {await owned.close();}}
  const report={url:url.href,ready:options.ready,passed:cases.length>0&&errors.length===0&&cases.every(item=>item.inspection.passed),cases,errors};
  await Bun.write(join(output,'report.json'),JSON.stringify(report,null,2));return report;
}

if(import.meta.main) {
  const {values}=parseArgs({options:{url:{type:'string'},ready:{type:'string'},out:{type:'string'},settings:{type:'boolean'},branding:{type:'boolean'},help:{type:'boolean'}}});
  if(values.help)console.log('verify:ui --url <managed-app-url> --ready <app-ready-locator> [--settings] [--branding] [--out .local/ui-review]. Read-only menus, toggle/Escape and desktop/narrow/enlarged-text geometry.');
  else {
    if(!values.url)throw new Error('Provide --url from the managed server.');
    if(!values.ready)throw new Error('Provide --ready with a visible application landmark after startup.');
    const report=await verifyAttention({url:values.url,ready:values.ready,output:values.out??'.local/ui-review',settings:values.settings,requireBranding:values.branding});
    console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,errors:report.errors,violations:report.cases.flatMap(item=>item.inspection.violations.map(violation=>({state:item.state,...violation})))}));
    if(!report.passed)process.exitCode=1;
  }
}
