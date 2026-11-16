export function markdownFor(index: number) {
  switch (index % 4) {
    case 0:
      return `## Update ${index}\n\nA paragraph with **strong text** and \`inline-${index}\`.`;
    case 1:
      return `> Evidence ${index}\n> remains visible in the bounded window.`;
    case 2:
      return `| Metric | Value |\n| --- | ---: |\n| Rows | ${index} |\n| Stable | yes |`;
    default:
      return `\`\`\`ts\nconst sample${index} = ${index};\n\`\`\``;
  }
}
