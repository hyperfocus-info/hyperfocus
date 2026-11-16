export async function renderHistory(options: { id: string; target: HTMLElement }) {
  const { target, id } = options;
  target.textContent = "Loading history…";
  target.dataset.item = id;
  try {
    const response = await fetch(`/api/history/${encodeURIComponent(id)}`);
    if (!response.ok) throw Error("History unavailable. Select this output again to retry.");
    const result = await response.json();
    if (target.dataset.item !== id) return;
    target.replaceChildren();
    for (const version of result.versions) {
      const section = document.createElement("section"), title = document.createElement("h4");
      title.textContent = `Version ${version.version}`; section.append(title);
      if (version.available) { const link = document.createElement("a"); link.href = `/media/${encodeURIComponent(id)}?version=${encodeURIComponent(version.version)}`; link.target = "_blank"; link.rel = "noopener"; link.textContent = "View this asset version"; section.append(link); }
      else { const note = document.createElement("p"); note.textContent = "Original bytes were not retained by the earlier review system."; section.append(note); }
      if (!version.feedback.length) { const note = document.createElement("p"); note.textContent = "No feedback yet."; section.append(note); }
      for (const snapshot of [...version.feedback].reverse()) {
        const revision = document.createElement("details"), summary = document.createElement("summary"), notes = document.createElement("p");
        summary.textContent = `Review ${snapshot.revision} · ${snapshot.review.grade || "Unrated"} · ${new Date(snapshot.createdAt).toLocaleString()}`;
        notes.textContent = snapshot.review.notes || "No overall note."; revision.append(summary, notes);
        for (const annotation of snapshot.review.annotations || []) { const entry = document.createElement("p"); entry.textContent = `${annotation.sectionId || ""} ${annotation.startSeconds !== undefined ? annotation.startSeconds + "s" : ""}${annotation.endSeconds !== undefined ? "–" + annotation.endSeconds + "s" : ""}: ${annotation.text}`; revision.append(entry); }
        section.append(revision);
      }
      target.append(section);
    }
  } catch (error) { if (target.dataset.item === id) target.textContent = error instanceof Error ? error.message : "Unable to load history."; }
}
