# Read-only NVIDIA profile inventory — October 10

The physical-monitor report is confirmed by the owner. Chrome already uses the
RTX 4070 through ANGLE/D3D11; no driver or power-plan setting was changed.

The new `diagnostics/nvidia-profile.ts` probe reads NVAPI DRS after all throughput
trials have ended. It queries the current global profile, base global profile,
the full audited Chrome path and `chrome.exe`. Both Chrome lookups succeed.

| Setting | Observed stored result |
| --- | --- |
| Preferred refresh rate, `0064b541` | Global value 0, application-controlled; Chrome inherits it from global. |
| Chrome G-SYNC override, `10a879cf` | Value 1, force off; current predefined profile value, not an owner override. |
| MFAA, `0098c1ac` | Setting not found (`-160`) in all queried profiles. |
| Frame cap, idle frame cap, VSync | Setting not found (`-160`); effective values remain unverified. |
| Global G-SYNC mode/request, power-management mode, AA selector/method, FXAA | Setting not found (`-160`); no default is inferred. |

ABI/function identifiers and value interpretation use NVIDIA's
[NVAPI DRS documentation](https://docs.nvidia.com/nvapi/group__drsapi.html) and
[published setting definitions](https://github.com/NVIDIA/nvapi/blob/main/NvApiDriverSettings.h).
These are stored profile observations, not proof of runtime feature activation.
The probe contains no setting/save/profile mutation API and loads only the
installed system NVAPI DLL.

MFAA was a specific hypothesis because NVIDIA describes
[temporally changing sample patterns](https://www.nvidia.com/en-us/geforce/news/multi-frame-sampled-anti-aliasing-delivers-better-performance-and-superior-image-quality/).
The current inventory does **not** establish that it is active or explain the
same-version MSAA differences. It also does not explain the earlier 130 Hz VSync
fallback. The awake material-table cohort now calibrates near 165 callbacks/s;
callbacks are not observed physical presents.

Reproduce from the repository root, outside any timing window:

```powershell
$env:PERF_ROOT='.local/engine-perf/material-table-20261010/roof'
bun.cmd spikes/persistent-world-worker/diagnostics/nvidia-profile.ts
```

Raw evidence is `nvidia-profile.json` in that root. Owner: engine performance
audit. Prune after replacement evidence preserves the settings and unavailable
statuses. No extra driver installation, administrative permission or global
configuration write was used.
