# Independent quiet-route verification

Verified in a separate headless agent-browser session (`rescue-stealth`) at `http://127.0.0.1:5174`, viewport 1440x1000. The session was closed after evidence capture.

## Completed result

- Fresh insertion through the new west service gate, western perimeter, southern service lane, inner gate and loading court.
- Normal jump at the raised railway edge near `[106.5, -23.92]`; security computer disabled before hostage release; exit gate opened in preparation.
- Four hostages released from their underground cells, followed upstairs, boarded the jeep, and escaped through the exit.
- Final mission phase: `complete`; jeep: `escaped`; four hostages: `loaded`.
- 307.1874 seconds of active mission time, 68 health, 23 kills, 83 shots.
- Zero camera detections, inactive alarm throughout, zero reserve soldiers dispatched.

Evidence: [completion screenshot](evidence/stealth-complete.png), [complete state and full input log](evidence/stealth-complete.json), and [western entry route](evidence/stealth-west-route.png).

The verification harness reads diagnostics to steer toward authored waypoints and aim at visible guards that already have visual contact or are in combat. It dispatches ordinary keyboard, mouse, fire, reload, interaction and jump events. It does not teleport, set health, alter enemies or mission state, bypass collision, or accelerate the game clock. This is automated normal-input play, with diagnostic guidance, rather than unaided human play.

## Earlier attempts and route corrections

1. The original roof/mess-hall route with no firing died after 31.27 mission seconds, before reaching the annex. It made zero shots or kills and never triggered a camera alarm. See [first attempt](evidence/stealth-first-attempt.json) and [screenshot](evidence/stealth-first-attempt.png).
2. An insertion with combat followed by no-fire movement through the southern court died to its remaining loading patrols with 11 kills. See [second attempt](evidence/stealth-second-attempt.json).
3. A defensive-only roof attempt was deliberately paused for the west service-gate improvement; it reached the inner service route at full health. See [paused attempt](evidence/stealth-defensive-paused.json).
4. The first new-gate attempt reached the west detention flank at full health without an alarm, but a development-page reload reset the session. It is not counted as a completed run.
5. The final fresh new-gate run completed. A direct waypoint north along the detention flank met the existing railway platform, so a normal Space jump was added at its edge. The input harness initially paused after boarding; clicking the normal Resume button allowed the jeep to finish its four-second exit movement.

`scripts/rescue-stealth-route.js` preserves the final route and defensive target filter. It now includes the observed jump and a final five-second wait so boarding does not immediately pause extraction. Those two replay convenience changes were recorded after the successful run; the entire revised script has not been rerun as a separate second pass.

## Scope of the claim

This establishes a complete alarm-free alternative with fewer kills than the separately verified combat route (23 versus 28). It does not establish a pacifist or low-kill completion: local guard combat remained substantial under this automated route's patrol timing. The new west gate itself provided a zero-combat insertion around the occupied mess hall. More patient manual observation or different timing may reduce later contact, but that has not been verified here.
