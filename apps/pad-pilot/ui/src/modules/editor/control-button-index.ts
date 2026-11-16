export const controlButtonIndex = (control: string) => {
  const match = /^Button (\d+)$/.exec(control);
  return match ? Number(match[1]) : -1;
};
