# Pressure decisions

Hit confirms forecast contact before the defender's remaining stun expires, including the AI's delivery delay and the currently observed DI trajectory. They are estimates, not guaranteed combos: a later defender input can change the trajectory. Expired stun opportunities return to movement rather than blindly issuing another flurry.

During an authored cancel window, a reachable and affordable lethal continuation
takes priority over the preferred sustained string. Actual weapon damage and
cost determine eligibility; fastest startup then lower stamina cost rank finishes.
The reach forecast admits fast links within short remaining stun windows without
a fixed eight-frame cutoff. `confirm.test.ts` verifies real lethal contact and
rejects expired windows; chosen inputs still pass through ordinary cancel gates.

High settings can cancel authored heavy startup into a feint after observing repeated parries. They need not wait for a last-frame guard that arrives after the cancel window closes. A visible early fresh guard remains an immediate feint opportunity. Observed enemy feints also encourage sustained earlier blocking instead of always targeting a perfect parry. These choices emit ordinary inputs through the existing reaction queue and action gates.

`confirm.test.ts` covers remaining stun, delayed delivery, escaping DI and the actual parry-reward recovery boundary. `feints.test.ts` feeds resolved simulation parries, checks repeatable anticipatory choices, and submits the chosen feint through the authored cancel gate. `theater.test.ts` runs 6,000 gameplay ticks with both AI seats and verifies varied exchanges plus exact checkpoint replay. These tests do not establish human-facing balance or long-term fun.
