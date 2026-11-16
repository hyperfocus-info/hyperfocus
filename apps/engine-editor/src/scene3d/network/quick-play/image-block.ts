import type { SocialCommand } from '@hyperfocus/touch-of-death/network/social-protocol';
import type { QuickPlayRoomSnapshot } from '@hyperfocus/touch-of-death/network/quick-play/protocol';
import type { PublicProfile } from '@hyperfocus/touch-of-death/appearance/profile';
import { roomProfileLabel } from '../profile-label.ts';

/** A content preference, not an opponent exclusion or a combat action. */
export function createQuickPlayImageBlock(options: {
  send(command: SocialCommand): void; preference(userId: string, enabled: boolean): void;
  onInteract(): void; now?: () => number;
}) {
  const element=document.createElement('section');element.className='hf-quick-image-block';element.hidden=true;
  element.innerHTML='<button type="button" data-quick-image-block>Block opponent images</button><small>Hides their images and communication. Does not prevent matchmaking.</small><span role="status" aria-live="polite" data-quick-image-status></span>';
  const button=element.querySelector<HTMLButtonElement>('button')!, status=element.querySelector<HTMLElement>('[role=status]')!;
  const style=document.createElement('style');style.textContent='.hf-quick-image-block{display:flex;flex-wrap:wrap;align-items:center;gap:6px;max-width:100%}.hf-quick-image-block[hidden]{display:none}.hf-quick-image-block small,.hf-quick-image-block [role=status]{flex-basis:100%;font-size:12px;white-space:normal}.hf-quick-image-block button{white-space:normal;overflow-wrap:anywhere;max-width:100%}';element.append(style);
  let target='', matchId='', blocked=false, error='', hostError='', pending: {enabled:boolean;deadline:number;previousError:string}|undefined;
  let explicitTarget=false;
  const now=options.now??Date.now;
  function cancel(discard=false) { if(pending) options.preference(target,discard?false:blocked);pending=undefined; }
  function paint() {
    button.disabled=!!pending;button.textContent=blocked?explicitTarget?'Unblock fighter images':'Unblock opponent images':explicitTarget?'Block fighter images':'Block opponent images';
    status.textContent=error||(pending?'Saving image preference...':blocked?explicitTarget?'Fighter images blocked.':'Opponent images blocked.':'');
  }
  button.addEventListener('click',()=>{
    if(!target||pending||element.hidden)return;options.onInteract();error='';
    const enabled=!blocked;pending={enabled,deadline:now()+10000,previousError:hostError};
    if(enabled)options.preference(target,true);
    try{options.send({type:'social-block',requestId:crypto.randomUUID(),targetId:target,enabled});}
    catch(cause){cancel();error=cause instanceof Error?cause.message:'Could not save image preference. Retry.';}
    paint();
  });
  return {
    element,
    get focused(){return !element.hidden && element.contains(document.activeElement);},
    render(input:{active:boolean;localUserId:string;quickPlay?:QuickPlayRoomSnapshot['quickPlay'];target?:{identity:string;userId:string;blockedUserIds:readonly string[];error:string};profiles?:readonly PublicProfile[]}) {
      const q=input.quickPlay;explicitTarget=!!input.target;
      const next=input.target ? input.active&&input.target.userId!==input.localUserId?input.target.userId:'' : input.active&&q?.uploadsEnabled&&['ready','playing','saving','result'].includes(q.phase)&&q.users.includes(input.localUserId)?q.users.find(id=>id!==input.localUserId)??'':'';
      const identity=input.target?.identity??q?.matchId??'';
      if(next!==target || next && identity!==matchId){cancel(true);target=next;matchId=identity;error='';hostError='';}
      element.hidden=!target;
      if(!target)return;
      blocked=(input.target?.blockedUserIds??q!.blockedUserIds).includes(target);hostError=input.target?.error??q!.error;
      if(pending){
        if(blocked===pending.enabled){options.preference(target,blocked);pending=undefined;error='';}
        else if(hostError&&hostError!==pending.previousError||now()>=pending.deadline){cancel();error=hostError||'The host did not confirm this change. Retry.';}
      }
      button.title=roomProfileLabel(target,input.profiles);button.dataset.targetUser=target;paint();
      if(input.target){button.textContent=blocked?'Unblock fighter images':'Block fighter images';element.querySelector('small')!.textContent='Hides their images and communication. Does not remove them from this room.';}
      else element.querySelector('small')!.textContent='Hides their images and communication. Does not prevent matchmaking.';
    },
    dispose(){cancel(true);target='';element.remove();},
  };
}
