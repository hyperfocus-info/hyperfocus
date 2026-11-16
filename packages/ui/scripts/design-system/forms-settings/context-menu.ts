import assert from 'node:assert/strict';
import type { Page } from 'playwright';

export async function verifyContextMenu({page,url,output,width,scale}:{page:Page;url:string;output:string;width:number;scale:number}) {
  await page.goto(`${url}?context-menu`);
  await page.evaluate(value=>{document.documentElement.style.fontSize=`${value}%`;},scale);
  const second=page.locator('[data-context-record="second"]');
  await second.getByRole('button',{name:'second resource',exact:true}).click({button:'right'});
  const menu=page.getByRole('menu',{name:'second actions',exact:true});
  await menu.getByRole('menuitem',{name:'Copy full path'}).click();
  assert.equal(await page.getByRole('status',{name:'Chosen command'}).innerText(),'second:copy');
  const trigger=second.getByRole('button',{name:'second actions',exact:true});
  await trigger.focus();await page.keyboard.press('Shift+F10');
  await menu.waitFor();await page.keyboard.press('ArrowDown');
  assert.ok(await menu.getByRole('menuitem',{name:'Open containing folder'}).evaluate(el=>el===document.activeElement));
  await page.keyboard.press('Escape');assert.ok(await trigger.evaluate(el=>el===document.activeElement));
  await second.dispatchEvent('contextmenu',{clientX:width-2,clientY:898});await menu.waitFor();
  const bounds=(await menu.boundingBox())!;
  assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=900);
  await page.screenshot({path:`${output}/context-menu-${width}-${scale}.png`});
  await page.keyboard.press('Escape');
  const prevented=await second.locator('input').evaluate(el=>!el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
  assert.equal(prevented,false);assert.equal(await menu.count(),0);
  await page.getByRole('button',{name:'File dialog',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'File dialog',exact:true});
  await dialog.getByRole('button',{name:'second resource',exact:true}).click({button:'right'});
  await menu.waitFor();
  await page.keyboard.press('Escape');assert.ok(await dialog.isVisible());
  await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);
  return {targetIdentity:true,keyboard:true,nativeText:true,nestedEscape:true,bounds};
}
