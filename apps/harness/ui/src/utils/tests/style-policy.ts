


export function isClassAttribute(name: string) {
  return name === "class" || name === "className" || name === "classList" || /Class$/.test(name);
}

export function toWindowsPath(pathname: string) {
  return pathname.replace(/^\/(?:[A-Za-z]:)/, (drive) => drive.slice(1));
}
