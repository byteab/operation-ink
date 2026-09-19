# Armored rescue transport

The escape jeep now follows the supplied Humvee reference: a wide sloping hood, split windshield, two reinforced front doors and continuous rear quarter panels, enclosed roof, sloping rear hatch, chunky tires, hood louvers, mirrors and bumpers. The roof has no weapon or mount. The rear side doors, their windows, handles and hinges have been removed at the user’s request.

All vehicle surfaces use the compound's shared pure-white paper materials and drawn contours. There are no gray fills, tinted windows, lighting gradients or shadows. Window openings preserve the driver's view and allow the seated hostage to remain visible. The passenger door opens on approach and closes after boarding; restart resets the door and wheels. Short steps sit beneath the front doors with brackets back to the chassis. The steering assembly has a thick round rim, three solid spokes, a raised hub and a column attached to a dashboard bracket.

## Verification

- `npm run build` passed. Vite reports the existing large-chunk advisory.
- `npm run test:rescue` passed, including mission state, escort movement, seated footwell clearance, interaction visibility, gate/vehicle clearance, and security checks.
- Used the requested **agent-browser**, isolated session `rescue-vehicle`, against the local Vite server. Desktop capture size: 1440 × 1000; portrait: 390 × 844.
- Inspected front, rear, boarding, passenger, driver and portrait screenshots. All vehicle `MeshBasicMaterial` surface colors were confirmed as `ffffff` in the browser.
- The real escort systems carried the hostage from his cell to the passenger seat. The passenger door reached 1.12 radians before boarding and returned below 0.01 radians after seating.
- The F interaction handlers opened the exit and boarded the player. The vehicle crossed the exit at `[175, 0.05, 11]`, with all four wheels rotating and the hostage aboard; the mission completed.
- Browser geometry checks measured 0.437 m of clearance between each end of the side steps and the nearest tire envelope. The steering column endpoint lies inside its dashboard bracket. Side and driver-seat close-ups confirm a continuous steering assembly.
- Restart restored the vehicle to `[155, 0.05, 11]`, closed the passenger door, reset wheel rotations and returned the hostage to captivity. No browser application errors were reported.

These are staged visual and integration checks using `scripts/rescue-revision-visual.js` and the development inspection surface. Player/camera positions were set for inspection, AI was frozen, and the real mission systems were advanced deterministically. This was not a full input-only mission playthrough. Portrait verification covers rendering, not touch controls.

## Screenshots

- [Front](evidence/front.png)
- [Rear](evidence/rear.png)
- [Passenger door open during approach](evidence/boarding.png)
- [Hostage seated](evidence/passenger.png)
- [Driver view during escape](evidence/driver.png)
- [Portrait rendering](evidence/mobile.png)

- [Side-step tire clearance](evidence/step-clearance.png)
- [Steering rim, hub and connected column](evidence/steering-column.png)
- [Steering from the driver’s seat](evidence/steering-driver.png)
