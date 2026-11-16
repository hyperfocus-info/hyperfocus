
export const tokens = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '').match(/[A-Za-z_][A-Za-z_0-9]*|\d+(?:\.\d*)?|\+\+|--|==|!=|<=|>=|&&|\|\||[^\s]/g);
