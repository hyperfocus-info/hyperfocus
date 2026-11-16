

export const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
