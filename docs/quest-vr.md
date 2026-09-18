# Quest VR walkthrough experiment

Branch: `experiment/quest-webxr`.

Yes: this Three.js world can run as immersive VR in Meta Quest Browser through WebXR. The existing metre-based map, buildings, doors, stairs, and collision simulation are reused. The headset supplies stereo views, head movement, and floor-relative eye height. This experiment covers the environment walkthrough; the separate animation lab and a full VR combat/control system are outside its scope.

## Test from your Mac using USB (recommended)

1. Enable **Developer Mode** for your headset and connect it to your Mac with a USB data cable. Follow [Meta's device setup guide](https://developers.meta.com/horizon/documentation/web/browser-remote-debugging/) if this is your first developer connection. Put on the headset and accept **Allow USB debugging** when prompted. Quest Link is not required: the game runs in the headset's own browser.
2. In this project, run:

   ```sh
   npm install
   npm run dev:vr
   ```

   Keep this terminal running. The command reserves port **5173** instead of silently choosing a different port. If it says the port is in use, stop the previous Vite instance before restarting.

3. In another terminal, run:

   ```sh
   adb devices
   adb reverse tcp:5173 tcp:5173
   ```

   Android Platform Tools (`adb`) are already installed on this Mac. The device list must show the headset with the status `device`. For `unauthorized`, accept the USB debugging prompt inside the headset. If nothing appears, check Developer Mode and the USB data cable. If several Android devices are connected, use `adb -s HEADSET_SERIAL reverse tcp:5173 tcp:5173` instead, taking the serial from `adb devices`.

4. In **Meta Quest Browser**, open **http://localhost:5173/**. Type `localhost`, not your Mac's Wi-Fi IP address. USB port forwarding makes this address point to the Mac, and WebXR permits localhost as a secure development context.
5. Pick up both Touch controllers, select **Enter VR** in the VR experiment panel, and allow the browser's immersive-experience permission. Enter VR directly; **Start walking** is the desktop mouse control button.
6. Stay near the centre of your boundary and try the controls below. Use the Quest system menu's exit/quit immersive-experience control to return to the page. You can enter again from your current virtual position.

The USB connection must remain active. Rerun `adb reverse tcp:5173 tcp:5173` after disconnecting/rebooting the headset. To remove the mapping when finished:

```sh
adb reverse --remove tcp:5173
```

## Controls and a first test route

| Input | Action |
| --- | --- |
| Turn / tilt your head | Look around; lean and crouch use headset tracking |
| Left thumbstick | Walk in the horizontal direction you are looking, up to 1.8 m/s |
| Right thumbstick left / right | Turn 30°; release to centre before turning again |
| Look at a nearby door or ladder + either trigger | Open/close the door, or blink to the ladder's other landing |
| B on the right controller | Return to the starting entrance |
| Quest system menu | Exit the immersive experience |

An in-world panel shows the current interaction and controller reminders. There are no visible hands or controller models in this experiment: interaction uses where you look, not where you point the controller. Hand tracking is not implemented.

Start by looking around without moving. Then use the left stick to approach the ladder ahead. When **Trigger: Climb up** appears, press either trigger. A brief blackout takes you to the roof landing without an animated climb or forced head rotation. Approach the rooftop door, look at it and press a trigger. Walk downstairs, follow the **EXIT** sign through the dining hall, and open the ground-level door into the yard. Try closing doors, returning up the stairs, and using **B** to reset.

There is no VR sprint or jump in this experiment. Stairs, gravity, and virtual movement collision use the existing player body. That body remains at the virtual locomotion origin: physical room-scale walking/leaning is not collision-constrained and can put your head through a virtual wall. Use the thumbstick for travel and stay near your starting physical position. This is a walkthrough feasibility test, not a complete room-scale collision implementation.

## Wireless alternative

Serve the production build from an HTTPS host with a certificate Quest Browser trusts, then open its HTTPS URL in the headset. Run `npm run build` and upload the contents of `dist/` to your chosen static host. No developer mode or USB forwarding is needed for an HTTPS website. This experiment does not publish the project automatically.

A plain URL such as `http://192.168.100.19:5173` can show the 2D page but **cannot start immersive WebXR**. Being on the same Wi-Fi is not enough; use HTTPS or the USB localhost route above. See [Meta's local debugging instructions](https://developers.meta.com/horizon/documentation/web/browser-remote-debugging/) and [Three.js WebXR basics](https://threejs.org/manual/en/webxr-basics.html).

## Troubleshooting and performance

- **Open on Meta Quest to enter VR:** expected in a desktop browser without an XR runtime. On the headset, open Meta Quest Browser directly, not an embedded browser or a desktop mirror.
- **VR needs a secure connection:** use the forwarded localhost URL or trusted HTTPS.
- **Could not start VR:** the error appears beneath the button. Check the site's immersive/spatial permission and the headset's floor boundary, then retry. A floor-level (`local-floor`) reference space is required.
- **Cannot connect to localhost:** confirm Vite is running on port 5173, `adb devices` shows `device`, and the reverse mapping is present with `adb reverse --list`.
- **Movement does not respond:** use Touch controllers rather than hand tracking, and close the Quest menu to give the immersive session focus.
- **Choppy image:** exit VR, open `http://localhost:5173/?vrQuality=low`, and enter again. This uses 70% eye-buffer width/height (about half the pixels). The default uses the runtime's normal eye resolution with maximum fixed foveation. Lower resolution helps GPU fill cost; it does not reduce geometry or draw calls.
- **Floor/height feels wrong:** the game uses your actual tracked eye height, including when seated. Recheck the Quest boundary floor or recenter using the headset's system controls.

The map is unlit and needs no shadows, which is helpful for standalone VR. Detailed outlines and the number of meshes can still be expensive when drawing both eyes. Actual comfort, line readability, stereo correctness, and sustained frame rate must be checked on your Quest; desktop emulation cannot establish these. Stop the session if motion feels uncomfortable.

For debugging, connect desktop Chrome to the headset through `chrome://inspect/#devices` and inspect its browser tab, following [Meta's guide](https://developers.meta.com/horizon/documentation/web/browser-remote-debugging/). Development builds expose `window.__environment.vr` and `window.__environment.stats()`. The latter includes draw calls and triangles from the last frame; it is not a headset GPU profiler.

## Local validation

```sh
npm run build
npm run test:player
npm run test:vr
```

VR regression checks cover Quest thumbstick mapping, dead zones, diagonal speed, snap-turn release gating, initial headset alignment, floor/eye height, crouching, turn pivot, head-relative movement, and instantaneous traversal of every ladder in both directions onto supported landings. Existing player checks cover the shared collisions, stairs, and door behavior.
