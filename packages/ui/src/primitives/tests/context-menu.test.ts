import { afterEach, expect, test } from 'bun:test';
import { bindContextMenu,moveContextMenuFocus } from '../context-menu';
afterEach(()=>document.body.replaceChildren());

test('context requests target the owning surface and preserve native editing/link menus',()=>{
  const root=document.createElement('section');root.innerHTML='<button>Actions</button><input><a href="/file">File</a><div class="nested"><button>Nested</button></div>';document.body.append(root);
  const calls:string[]=[];const nested=root.querySelector<HTMLElement>('.nested')!;
  const outer=bindContextMenu(root,request=>calls.push('outer:'+request.source)),inner=bindContextMenu(nested,request=>calls.push('inner:'+request.source));
  nested.querySelector('button')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:23,clientY:45}));
  root.querySelector('button')!.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));
  for(const element of root.querySelectorAll('input,a')){const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});element.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);}
  expect(calls).toEqual(['inner:pointer','outer:keyboard']);inner();outer();
  root.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));expect(calls.length).toBe(2);expect(root.hasAttribute('data-hf-context-surface')).toBe(false);
});

test('menu keyboard traversal skips unavailable commands and stays in its own menu',()=>{
  const menu=document.createElement('div');menu.setAttribute('role','menu');menu.innerHTML='<button role="menuitem">First</button><button role="menuitem" disabled>Unavailable</button><button role="menuitem">Last</button>';
  document.body.append(menu);menu.querySelector('button')!.focus();
  moveContextMenuFocus(menu,new KeyboardEvent('keydown',{key:'ArrowDown',cancelable:true}));expect(document.activeElement?.textContent).toBe('Last');
  moveContextMenuFocus(menu,new KeyboardEvent('keydown',{key:'Home',cancelable:true}));expect(document.activeElement?.textContent).toBe('First');
});
