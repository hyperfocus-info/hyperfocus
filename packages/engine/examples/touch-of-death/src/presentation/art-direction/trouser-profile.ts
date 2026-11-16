type Ring = readonly [number,number,number,number];

/** The garment and its sewn overlays consume the same surface definition. */
export function trouserProfile(segment:string,fit='straight'):Ring[] {
  const length=segment==='thigh'?Math.hypot(.045,.4935,.02):Math.hypot(.035,.4165,.02);
  if(fit==='wide') {
    const lower=segment==='thigh'?.080:.062,upper=segment==='thigh'?.108:.080;
    return [[-length*.5,lower*1.15,lower*1.18,.004],[-length*.40,lower*1.24,lower*1.25,.004],
      [0,upper*1.12,upper*1.10,0],[length*.36,upper*1.12,upper*1.12,0],[length*.5,upper,upper,0],
      ...(segment==='shin'?[[length*.57,.073,.070,0],[length*.64,.025,.025,0]] as const:[])];
  }
  return segment==='thigh'?[[-length/2,.079,.081,.007],[-length*.33,.086,.092,.014],[0,.102,.096,0],[length*.35,.112,.106,0],[length/2,.091,.09,0]]
    :[[-length/2,.062,.064,0],[-length*.3,.065,.067,0],[length*.2,.082,.08,0],[length/2,.079,.08,0],[length*.57,.065,.067,0],[length*.64,.025,.025,0]];
}

export function trouserSurface(rings:readonly Ring[],angle:number,y:number,offset=.002):[number,number,number] {
  const row=Math.max(1,rings.findIndex(ring=>ring[0]>=y)),a=rings[row-1]!,b=rings[row]!;
  const t=(y-a[0])/(b[0]-a[0]),width=a[1]+(b[1]-a[1])*t,depth=a[2]+(b[2]-a[2])*t,center=a[3]+(b[3]-a[3])*t;
  return [Math.sin(angle)*(width+offset),y,Math.cos(angle)*(depth+offset)+center];
}
