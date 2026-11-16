import type { DeliveryObject } from './manifest.ts';
import { readDeliveryStream } from './stream.ts';

/** Host bootstrap starts bounded requests while the browser loads runtime modules.
 * The runtime adopts these exact byte promises and performs normal integrity checks. */
export function deliveryBootstrapSource(options: { manifest: DeliveryObject; project: DeliveryObject; core: DeliveryObject }) {
  const objects = JSON.stringify([options.manifest, options.project, options.core]).replace(/</g, '\\u003c');
  return `(()=>{const controller=new AbortController(),objects=new Map(),readDeliveryStream=${readDeliveryStream.toString()};
addEventListener('pagehide',()=>controller.abort(),{once:true});
for(const object of ${objects}){const url=new URL(object.url,document.baseURI).href;
const bytes=(async()=>{const request=new AbortController(),abort=()=>request.abort(controller.signal.reason);
controller.signal.addEventListener('abort',abort,{once:true});if(controller.signal.aborted)abort();
const timer=setTimeout(()=>request.abort(Error('Delivery connection stalled; retry loading')),30000);
try{const response=await fetch(url,{credentials:'omit',signal:request.signal});clearTimeout(timer);
if(!response.ok||!response.body)throw Error('Cannot download '+object.url+': HTTP '+response.status);
return await readDeliveryStream({reader:response.body.getReader(),maxBytes:object.size,expectedBytes:object.size,idleTimeoutMs:30000});}
finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);request.abort();}})();
bytes.catch(()=>{});objects.set(url,{object,bytes});}
globalThis.__hyperfocusDeliveryBootstrap={controller,objects};})();`;
}
