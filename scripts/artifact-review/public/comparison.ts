import type { ArtifactItem } from "@hyperfocus/artifact-review/schema";

export function reviewEntries(items: ArtifactItem[]) {
  return items.filter(item => item.comparison?.phase !== 'before')
    .sort((a, b) => Number(Boolean(b.comparison)) - Number(Boolean(a.comparison)));
}

export function renderComparison(options: { items: ArtifactItem[]; active: ArtifactItem; target: HTMLElement; select: (item: ArtifactItem) => void; bindImage: (image: HTMLImageElement) => void; drawRegion: () => void }) {
  const { active, target } = options;
  const pair = active.comparison ? options.items.filter(item => item.comparison?.id === active.comparison?.id).sort((a, b) => a.comparison?.phase === b.comparison?.phase ? 0 : a.comparison?.phase === 'before' ? -1 : 1) : [active];
  target.classList.add('image-comparison');
  target.classList.toggle('paired', pair.length === 2);
  for (const item of pair) {
    const figure = document.createElement('figure'); figure.className = 'comparison-image';
    figure.classList.toggle('reviewing', item.id === active.id);
    const caption = document.createElement('figcaption');
    const button = document.createElement('button');
    const label = item.comparison?.phase === 'before' ? 'Before' : item.comparison?.phase === 'after' ? 'After' : 'Image';
    button.textContent = `Review ${label.toLowerCase()}`; button.setAttribute('aria-pressed', String(item.id === active.id));
    button.onclick = () => options.select(item);
    caption.append(button);
    const viewport = document.createElement('div'); viewport.className = 'image-viewport';
    const image = document.createElement('img'); image.src = item.media!; image.alt = `${label}: ${item.title}`; image.draggable = false;
    image.id = item.comparison ? `${item.comparison.phase}-image` : 'review-image';
    const zoom = document.createElement('button'); zoom.textContent = 'Actual size'; zoom.setAttribute('aria-pressed', 'false');
    zoom.onclick = () => {
      const enlarged = figure.classList.toggle('zoomed'); zoom.textContent = enlarged ? 'Fit image' : 'Actual size'; zoom.setAttribute('aria-pressed', String(enlarged));
      image.style.width = enlarged ? `${image.naturalWidth}px` : '';
    };
    caption.append(zoom);
    if (item.id === active.id) { const draw = document.createElement('button'); draw.textContent = 'Draw region'; draw.onclick = options.drawRegion; caption.append(draw); }
    image.addEventListener('error', () => { const failure = document.createElement('p'); failure.textContent = 'Image unavailable. Select it again to retry.'; viewport.replaceChildren(failure); });
    viewport.append(image); figure.append(caption, viewport); target.append(figure);
    if (item.id === active.id) options.bindImage(image);
  }
}
