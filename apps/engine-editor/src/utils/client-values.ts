






export function atlasColor(index: number) {
  return ["#36c8c2", "#4e86d8", "#8f70db", "#d35f86", "#e7974c", "#84bd61"][index % 6];
}
export function formatMotionTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 60);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}
