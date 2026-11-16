







export function getReverbWidthLabel(mode: string) {
  switch (mode) {
    case "Room":
      return "Narrow";
    case "Plate":
      return "Wide";
    case "Shimmer":
      return "Extra wide";
    default:
      return "Balanced";
  }
}
