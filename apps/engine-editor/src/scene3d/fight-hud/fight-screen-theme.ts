/** Art direction for the delivered fighter, intentionally separate from editor UI. */
export const fightScreenTheme = `
.hf-fight-stage [hidden]{display:none!important}
.hf-fight-stage label:has(>[data-pad-focus=true]){outline:2px solid #e7aa63;outline-offset:3px}
.hyperfocus-gameplay-3d[data-stage]{--tod-ink:#111311;--tod-paper:#eee9dc;--tod-muted:#adafa3;--tod-accent:#e7aa63;color:var(--tod-paper);font-family:Arial,Helvetica,sans-serif}
.hyperfocus-gameplay-3d[data-stage=menu]{isolation:isolate;align-items:flex-start!important;justify-content:center;gap:0;padding:clamp(28px,5vw,84px);background:radial-gradient(ellipse at 80% 28%,#48514818,transparent 55%),linear-gradient(90deg,#0e1211fa 0%,#101512ed 32%,#111612a8 58%,#11161232 100%),var(--tod-title-art,none);background-position:center;background-size:cover;overflow:auto}
.hyperfocus-gameplay-3d[data-stage=menu]:before{content:'';position:absolute;inset:24px;border:1px solid #eee9dc23;pointer-events:none;font-size:0;z-index:-1}
.hyperfocus-gameplay-3d[data-stage=menu]:after{content:'';position:absolute;top:24px;left:24px;width:64px;height:4px;background:var(--tod-accent);pointer-events:none}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay{align-self:flex-start;width:min(510px,52%);max-width:none;min-height:0;text-align:left;padding:0;margin:0 0 26px;border-radius:0}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay h2{font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:clamp(66px,8.6vw,132px);font-weight:900;line-height:.83;letter-spacing:-.025em;margin:0 0 26px;text-transform:uppercase;filter:drop-shadow(0 3px 12px #0005)}
.hf3d-wordmark-line{display:block}.hf3d-wordmark-line:first-child{font-size:.6em;letter-spacing:.04em;line-height:1.2}.hf3d-wordmark-line:last-child{color:var(--tod-paper)}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay p{color:var(--tod-muted);font-size:12px;line-height:1.8;margin:0;max-width:43ch;border-left:2px solid var(--tod-accent);padding-left:14px}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-bottom{align-self:flex-start;width:min(430px,46%);padding:0;background:none;text-align:left;border-radius:0}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;justify-content:stretch}
.hyperfocus-gameplay-3d[data-stage] .hf3d-actions button{min-height:45px;border:1px solid #eee9dc36;border-radius:0;background:#151a17dd;color:var(--tod-paper);font:700 12px/1.3 Arial,Helvetica,sans-serif;letter-spacing:.045em;transition:background .14s,border-color .14s,color .14s;text-align:center}
.hyperfocus-gameplay-3d[data-stage] .hf3d-actions button:hover:not(:disabled){background:#323b31;border-color:var(--tod-accent);color:#fff}
.hyperfocus-gameplay-3d[data-stage] .hf3d-actions button:focus-visible,.hf3d-control-disclosure summary:focus-visible{outline:2px solid var(--tod-accent);outline-offset:4px}
.hyperfocus-gameplay-3d[data-stage] .hf3d-actions button:disabled{opacity:.38}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions [data-gameplay-action='match:start']{grid-column:1/-1;background:var(--tod-paper);color:var(--tod-ink);min-height:58px;font-size:17px;text-align:left;padding-left:22px;border-color:var(--tod-paper);position:relative}
.hyperfocus-gameplay-3d[data-stage=menu] [data-gameplay-action='match:start']:after{content:'↗';position:absolute;right:22px;font-size:22px;font-weight:400}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions [data-gameplay-action='match:start']:hover{background:var(--tod-accent);color:var(--tod-ink)}
.hyperfocus-gameplay-3d[data-stage=menu] [data-gameplay-action='match:practice'],.hyperfocus-gameplay-3d[data-stage=menu] [data-gameplay-action='match:quick']{text-align:left;padding-left:18px}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-hint{margin:0 0 14px;font-size:11px;color:var(--tod-muted);line-height:1.6}
.hyperfocus-gameplay-3d[data-stage=result] .hf3d-overlay{align-self:center;text-align:center;padding:20px;width:min(560px,100%);max-width:100%;margin:0;min-height:0}
.hyperfocus-gameplay-3d[data-stage=result] .hf3d-overlay h2{font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:clamp(54px,8vw,112px);font-weight:900;line-height:1;text-transform:uppercase;letter-spacing:-.02em;color:var(--tod-paper)}
.hyperfocus-gameplay-3d[data-stage=result] .hf3d-overlay p{font-size:18px;color:var(--tod-accent);line-height:1.6}
.hyperfocus-gameplay-3d[data-stage=result] .hf3d-bottom{align-self:center;width:min(420px,100%);padding:0 12px 24px}
.hyperfocus-gameplay-3d[data-stage=result] .hf3d-actions{display:flex;flex-direction:column;align-items:stretch;gap:8px}
.hyperfocus-gameplay-3d[data-stage=result] .hf3d-actions button{width:100%;min-height:48px}
.hyperfocus-gameplay-3d[data-stage=result] .hf3d-actions [data-gameplay-action='match:replay']{background:var(--tod-paper);color:var(--tod-ink)}
.hyperfocus-gameplay-3d[data-stage=intro] .hf3d-overlay h2{font-family:Impact,'Arial Narrow',Arial,sans-serif;letter-spacing:.025em;text-transform:uppercase;font-size:clamp(34px,5vw,70px)}
.hyperfocus-gameplay-3d[data-stage=countdown] .hf3d-overlay h2{font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:clamp(90px,15vw,180px);font-weight:900;color:var(--tod-paper);text-shadow:3px 3px 0 #151a17,0 0 50px #e7aa6333}
.hyperfocus-gameplay-3d[data-stage=fight] .hf3d-heading{border:0;border-bottom:2px solid #e7aa6380;border-radius:0;padding:8px 24px;background:linear-gradient(90deg,#111611aa,#111611ee,#111611aa);color:var(--tod-paper)}
.hyperfocus-gameplay-3d[data-stage=fight] .hf3d-heading>p:not(.hf3d-status){font-size:17px;letter-spacing:.3em;font-variant-numeric:tabular-nums}
.hyperfocus-gameplay-3d[data-stage=fight] .hf3d-bottom{background:#111611ed;border:1px solid #eee9dc2a;border-radius:0;backdrop-filter:blur(8px)}
.hf3d-control-disclosure summary{color:#eee9dc;font-size:11px;letter-spacing:.08em;text-transform:uppercase;min-height:38px}
.hyperfocus-gameplay-3d[data-stage=fight] .hf3d-hint{color:#c8ccbd;font-size:12px;line-height:1.8}
@media(min-width:1000px) and (min-height:760px){.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay{margin-bottom:36px}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions{gap:9px}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions button{min-height:49px}}
@media(max-width:700px){.hyperfocus-gameplay-3d[data-stage=menu]{padding:38px 28px 76px;justify-content:center;background:radial-gradient(ellipse at 80% 18%,#48514818,transparent 55%),linear-gradient(90deg,#101512eb,#101512ae),var(--tod-title-art,none);background-position:65% center;background-size:cover}.hyperfocus-gameplay-3d[data-stage=menu]:before{inset:12px}.hyperfocus-gameplay-3d[data-stage=menu]:after{top:12px;left:12px}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay{width:100%;padding:0;margin-bottom:24px;min-height:0}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay h2{font-size:clamp(64px,15vw,104px);margin-bottom:22px}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-bottom{width:100%;padding:0}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay p{font-size:11px}.hyperfocus-gameplay-3d[data-stage=result] .hf3d-overlay{max-width:100%;padding:20px}.hyperfocus-gameplay-3d[data-stage=result] .hf3d-bottom{padding:0 8px 60px}}
@media(max-height:600px){.hyperfocus-gameplay-3d[data-stage=menu]{justify-content:flex-start;padding-top:28px;padding-bottom:72px}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay{margin-bottom:14px}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay h2{font-size:64px;margin-bottom:12px}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions button{min-height:40px}.hyperfocus-gameplay-3d[data-stage=menu] [data-gameplay-action='match:start']{min-height:46px}}
@media(prefers-reduced-motion:reduce){.hyperfocus-gameplay-3d[data-stage] .hf3d-actions button{transition:none}}
.hf-fight-stage :is(.hf-network,.hf-replay,.hf-wardrobe,.hf-rewards){font-family:Arial,Helvetica,sans-serif;color:#eee9dc}
.hf-fight-stage :is(.hf-network,.hf-replay,.hf-wardrobe,.hf-rewards) button{border:1px solid #eee9dc36;border-radius:0;background:#151a17ed;color:#eee9dc;font:700 12px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.025em;min-height:44px;padding:10px 15px}
.hf-fight-stage :is(.hf-network,.hf-replay,.hf-wardrobe,.hf-rewards) button:hover:not(:disabled){border-color:#e7aa63;background:#323b31}
.hf-fight-stage :is(.hf-network,.hf-replay,.hf-wardrobe,.hf-rewards) button:focus-visible{outline:2px solid #e7aa63;outline-offset:3px}
.hf-fight-stage :is(.hf-network,.hf-replay,.hf-wardrobe,.hf-rewards) dialog{border-radius:0;border:1px solid #8b9279;background:#151a17;color:#eee9dc;box-shadow:0 20px 100px #000a}
.hf-fight-stage :is(.hf-network,.hf-replay,.hf-wardrobe,.hf-rewards) dialog::backdrop{background:#070b09cc;backdrop-filter:blur(5px)}
.hf-fight-stage :is(.hf-network,.hf-replay,.hf-wardrobe,.hf-rewards) :is(input,select,textarea){border-radius:0;border-color:#68715e;background:#0c100e;color:#eee9dc;accent-color:#e7aa63}
.hf-fight-stage :is(.hf-runtime-controls,.hf-practice-diagnostics){color:#eee9dc;background:#111611f5;border:1px solid #eee9dc36;border-radius:0;font:12px/1.6 Arial,Helvetica,sans-serif;box-shadow:0 8px 28px #0004;scrollbar-color:#68715e #111611}
.hf-fight-stage .hf-runtime-controls{right:24px;top:24px;padding:0;max-width:min(340px,calc(100% - 48px));max-height:calc(100% - 112px)}
.hf-fight-stage .hf-runtime-controls>summary{background:#111611;color:#eee9dc;padding:12px 14px;margin:0;border:0;top:0;min-height:42px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.hf-fight-stage .hf-runtime-controls[open]>summary{border-bottom:1px solid #eee9dc36}
.hf-fight-stage .hf-runtime-controls[open]{z-index:40}
.hf-fight-stage .hf-runtime-controls>div{padding:12px 14px}
.hf-fight-stage .hf-runtime-controls :is(button,select){border:1px solid #68715e;background:#1a211b;color:#eee9dc;border-radius:0;min-height:40px;padding:7px 10px;font:inherit;margin:4px 0;max-width:100%}
.hf-fight-stage .hf-runtime-controls button:hover:not(:disabled){border-color:#e7aa63;background:#323b31}
.hf-fight-stage .hf-runtime-controls :is(button,select):disabled{opacity:.45}
.hf-fight-stage :is(.hf-runtime-controls,.hf-practice-diagnostics) :focus-visible{outline:2px solid #e7aa63;outline-offset:2px}
.hf-fight-stage :is(.hf-runtime-controls,.hf-practice-diagnostics) input{accent-color:#e7aa63}
.hf-fight-stage :is(.hf-runtime-controls,.hf-practice-diagnostics) p{color:#bfc5b7}
.hf-fight-stage .hf-runtime-controls .hf-audio-mix-row{padding:8px 0;border-top:1px solid #eee9dc18}
.hf-fight-stage .hf-practice-diagnostics{left:24px;top:24px}
.hf-fight-stage .hf-practice-diagnostics>summary{min-height:42px;padding:12px 14px;font-size:11px;letter-spacing:.06em;text-transform:uppercase}
.hf-fight-stage :is(.hf-runtime-controls,.hf-practice-diagnostics)>summary{box-sizing:border-box}
.hf-fight-stage .hf-practice-lesson{top:auto;bottom:144px;left:24px;transform:none;width:390px;max-width:calc(100% - 48px);max-height:32%;overflow:auto;pointer-events:auto;padding:12px 16px;color:#dedfd2;background:linear-gradient(100deg,#111611f5,#111611df);border:1px solid #eee9dc20;border-left:2px solid #e7aa63;border-radius:0;font:12px/1.7 Arial,Helvetica,sans-serif;box-shadow:none;scrollbar-color:#68715e #111611}
.hf-fight-stage .hyperfocus-gameplay-3d[data-practice=true] .hf3d-bottom{width:auto;min-width:290px;text-align:left}
.hf-fight-stage .hyperfocus-gameplay-3d[data-practice=true] .hf3d-control-disclosure>summary{text-align:left}
@media(max-width:600px){.hf-fight-stage .hf-runtime-controls{right:12px;top:12px;max-width:calc(100% - 24px)}.hf-fight-stage .hf-practice-diagnostics{left:12px;top:64px}.hf-fight-stage .hf-practice-lesson{left:12px;bottom:134px;max-width:calc(100% - 24px);padding:9px 12px;font-size:11px}.hf-fight-stage .hyperfocus-gameplay-3d[data-practice=true] .hf3d-bottom{min-width:0}}
.hf-fight-stage[data-fight-phase=menu] [data-network-open],.hf-fight-stage[data-fight-phase=menu] [data-network-quick],.hf-fight-stage[data-fight-phase=menu] [data-replay-open]{position:absolute;left:auto;right:5%;width:190px;text-align:left}
.hf-fight-stage[data-fight-phase=menu] [data-network-open]{top:auto;bottom:230px}
.hf-fight-stage[data-fight-phase=menu] [data-network-quick]{top:auto;bottom:178px}
.hf-fight-stage[data-fight-phase=menu] [data-replay-open]{top:auto;bottom:126px}
.hf-fight-stage[data-fight-phase=menu] .hf-rewards{left:auto;right:calc(5% + 107px);bottom:64px}
.hf-fight-stage[data-fight-phase=menu] [data-wardrobe-open]{left:auto;right:5%;bottom:64px;white-space:nowrap}
@media(max-width:700px){
body.hf-fight-player:has([data-fight-phase=menu]){overflow:auto}
.hf-fight-stage[data-fight-phase=menu]{width:100%;height:max(100dvh,780px)}
.hf-fight-stage[data-fight-phase=menu] .hyperfocus-gameplay-3d[data-stage=menu]{justify-content:flex-start;padding-top:88px;padding-bottom:290px}
.hf-fight-stage[data-fight-phase=menu] [data-network-open],.hf-fight-stage[data-fight-phase=menu] [data-network-quick],.hf-fight-stage[data-fight-phase=menu] [data-replay-open]{left:28px;right:auto;width:calc(100% - 56px)}
.hf-fight-stage[data-fight-phase=menu] [data-network-open]{bottom:218px}
.hf-fight-stage[data-fight-phase=menu] [data-network-quick]{bottom:166px}
.hf-fight-stage[data-fight-phase=menu] [data-replay-open]{bottom:114px}
.hf-fight-stage[data-fight-phase=menu] .hf-rewards{left:28px;right:auto;bottom:58px}
.hf-fight-stage[data-fight-phase=menu] [data-wardrobe-open]{left:135px;right:auto;bottom:58px}
}
@media(min-width:701px) and (max-height:600px){
body.hf-fight-player:has([data-fight-phase=menu]){overflow:auto}
.hf-fight-stage[data-fight-phase=menu]{width:100%;height:max(100dvh,430px)}
.hf-fight-stage[data-fight-phase=menu] .hyperfocus-gameplay-3d[data-stage=menu]{padding-bottom:32px}
}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay h2{font-size:clamp(76px,10vw,148px);letter-spacing:-.025em;margin-bottom:30px}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-wordmark-line:first-child{font-family:Arial,Helvetica,sans-serif;font-size:.25em;font-weight:800;letter-spacing:.18em;line-height:1.8}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-wordmark-line:last-child{line-height:.88;letter-spacing:-.025em}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay p{font-size:13px;line-height:1.65;color:#cbd0c3;padding-left:16px;border-left:2px solid #b17a40}
.hf3d-menu-context{display:inline-block;font-size:13px;letter-spacing:.08em;color:#eee9dc;text-transform:uppercase;font-weight:700;margin-bottom:5px}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions button{font-size:13px;min-height:48px}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions [data-gameplay-action='match:start']{min-height:62px;font-size:18px;letter-spacing:.015em;box-shadow:inset 4px 0 #e7aa63}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions [data-gameplay-action='match:easier'],.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions [data-gameplay-action='match:harder']{background:#111611cc;color:#d6dbcf;border-color:#eee9dc26;font-size:12px}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions [data-gameplay-action='match:practice'],.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions [data-gameplay-action='match:quick']{border-bottom:2px solid #68715e}
.hf-fight-stage[data-fight-phase=menu] :is([data-network-open],[data-network-quick],[data-replay-open]){border-left:2px solid #68715e;font-size:13px;letter-spacing:.025em;min-height:46px}
.hf-fight-stage[data-fight-phase=menu] :is([data-network-open],[data-network-quick],[data-replay-open]):hover{border-left-color:#e7aa63}
.hf-fight-stage :is(.hf-runtime-controls,.hf-practice-diagnostics){border-top:2px solid #68715e;box-shadow:0 8px 32px #0007}
.hf-fight-stage :is(.hf-runtime-controls,.hf-practice-diagnostics)>summary{font-size:12px;min-height:44px;line-height:20px;letter-spacing:.04em;padding:10px 14px}
.hf-fight-stage .hf-runtime-controls>div{font-size:13px;line-height:1.6;padding:16px}
.hf-fight-stage .hf-runtime-controls select{width:100%;margin:6px 0 8px;border-left:2px solid #e7aa63}
.hf-fight-stage .hf-runtime-controls label:has(input[type=checkbox]),.hf-fight-stage .hf-practice-diagnostics label{min-height:38px;align-content:center}
.hf-fight-stage .hf-runtime-controls input[type=checkbox],.hf-fight-stage .hf-practice-diagnostics input[type=checkbox]{width:16px;height:16px;vertical-align:middle;margin-right:8px}
.hf-fight-stage .hf-practice-lesson{font-size:13px;line-height:1.65;padding:14px 18px;width:420px;background:linear-gradient(100deg,#111611fa,#111611eb)}
.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=fight] .hf3d-heading{border:1px solid #eee9dc20;border-top:2px solid #b17a40;border-bottom:0;padding:8px 24px;background:#111611ed}
.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=fight] .hf3d-heading>p:not(.hf3d-status){font-size:16px;letter-spacing:.2em}
.hf-fight-stage .hf3d-control-disclosure>summary{font-size:12px;letter-spacing:.04em;min-height:42px;padding:11px 12px}
.hf-fight-stage .hyperfocus-gameplay-3d[data-practice=true] .hf3d-actions button{min-height:40px;font-size:13px;padding:8px 12px}
.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=result] .hf3d-overlay p{font-size:20px;font-variant-numeric:tabular-nums;letter-spacing:.04em}
@media(max-width:700px){.hf-fight-stage[data-fight-phase=menu]{height:max(100dvh,860px)}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay h2{font-size:clamp(82px,23vw,120px);margin-bottom:24px}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay p{font-size:13px}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions button{min-height:46px}.hf-fight-stage .hf-practice-lesson{font-size:12px;padding:12px 14px}.hf-fight-stage .hf3d-control-disclosure>summary{font-size:11px}}
@media(min-width:701px) and (max-height:600px){.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay h2{font-size:76px;margin-bottom:16px}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions button{min-height:40px}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions [data-gameplay-action='match:start']{min-height:48px}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay p{font-size:12px}}
@media(max-width:600px){.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=fight] .hf3d-heading{align-self:flex-start;max-width:calc(100% - 164px);padding:8px 12px}.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=fight] .hf3d-heading>p:not(.hf3d-status){font-size:14px;letter-spacing:.12em}}
.hf-fight-stage [data-menu-docked=true]:not(details){display:none!important}
.hf-fight-stage :is([data-network-open],[data-network-quick],[data-replay-open],[data-wardrobe-open],[data-rewards-open]){display:none!important}
.hf-fight-stage :is(.hf-runtime-controls,.hf-practice-diagnostics,.hf3d-control-disclosure,.playable-controls>details):not([open]){display:none!important}
.hf-fight-stage[data-menu-open=true]>.playable-controls>button,.hf-fight-stage[data-fight-phase=result]>.playable-controls>button{display:none!important}
.hf-fight-stage[data-menu-open=true] :is(.hf-practice-lesson,.hf-practice-volumes,.hf-interaction-prompt){display:none!important}
.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=fight]>.hf3d-bottom{display:none!important}
.hf-fight-stage :is(.hf-live-menu,.hf-room-pictures):not([open]),.hf-fight-stage [data-voice-quick-mute]{display:none!important}
.hf-fight-stage :is(.hf-live-menu,.hf-room-pictures)[open]{position:fixed!important;inset:auto!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%);width:min(440px,calc(100vw - 32px));max-height:calc(100dvh - 64px);padding:16px;background:#111611;color:#eee9dc;border:1px solid #eee9dc36;box-shadow:0 0 0 100vmax #080d0ccc;overflow:auto;pointer-events:auto;z-index:20}
.hf-fight-stage .hf-live-menu .hf-network-live{display:flex!important;position:static;max-width:none;flex-direction:column;align-items:stretch;padding:0;border:0;background:none}
.hf-fight-stage :is(.hf-live-menu,.hf-room-pictures) :is(button,select){width:100%;min-height:44px;margin:6px 0}
.hf-fight-stage[data-menu-open=false] :is(.hf-network-live,[data-training-open],[data-community-open]){display:none!important}
.hf-fight-stage :is([data-training-pane],.hf-community-pane,.hf-quick-play) .hf-network-buttons{display:flex;flex-direction:column;align-items:stretch}
.hf-fight-stage :is([data-training-pane],.hf-community-pane,.hf-quick-play) .hf-network-buttons button{width:100%}
.hf-fight-stage[data-network-active=true][data-menu-open=false]>.playable-controls>button{display:block!important}
.hf-fight-stage :is(.hf-runtime-controls,.hf-practice-diagnostics,.playable-controls>details)[open]{position:fixed!important;left:50%!important;right:auto!important;top:50%!important;bottom:auto!important;transform:translate(-50%,-50%);width:min(440px,calc(100vw - 32px))!important;max-width:none!important;max-height:calc(100dvh - 64px)!important;padding:16px!important;z-index:20!important;box-sizing:border-box;background:#111611!important;box-shadow:0 0 0 100vmax #080d0ccc;overflow:auto}
.hf-fight-stage :is(.hf-runtime-controls,.hf-practice-diagnostics)[open] :is(button,select){display:block;width:100%;margin:8px 0;min-height:44px}
.hf-fight-stage .hf-runtime-controls>summary{margin:0;top:0}
.hf-fight-stage .hf-practice-pages{display:flex;flex-direction:column;gap:6px;pointer-events:auto;width:100%;order:0}
.hf-fight-stage .hf-practice-pages[hidden]{display:none}
.hf-fight-stage .hf-practice-pages button{width:100%;min-height:44px;padding:11px 16px;text-align:left;border:1px solid #eee9dc36;background:#151a17;color:#eee9dc;font:700 13px Arial;cursor:pointer}
.hf-fight-stage .hf-practice-page-title{margin:8px 0;color:#e7aa63;font-weight:700}
.hf-fight-stage .hyperfocus-gameplay-3d[data-paused=true]{background:#101512ed;backdrop-filter:blur(6px)}
.hf-fight-stage .hyperfocus-gameplay-3d[data-paused=true] .hf3d-hint{display:none}
.hf-fight-stage .hf-combat-reference:not([open]){display:none!important}
.hf-fight-stage .hf-combat-reference[open]{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,calc(100vw - 32px));max-height:calc(100dvh - 64px);overflow:auto;box-sizing:border-box;padding:16px;background:#111611;color:#eee9dc;border:1px solid #eee9dc36;box-shadow:0 0 0 100vmax #080d0ccc;z-index:20;font:13px/1.7 Arial}
.hf-fight-stage .hf-combat-reference summary{min-height:44px;cursor:pointer}.hf-fight-stage .hf-combat-reference p{white-space:pre-line}
.hf-fight-stage .hf-combat-reference nav{display:flex;gap:8px}.hf-fight-stage .hf-combat-reference nav button{flex:1;min-height:44px;background:#151a17;color:#eee9dc;border:1px solid #eee9dc36;font:700 13px Arial}.hf-fight-stage .hf-combat-reference nav button:disabled{opacity:.4}.hf-fight-stage .hf-combat-reference h3{margin:4px 0 12px;font-size:15px}.hf-fight-stage .hf-combat-reference :focus-visible{outline:3px solid #65d9ff;outline-offset:2px}
.hf-fight-stage .hyperfocus-gameplay-3d[data-paused=true] .hf3d-overlay h2{font-size:clamp(42px,7vw,76px)}
.hf-fight-stage .hyperfocus-gameplay-3d[data-paused=true] .hf3d-bottom{max-height:calc(100dvh - 64px)!important;margin:0!important;width:min(400px,46%)}
.hf-fight-stage .hyperfocus-gameplay-3d[data-paused=true] .hf3d-actions{display:flex;flex-direction:column}
@media(max-width:700px){.hf-fight-stage[data-fight-phase=menu]{height:100dvh!important}.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=menu]{justify-content:flex-start}.hf-fight-stage .hyperfocus-gameplay-3d[data-paused=true] .hf3d-bottom{width:100%;max-height:none!important}.hf-fight-stage .hyperfocus-gameplay-3d[data-paused=true] .hf3d-overlay{margin-bottom:12px}.hf-fight-stage .hyperfocus-gameplay-3d[data-paused=true] .hf3d-overlay h2{font-size:44px}}
.hf-fight-stage details[data-menu-docked=true]:not([open]){display:none!important}
.hf3d-menu-dock{display:flex;flex-direction:column;gap:5px;pointer-events:auto}
.hf3d-menu-dock[hidden]{display:none}
.hf-fight-stage .hf3d-bottom:has(.hf3d-menu-dock){justify-content:flex-start;align-items:stretch}
.hf3d-menu-dock{flex-shrink:0}
.hf3d-bottom:has(.hf3d-menu-dock[data-expanded=true])>:not(.hf3d-menu-dock){display:none!important}
.hf-fight-stage .hf3d-menu-dock button{display:block;width:100%;min-height:44px;text-align:left;padding:11px 16px;border:1px solid #eee9dc36;border-left:2px solid #68715e;border-radius:0;background:#151a17ed;color:#eee9dc;font:700 13px/1.4 Arial,Helvetica,sans-serif;cursor:pointer}
.hf-fight-stage .hf3d-menu-dock button:hover{border-color:#e7aa63;background:#323b31}
.hf-fight-stage .hf3d-menu-dock button:focus-visible{outline:3px solid #e7aa63;outline-offset:2px}
.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=menu] .hf3d-bottom{position:absolute;right:5%;top:50%;transform:translateY(-50%);width:min(400px,42%);max-height:calc(100% - 64px);padding:6px;overflow:auto;display:flex;flex-direction:column;gap:5px;pointer-events:auto;scrollbar-color:#68715e #111611}
.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay{width:46%;max-width:510px}
.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions{order:1;display:grid;grid-template-columns:1fr 1fr;gap:5px;width:100%;align-self:stretch}
.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=menu] .hf3d-menu-dock{order:2;width:100%;align-self:stretch}
.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions button{grid-column:1/-1;text-align:left;min-height:44px;padding:11px 16px}
.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=menu] [data-gameplay-action='match:start']{order:0}
.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=menu] [data-gameplay-action='match:practice']{order:1}
.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=menu] [data-gameplay-action='match:quick']{order:2}
.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions [data-gameplay-action='match:easier']{order:3;grid-column:1;text-align:center}
.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions [data-gameplay-action='match:harder']{order:3;grid-column:2;text-align:center}
.hf-fight-stage .hf3d-control-disclosure .hf3d-actions{display:flex;flex-direction:column;align-items:stretch}
.hf-fight-stage .hf3d-control-disclosure .hf3d-actions button{text-align:left;width:100%}
.hf-fight-stage[data-pad-navigation=true][data-fight-phase=fight] .hf-practice-diagnostics{left:24px;top:24px;width:320px;max-width:calc(100% - 48px)}
.hf-fight-stage[data-pad-navigation=true][data-fight-phase=fight] .hf-runtime-controls{left:24px;right:auto;top:76px;width:320px;max-width:calc(100% - 48px)}
.hf-fight-stage[data-pad-navigation=true][data-fight-phase=fight] .hyperfocus-gameplay-3d .hf3d-bottom{position:absolute;left:24px;top:128px;bottom:auto;margin:0;width:320px;max-width:calc(100% - 48px)!important;max-height:calc(100% - 160px);padding:0}
.hf-fight-stage[data-pad-navigation=true] .hf-practice-lesson{display:none}
.hf-fight-stage[data-pad-navigation=true][data-fight-phase=fight] .hf3d-heading{display:none}
.hf-fight-stage :is(.hf-runtime-controls,.hf-practice-diagnostics)[open]{z-index:40}
@media(max-width:700px){.hf-fight-stage[data-fight-phase=menu]{height:100dvh}.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=menu]{padding:20px 16px 48px;justify-content:flex-start;gap:12px}.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay{width:100%;margin:0;flex-shrink:0}.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=menu] .hf3d-bottom{position:static;transform:none;width:100%;max-height:100%;min-height:0;overflow:auto;padding:4px;flex:1 1 auto}.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay h2{font-size:clamp(38px,10vw,64px)}.hf-fight-stage .hyperfocus-gameplay-3d[data-paused=true] .hf3d-bottom{max-height:100%!important}}
.hf-interaction-prompt{position:absolute;left:24px;bottom:14px;z-index:6;max-width:calc(100% - 240px);margin:0;padding:8px 12px;background:#111611f5;color:#eee9dc;border-left:2px solid #e7aa63;font:700 12px/1.5 Arial,Helvetica,sans-serif;pointer-events:none}
.hf-interaction-prompt[hidden],.hf-pad-guide[hidden]{display:none!important}
.hf-pad-guide{position:absolute;left:24px;bottom:14px;z-index:42;margin:0;max-width:calc(100% - 48px);padding:8px 12px;background:#111611f5;color:#eee9dc;border-top:1px solid #e7aa63;font:700 12px/1.5 Arial,Helvetica,sans-serif;pointer-events:none}
.hf-fight-stage[data-pad-navigation=true] .hf-interaction-prompt:not([data-selected-target]){display:none}
.hf-fight-stage[data-pad-navigation=true] .hf-interaction-prompt[data-selected-target]{bottom:60px}
.hf-pickup-target{position:absolute;z-index:6;width:20px;height:20px;border:2px solid #e7aa63;transform:translate(-50%,-50%);pointer-events:none;box-shadow:0 0 0 1px #111611}
.hf-pickup-target[hidden],.hf-fight-stage[data-menu-open=true] .hf-pickup-target{display:none!important}
@media(max-width:600px){.hf-interaction-prompt{left:12px;bottom:12px;max-width:calc(100% - 184px);font-size:11px;padding:6px 8px}.hf-pad-guide{left:12px;bottom:12px;max-width:calc(100% - 24px);font-size:11px}}
`;
