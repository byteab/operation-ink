# Compound annotation corrections

Implemented the four annotated references: removed the extra roadside fences,
made the north service gate permanently closed, converted the rescue exit to a
wire gate, moved the indicated observation tower 3m forward and joined its fence,
shortened the loading platform/canopy inside the annex fence, removed the rail
entrance shelter and detention-side baffle, and restored wall/door/interior ink.

Shared walls are now 0.14m thick; door jambs are 0.05m wide with 0.14m frame depth.
Wall faces and opening reveals have contours on both sides. Interior corners,
roof undersides and detention's above-ground footprint have explicit ink lines.

## Verification

- Production build passed.
- Player, map, rescue-route, mission, hostage, security, indoor-enemy,
  door-navigation, fence, tower-patrol and zipline checks passed.
- The rescue-route check walks from insertion to the permanently closed gate,
  then reaches detention through the exterior mess-hall ladder, roof door,
  interior stairs and yard exit. The vehicle's full escape envelope clears the
  opened exit gate.
- Agent-browser inspected the actual WebGL rendering at 1600 × 1000. The views
  below show the cleared forecourt, continuous tower fence, shortened loading
  area, detention ground line, readable warehouse corners and wire gate.
- A staged browser check used the real F handler at the exit control and verified
  the wire leaf reached its fully open angle. Browser error output was empty.

This is targeted visual and staged interaction QA, not an input-only full mission
playthrough. Camera placement, player position and simulation updates use the
development inspection hook, with AI paused for stable captures.

Reproduce by opening `http://localhost:5173/?view=overview` in agent-browser,
waiting for `window.__environment.mission.ready`, then loading
`scripts/check-compound-corrections.js` with `eval --stdin`. Call the named methods
on `window.__compoundChecks` before each screenshot; call `openExit()` last.

## Screenshots

- [Open roadside forecourt and closed service gate](evidence/forecourt.png)
- [Observation tower and connected fence](evidence/tower.png)
- [Shortened loading platform and canopy](evidence/rail.png)
- [Detention footprint line and cleared walkway](evidence/detention.png)
- [Warehouse interior corners and doorway contours](evidence/warehouse.png)
- [Closed wire exit](evidence/exit.png)
- [Exit opened using F at the mission control](evidence/exit-open.png)
