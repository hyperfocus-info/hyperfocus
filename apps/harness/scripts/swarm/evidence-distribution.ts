

export function distribution(values:number[]){const sorted=[...values].sort((a,b)=>a-b);return{samples:values,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*0.95)-1]};}
