// Load with agent-browser eval --stdin, begin through the UI, then call __rescueStealth.start().
// These routes dispatch only normal input events; read-only diagnostics guide movement and aiming.
(async () => {
  const source = await fetch('/scripts/rescue-input-run.js').then(response => response.text());
  const original = "n.state!=='dead'&&n.state!=='reserve'&&";
  if (!source.includes(original)) throw new Error('Input harness target filter changed');
  // Change this test runner's targeting only; game state and perception remain untouched.
  (0, eval)(source.replace(original, `${original}(n.canSee||n.state==='combat')&&`));
  const roofInsertion = [{ key: 'Digit3' }, { move: [-53, -62.3], sprint: true }, { move: [-53, -51.35] },
    { move: [-50.4, -51.35] }, { use: 'west exterior' }, { move: [-45, -40] }, { move: [-25, -40] },
    { move: [-25, -43.4] }, { move: [-25, -54.9] }, { move: [-28.8, -54.9] }, { move: [-28.8, -49] },
    { move: [-34.2, -49] }, { move: [-34.2, -31] }];
  const insertion = [{ key: 'Digit3' }, { move: [-53, -62.3] }, { move: [-61.8, -52] },
    { move: [-61.8, -49.5] }, { move: [-61.8, -44] }, { move: [-61.8, -39] },
    { move: [-72, -39] }, { move: [-72, 15] }, { move: [-60, 15] }, { move: [-60, 21] }, { move: [-50, 21] }];
  const south = [{ move: [-40, 20.1] }, { move: [-40, 4] }, { move: [-20, 4] }, { move: [-20, 20.1] },
    { move: [-11.75, 20.1] }, { move: [-11.75, 14] }, { move: [0, 13] },
    { move: [55, 16] }, { move: [99, 11] }, { move: [106.5, 11] },
    { move: [106.5, -23.9], tolerance: 0.06 }, { key: 'Space' }, { move: [106.5, -35] }];
  const preparation = [{ move: [111, -37] }, { move: [111, -45] }, { move: [113.1, -45.5] }, { station: 'supply' },
    { key: 'KeyR' }, { wait: 3 }, { move: [111, -45] }, { move: [111, -37] }, { move: [119, -36.8] },
    { move: [139, -37] }, { move: [146, -37] }, { move: [146, -45] }, { move: [147.4, -45.8] }, { station: 'cameras' },
    { move: [146, -45] }, { move: [146, -37] }, { move: [139, -37] }, { move: [139, -25] }, { move: [128, -22] },
    { move: [128, -3] }, { move: [128, 11] }, { move: [151, 11] }, { move: [158, 11] }, { move: [159, 6.3] }, { station: 'gate' }];
  const rescue = [{ move: [158, 11] }, { move: [151, 11] }, { move: [128, 11] }, { move: [128, -3] },
    { move: [117, -3] }, { move: [117, -8] }, { move: [117, -21] }, { move: [115.1, -19.75] }, { stationId: 'hostage-1' },
    { wait: 2 }, { move: [117, -21] }, { wait: 4 }, { move: [117, -19.8] }, { move: [117, -8] }, { wait: 8 },
    { move: [117, -3] }, { move: [127, 11] }, { wait: 8 }, { move: [153, 12.6] }, { move: [155.02, 12.25] },
    { wait: 16 }, { move: [152.3, 13] }, { move: [152.3, 9.3] }, { move: [154.5, 9.3] }, { station: 'jeep' }, { wait: 5 }];
  window.__rescueStealth = {
    insertion, south, preparation, rescue, roofInsertion,
    start() { window.__rescueInputRun.run([...insertion, ...south, ...preparation, ...rescue], true); },
    startInsertion() { window.__rescueInputRun.run(insertion, true); },
    startSouth() { window.__rescueInputRun.run(south, true); },
  };
  return 'Stealth-oriented route candidates installed; start each through normal resume controls.';
})()
