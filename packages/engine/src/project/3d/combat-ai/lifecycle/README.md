# AI match lifecycle

`rounds.test.ts` exercises the actual gameplay boundary: both Theater fighters keep their spawn preferences and match evidence across round recovery, receive fresh preferences on a new match, and replay exactly from a checkpoint. It also reproduces a fighter landing directly on its opponent and verifies an ordinary walking exit followed by an attack.

`blocked-escape.ts` offers a short lateral walking exit only after observed lack of progress. Gameplay limits requests to grounded collisions and an 18-frame window per 90 combat frames. The helper checks both floor support and a direct solid-free corridor; it does not build another detour graph, teleport, ignore collision, or bypass stamina. Unsupported edges and obstructed directions are rejected. A successful recovery clears the previous elevation plan so normal planning can resume.

Pickup preference affects optional tool acquisition only. An already selected attack or defense wins; declining a pickup does not remove grab tech, guard grabs, or held-item throws.

Wall-run steering bounds its combined horizontal stick before queuing the input.
Slightly sloped wall normals can make the tangent and inward terms nonorthogonal;
their sum previously exceeded the ordinary influence-input limit and stopped bulk
simulation with `Influence direction must be bounded`. `wall-direction.test.ts`
reproduces that failure through combat input validation and covers accepted slopes,
delayed JSON replay, snapshot restoration, and continued rejection of invalid
external inputs. Combat AI lifecycle owns this regression.

`jumping.ts` remembers one delivered jump and its observed outcome. Landing without gaining elevation, closing distance through actual movement, or damaging the opponent increases a bounded retry delay; a blocked takeoff expires after 24 frames. During this delay ordinary walking, defense and attacks remain available and stale elevation plans are discarded. A useful new wall contact may extend a jump, but repeatedly requesting a jump on the same stationary contact cannot restart it. New elevation plans require a grounded target so an opponent's temporary jump height is not mistaken for a rooftop destination. Memory is validated and included in rollback; round recovery clears transient jump attempts. `jumping.test.ts` covers airborne-target feedback, failed landings, blocked takeoff, useful wall extensions, normal movement during backoff and exact JSON replay.

The elevation planner first recognizes live connected supports reachable through the authored auto-step height. This keeps pursuit on an actual stair flight instead of repeatedly jumping onto an unrelated nearby crate. Its backward connectivity search visits at most 64 supports, with at most 64 × 64 support comparisons, and disappears immediately when a required riser is removed. Ordinary physics still performs each step. The portable elevation regression and actual authored-city stair tests cover both the route and human/AI movement.
