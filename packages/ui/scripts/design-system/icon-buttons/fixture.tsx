import { For, createSignal } from "solid-js";
import { render } from "solid-js/web";
import * as stylex from "@stylexjs/stylex";
import { Button } from "../../../src/primitives/button";
import { Tooltip } from "../../../src/primitives/tooltip";
import { SettingsWorkspace } from "../../../src/preferences/settings-workspace";
import { tokens } from "../../../src/theme/tokens.stylex";
import "../../../src/stylex-entry.css";

const styles=stylex.create({reference:{position:"absolute", visibility:"hidden", height:{default:tokens.controlStandard,"@media (pointer: coarse)":tokens.controlTouch}, left:"-10000px", width:{default:tokens.controlStandard,"@media (pointer: coarse)":tokens.controlTouch},}});
function Glyph(){return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="7"/></svg>;}
function Fixture(){
 const [result,setResult]=createSignal("none");
 return <main style={{padding:"1rem"}}>
  <span id="size-reference" {...stylex.attrs(styles.reference)}/>
  <p id="caller-help">Caller description stays associated.</p>
  <div id="toolbar" style={{display:"flex",gap:"4px",width:"154px","overflow-x":"auto"}}>
   <For each={Array.from({length:8},(_,i)=>i)}>{id=><Button size="icon" aria-label={"Toolbar action "+id} aria-describedby={id===0?"caller-help":undefined} tooltip={"Help for action "+id} onClick={()=>setResult("toolbar-"+id)}><Glyph/></Button>}</For>
  </div>
  <p id="result">{result()}</p>
  <div id="legacy" style={{display:"flex",gap:"4px",width:"154px","overflow-x":"auto"}}>
   <For each={Array.from({length:8},(_,i)=>i)}>{id=><Tooltip content={"Legacy "+id}><Button size="icon" aria-label={"Legacy action "+id} justificationForNoTooltip="The outer tooltip deliberately reproduces the former shrinking wrapper."><Glyph/></Button></Tooltip>}</For>
  </div>
  <div id="text-row" style={{width:"154px"}}><Button aria-label="Long text action" tooltip="Text remains responsive">A long ordinary text action that must wrap within its container</Button></div>
  <div style={{width:"min(100%, 320px)",height:"300px","margin-top":"1rem"}}>
   <SettingsWorkspace title="Preferences with a deliberately long heading" sections={[{id:"general",label:"General"}]} activeSection="general" onSectionChange={()=>{}} onClose={()=>setResult("settings-closed")}><p>Existing settings consumer.</p></SettingsWorkspace>
  </div>
 </main>;
}
render(()=><Fixture/>,document.getElementById("root")!);
