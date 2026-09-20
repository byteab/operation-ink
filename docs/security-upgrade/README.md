# Surveillance and scenery update

Removed the small signboards above mission interaction panels. Added broadleaf
and poplar crowns alongside the existing pines, keeping the white surfaces and
black outlines. Moved the conifer beside the annex corner south to [102.9, 24.75],
outside both fence runs. Tree meshes remain batched with the landscape.

Four cameras now watch the compound, including a wall-mounted camera at the
southeast corner of the first building, overlooking its yard exit. Their lights
are green when watching, red during an active alarm, and dark when disabled.
Cameras hold each lookout direction for 3.5 seconds, turn smoothly over 1.8
seconds, then hold again. Detection follows the camera's actual heading.

The first computer in the mess hall's signals office has a blue screen. F disables
all cameras for 60 seconds of active gameplay, with a HUD countdown. It becomes
usable again after surveillance recovers. Pause freezes the countdown; checkpoint
restore preserves it; restarting clears it. The nearby chair is pulled aside to
keep the approach clear. The existing security-cabin control still disables the
network permanently and can override a temporary shutdown. Neither control
silences an already-triggered alarm.

The siren uses the original `alarm_1.wav` from the existing extracted IGI asset
cache. Its deployed WAV is byte-identical to the cache (stereo, 22,050 Hz, 19,584
frames). It loops at original pitch without overlapping repeated alarm events.
Silencing the alarm, pausing, muting, leaving audible range or restoring a
checkpoint stops the loop. The previous synthesized sound remains a fallback.
The original archive is not present in this workspace; verification compared
against the existing extracted WAV and the updated manifest.

## Verification

Passed production build, mission, security, audio, player, map and rescue-route
checks. These cover timed recovery, repeated-use protection, permanent override,
checkpoint state, detection dwell/occlusion, all four cameras' real map sightlines,
finite reserve response, audio cleanup and all existing map patrol/traversal paths.
The map check verifies three tree species, crown clearance from every fence panel,
and real PlayerActions activation of the office monitor, including rejection
through the office partition.

Agent-browser verified the actual WebGL scene at 1600 × 1000. Staged checks used
the real F-key handler to disable the cameras and silence an active alarm. They
confirmed the countdown, pause, timed recovery, checkpoint/restart behavior,
pause/turn camera motion and a decoded original IGI loop without duplicate
sources. Browser errors were empty. This was targeted visual and staged behavior
QA with controlled positions and paused AI, not a full input-only playthrough or
a subjective listening assessment.

Reproduce from a freshly loaded `/?view=overview` page: wait for
`window.__environment.mission.ready`, then load
`scripts/check-security-upgrade.js` with `agent-browser eval --stdin`. Call
`window.__securityChecks.computer()` and `scan()` for behavior checks. For audio,
call `sound()`, click the canvas to unlock browser audio, wait for
`window.__environment.mission.audio.buffers.has('igi/alarm_1.wav')`, then call
`alarm()`. Reload before installing the script again. Named view methods prepare
the screenshots below; they hide HUD and first-person arms for inspection.

## Screenshots

- [Blue-screen office computer](evidence/office.png)
- [New camera at the first building's exit](evidence/exit-camera.png)
- [Green camera indicator](evidence/camera-green.png)
- [Red alarm indicator](evidence/camera-red.png)
- [Tree moved beyond the annex fence](evidence/fence-clearance.png)
- [Pine, broadleaf and poplar trees](evidence/tree-varieties.png)
- [Alarm panel without its small board](evidence/alarm-panel.png)
