import { connectHeadlessBrowser } from '@hyperfocus/desktop-runtime/automation';
import { spawnBackgroundProcessSync } from '@hyperfocus/desktop-runtime/process';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { installHarnessDebtFixture } from './fixture';
const phase = process.env.DESIGN_CAPTURE_PHASE ?? 'after';
const output = `.local/design-system/evidence/next-jobs/${phase}`;
await mkdir(output, { recursive: true });
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const results: unknown[] = [], errors: string[] = [];
let completed = false;
try {
  const inspection = spawnBackgroundProcessSync({cmd:[process.execPath,resolve('scripts/process-policy/windows-inspection.ts'),String(owned.pid)]});
  if (inspection.exitCode || JSON.parse(inspection.stdout.toString()).visibleWindows.length) throw new Error('Visible automation windows');
  const page = await owned.browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const fixture = await installHarnessDebtFixture(page);
  await page.goto(process.env.HARNESS_URL ?? 'http://127.0.0.1:8787'); await fixture.ready;
  const navigation = async () => { const tab=page.locator('[data-panel-group-mode="navigation"]');if(await tab.isVisible())await tab.click(); };
  const capture = async (name:string, selector:string) => {
    await page.bringToFront();
    const geometry=await page.locator(selector).evaluate(element=>({width:element.clientWidth,scrollWidth:element.scrollWidth,right:element.getBoundingClientRect().right,viewport:innerWidth}));
    await page.screenshot({path:`${output}/${name}.png`}); results.push({name,geometry});
    if(phase==='after'&&(geometry.scrollWidth>geometry.width+1||geometry.right>geometry.viewport+1))throw new Error(`${name} overflow ${JSON.stringify(geometry)}`);
  };
  for(const [name,width,height,scale] of [['desktop',1440,1000,''],['tablet',820,1000,''],['mobile',320,740,''],['scaled',390,1000,'200%']] as const){
    await page.setViewportSize({width,height});await page.evaluate(value=>{document.documentElement.style.fontSize=value;},scale);
    await navigation();await page.getByRole('tablist',{name:'Workspace panels',exact:true}).getByRole('tab',{name:'Jobs',exact:true}).click();await navigation();
    if(name==='desktop')await page.locator('[data-test-background-jobs-panel]').getByRole('button',{name:/^Select /}).first().click();
    else { const work=page.locator('[data-panel-group-mode="workspace"]');if(await work.isVisible())await work.click();else await page.getByRole('tablist',{name:'Workspace panes'}).getByRole('tab',{name:'Work',exact:true}).click(); }
    const detail=page.locator('[data-test-job-detail-id]');await capture(`${name}-detail`,'[data-test-job-detail-id]');
    if(phase==='after')await detail.getByRole('region',{name:'Latest run outcome'}).getByText('Build verification failed. Review the latest execution evidence before retrying.',{exact:true}).waitFor();
    await detail.getByRole('button',{name:'Edit task',exact:true}).click();await capture(`${name}-edit`,'[role="dialog"]');
    if(phase==='after'){
      const body=page.locator('[data-test-dialog-content]');const bounds=await body.boundingBox();if(!bounds||bounds.height<200)throw new Error(`${name}: dialog reading region collapsed`);
      const disclosure=page.getByText('AI execution settings',{exact:true});await disclosure.focus();await disclosure.press('Space');
      if(!await disclosure.evaluate(element=>element.parentElement?.hasAttribute('open')))throw new Error('AI execution disclosure inaccessible');
      await capture(`${name}-edit-settings`,'[role="dialog"]');
    }
    await page.keyboard.press('Escape');
    if(phase==='after'&&!await detail.getByRole('button',{name:'Edit task',exact:true}).evaluate(element=>document.activeElement===element))throw new Error('Edit failed to restore focus');
    const evidence=detail.locator('[data-test-execution-log]').getByRole('button',{name:/^Show details for /}).first();await evidence.click();await capture(`${name}-evidence`,'[role="dialog"]');
    if(phase==='after')await page.getByRole('button',{name:'Copy execution log details',exact:true}).waitFor();
    await page.keyboard.press('Escape');
  }
  if(errors.length)throw new Error(errors.join('; '));completed=true;
}catch(error){errors.push(String(error));throw error;}
finally{await Bun.write(`${output}/report.json`,JSON.stringify({completed,results,errors},null,2));try{await owned.browser.close();}finally{await owned.close();}}
