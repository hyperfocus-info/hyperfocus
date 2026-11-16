import { afterEach, expect, test } from "bun:test";
import { render } from "solid-js/web";
import { TaskReviewArtifacts, TaskReviewCandidates, TaskReviewProgress } from "./task-review";
import { createSignal } from "solid-js";
import { TaskRequestForm } from "./task-request-form";

afterEach(() => document.body.replaceChildren());

test("typing into a task field preserves focus while the host updates its field descriptors", () => {
  const host=document.createElement("div");document.body.append(host);
  let value=()=>"";
  const dispose=render(()=>{const [draft,setDraft]=createSignal("");value=draft;return <TaskRequestForm fields={[{id:"goal",label:"Goal",value:draft(),kind:"multiline"}]} onChange={(_id,text)=>setDraft(text)} onSubmit={()=>{}} actionLabel="Submit"/>;},host);
  try {
    const input=host.querySelector("textarea")!;input.focus();
    for (const text of ["Keep", "Keep correctness"]) {input.value=text;input.dispatchEvent(new Event("input",{bubbles:true}));expect(document.activeElement).toBe(input);expect(host.querySelector("textarea")).toBe(input);}
    expect(value()).toBe("Keep correctness");
  } finally {dispose();}
});

test("live task updates preserve expanded criteria and artifact inspection focus", () => {
  const host=document.createElement("div");document.body.append(host);
  const [status,setStatus]=createSignal("running");let inspected="";
  const dispose=render(()=><><TaskReviewProgress items={[{id:"task",label:"Validation",status:status(),criteria:["Preserve exact images"]}]} /><TaskReviewArtifacts artifacts={[{id:"artifact",label:"validation.json",detail:status()}]} onInspect={id=>{inspected=id;}} /></>,host);
  try {
    const criteria=host.querySelector("details")!;criteria.open=true;
    const artifact=host.querySelector<HTMLButtonElement>("button")!;artifact.closest("details")!.open=true;artifact.focus();
    setStatus("passed");
    expect(host.querySelector("details") === criteria).toBe(true);expect(criteria.open).toBe(true);
    expect(host.querySelector("button") === artifact).toBe(true);expect(document.activeElement === artifact).toBe(true);
    artifact.click();expect(inspected).toBe("artifact");expect(host.textContent).toContain("passed");
  } finally {dispose();}
});

test("review preserves dependency labels and honest candidate conclusions", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const dispose = render(() => <>
    <TaskReviewProgress items={[{ id: "validate", label: "Correctness checks", status: "Waiting", dependencies: ["Candidate A"] }]} />
    <TaskReviewCandidates conclusion="INCONCLUSIVE — ENVIRONMENT NOISE" candidates={[{ id: "a", label: "Candidate A", status: "Not promotable", tone: "warning", summary: "Validation passed; measurement variance prevents selection.", facts: [{ label: "Median change", value: "0.3%" }] }]} />
  </>, host);
  expect(host.textContent).toContain("Depends on: Candidate A");
  expect(host.querySelector('[role="status"]')?.textContent).toBe("INCONCLUSIVE — ENVIRONMENT NOISE");
  expect(host.textContent).toContain("Not promotable");
  expect(host.textContent).toContain("0.3%");
  expect(host.querySelector("button")).toBeNull();
  dispose();
});

test("artifact inspection delegates identity to the host without opening arbitrary URLs", () => {
  const host = document.createElement("div");
  document.body.append(host);
  let inspected = "";
  const dispose = render(() => <TaskReviewArtifacts artifacts={[{ id: "hash-a", label: "candidate.patch", detail: "2 KiB · immutable" }]} onInspect={id => { inspected = id; }} />, host);
  host.querySelector<HTMLButtonElement>("button")!.click();
  expect(inspected).toBe("hash-a");
  expect(host.querySelector("a")).toBeNull();
  dispose();
});
