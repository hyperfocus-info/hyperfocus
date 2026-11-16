
export function normalizeSampleFieldTypes(fields: string[]) {
  return fields.map((field) => field
    .replaceAll("SampleSliceMarker", "SliceMarker")
    .replaceAll("SamplePadAssignment", "PadAssignment")
    .replaceAll("SampleChokeGroup", "ChokeGroup")
    .replaceAll("SampleAnalysisMode", "RecutAnalysisMode")
    .replaceAll("SampleBpmSource", "RecutBpmSource"));
}
