import { inspectWindowsProcessTrees } from "@hyperfocus/desktop-runtime/automation/windows-inspection";
import { verifyIconTargets } from "./icon-targets";
import { chromium } from 'playwright-core';
import { browserExecutable, connectHeadlessBrowser } from '@hyperfocus/desktop-runtime/automation';
import { inspectAttention } from '@hyperfocus/ui/attention';

/** Real layout regressions; these prove the inspector, not any application's quality. */
export async function verifyAttentionRules() {
  const owned=await connectHeadlessBrowser({executable:browserExecutable(),connect:endpoint=>chromium.connectOverCDP(endpoint)});
  const form=(alignment:string)=>`<div data-ui-form-actions style="display:flex;align-items:${alignment};gap:12px"><label data-ui-field style="display:grid;gap:4px">Report<input aria-label="Report" style="height:36px"></label><button style="height:36px">Save</button></div>`;
  const cases=[
    {name:'ellipsis wrapper still detects clipped controls',html:'<div role="dialog" aria-modal="true" aria-label="Viewer" style="width:300px;height:300px;overflow:hidden"><div style="width:300px;height:300px;overflow:hidden;text-overflow:ellipsis"><div style="width:1000px;text-align:right"><button>Close</button></div></div></div>',rules:['modal-clipping']},
    {name:'ellipsis flex toolbar still detects clipped controls',html:'<div role="dialog" aria-modal="true" aria-label="Viewer" style="width:300px;height:300px;overflow:hidden"><div style="display:flex;width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span style="flex:none;width:500px">Title</span><button style="flex:none">Close</button></div></div>',rules:['modal-clipping']},
    {name:'text leaf ellipsis is intentional',html:'<div role="dialog" aria-modal="true" aria-label="Viewer" style="width:300px;height:300px;overflow:hidden"><p style="width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">A very long title that can be shortened</p><button>Close</button></div>',rules:[]},
    {name:'nested clipped modal content',html:'<div role="dialog" aria-modal="true" aria-label="Viewer" style="width:300px;height:300px;overflow:hidden"><div style="width:300px;height:300px;overflow:hidden"><div style="width:1000px;text-align:right"><button>Close</button></div></div></div>',rules:['modal-clipping']},
    {name:'mixed spanning and stacked scroll columns',html:'<div role="dialog" aria-modal="true" aria-label="Export" style="height:600px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:300px 300px"><div style="grid-row:span 2;overflow:auto"><div style="height:1000px">Left</div></div><div style="overflow:auto"><div style="height:700px">Right top</div></div><div style="overflow:auto"><div style="height:700px">Right bottom</div></div></div>',rules:['modal-content'],contentHeight:1400},
    {name:'mixed scroll columns with equivalent wrapper',html:'<div role="dialog" aria-modal="true" aria-label="Export" style="height:600px;display:flex"><div style="height:600px;overflow:auto"><div style="height:1000px">Left</div></div><div style="height:600px;overflow:auto"><div style="height:300px;overflow:auto"><div style="height:700px">Right top</div></div><div style="height:300px;overflow:auto"><div style="height:700px">Right bottom</div></div></div></div>',rules:['modal-content'],contentHeight:1400},
    {name:'screen reader announcement wrapper',html:'<header data-ui-navbar><button>Book</button><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)"><span role="status">Preview active</span></span></header>',rules:[]},
    {name:'screen reader clip-path wrapper',html:'<header data-ui-navbar><button>Book</button><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)"><span role="status">Preview active</span></span></header>',rules:[]},
    {name:'clipped modal content',html:'<div role="dialog" aria-modal="true" aria-label="Viewer" style="width:300px;height:300px;overflow:hidden"><div style="width:1000px"><button>Close</button></div></div>',rules:['modal-clipping']},
    {name:'inline menu counted once',html:'<header data-ui-navbar><button aria-controls="user-menu">Account</button><div id="user-menu" role="menu"><button role="menuitem">Settings</button></div></header>',rules:[]},
    {name:'stacked scroll regions',html:'<div role="dialog" aria-modal="true" aria-label="Export" style="height:600px"><div style="height:300px;overflow:auto"><div style="height:700px">First</div></div><div style="height:300px;overflow:auto"><div style="height:700px">Second</div></div></div>',rules:['modal-content']},
    {name:'parallel scroll columns',html:'<div role="dialog" aria-modal="true" aria-label="Export" style="height:300px;display:flex"><div style="height:300px;overflow:auto"><div style="height:700px">First</div></div><div style="height:300px;overflow:auto"><div style="height:700px">Second</div></div></div>',rules:[]},
    {name:'nested independent scroll extent',html:'<div role="dialog" aria-modal="true" aria-label="Export" style="height:300px;overflow:auto"><div style="height:600px;overflow:auto"><div style="height:1400px">Content</div></div></div>',rules:['modal-content']},
    {name:'nested wrapper does not duplicate extent',html:'<div role="dialog" aria-modal="true" aria-label="Export" style="height:600px;overflow:auto"><div style="height:300px;overflow:auto"><div style="height:800px">Content</div></div></div>',rules:[]},
    {name:'visible aria-hidden file labels',html:'<div data-ui-file-input style="display:flex;align-items:start;gap:8px"><span data-ui-file-button aria-hidden="true" style="height:36px">Choose file</span><span data-ui-file-name aria-hidden="true">No file chosen</span></div>',rules:['file-alignment']},
    {name:'custom selected value',html:'<button data-select-value="month" style="font-weight:400"><span data-ui-select-value style="font-weight:700">This month</span></button>',rules:['input-weight']},
    {name:'aligned controls',html:form('end'),rules:[]},
    {name:'labeled row regression',html:form('center'),rules:['form-alignment']},
    {name:'normal input',html:'<label style="font-weight:600">Name<input aria-label="Name" style="font-weight:400"></label>',rules:[]},
    {name:'squeezed navigation text',html:'<button style="height:36px"><span style="display:block;width:8px;overflow-wrap:anywhere">Projects</span></button>',rules:['control-text-bounds']},
    {name:'inherited bold value',html:'<input aria-label="Name" style="font-weight:600">',rules:['input-weight']},
    {name:'navbar duplicates',html:'<header data-ui-navbar><button>Preferences</button><button aria-controls="user-menu" aria-expanded="true">Account</button></header><div id="user-menu" role="menu"><button role="menuitem">Settings</button></div>',rules:['navigation-duplicate']},
    {name:'navbar subtext',html:'<header data-ui-navbar><button>Book</button><small>Saved on this device</small></header>',rules:['navigation-copy']},
    {name:'screen reader announcement',html:'<header data-ui-navbar><button>Book</button><span role="status" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">Preview active</span></header>',rules:[]},
    {name:'bounded dialog',html:'<div role="dialog" aria-modal="true" aria-label="Export" style="height:240px"><button>Download</button></div>',rules:[]},
    {name:'tall dialog',html:'<div role="dialog" aria-modal="true" aria-label="Export" style="height:95vh"><button>Download</button></div>',rules:['modal-height']},
    {name:'hidden excess scroll',html:'<div role="dialog" aria-modal="true" aria-label="Export"><div style="height:200px;overflow:auto"><div style="height:2000px"><button>Download</button></div></div></div>',rules:['modal-content']},
    {name:'settings modal',html:'<div role="dialog" aria-modal="true" aria-label="Preferences"><button>Done</button></div>',rules:['settings-view']},
    {name:'closed details',html:'<details><summary>Optional</summary><input aria-label="Hidden" style="font-weight:700"></details>',rules:[]},
    {name:'file centering',html:'<div data-ui-file-input style="display:flex;align-items:center;gap:8px"><button data-ui-file-button style="height:36px">Choose files</button><span data-ui-file-name>No file chosen</span></div>',rules:[]},
    {name:'file alignment regression',html:'<div data-ui-file-input style="display:flex;align-items:start;gap:8px"><button data-ui-file-button style="height:36px">Choose files</button><span data-ui-file-name>No file chosen</span></div>',rules:['file-alignment']},
  ];
  const results=[];
  try {
    const page=await owned.browser.newPage({viewport:{width:1000,height:800}});
    for(const item of cases) {
      await page.setContent(`<style>body{margin:8px;font:16px/1.4 sans-serif}button{cursor:pointer}input{box-sizing:border-box;font-weight:400}label,button{margin:0}</style>${item.html}`);
      const result=await page.evaluate(inspectAttention,{requireBranding:false});
      const actual=[...new Set(result.violations.map(violation=>violation.rule))].sort();
      if(JSON.stringify(actual)!==JSON.stringify([...item.rules].sort()))throw new Error(`${item.name}: expected ${item.rules}; got ${JSON.stringify(result.violations)}`);
      if(item.contentHeight!==undefined && result.modalMeasurements[0]?.contentHeight!==item.contentHeight)throw new Error(`${item.name}: expected ${item.contentHeight}px content; got ${result.modalMeasurements[0]?.contentHeight}`);
      results.push(item.name);
    }
    const icons=await verifyIconTargets({browser:owned.browser});
    results.push(...icons.map((_item,index)=>"compiled icon controls "+index));
    if(process.platform==="win32") {
      const windows=inspectWindowsProcessTrees({rootPids:[owned.pid]});
      await Bun.write(".local/ui-attention/icon-buttons/windows.json",JSON.stringify({visibleWindows:windows.visibleWindows,ownedProcessCount:windows.processes.length},null,2));
      if(windows.visibleWindows.length)throw new Error("Rendered regression opened a visible browser window.");
    }
  } finally {try{await owned.browser.close();}finally{await owned.close();}}
  return {passed:true,cases:results};
}
if(import.meta.main)console.log(JSON.stringify(await verifyAttentionRules()));
