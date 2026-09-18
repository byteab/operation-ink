# Hostage Escort

Current behavior: one green prisoner using the enemy GLB, seated in cell 01, with a stand-up transition before escort and a sit-down transition at the compact jeep. See [Single-Hostage Revision](REVISION-SINGLE-HOSTAGE.md). The original four-actor notes below are historical.

Four unarmed ochre-vest stickmen are protected civilians. They do not register enemy hit volumes, take damage, or fail the mission when shot. During nearby shooting they crouch and cover their heads, then resume after 1.1 seconds of calm. An alarm by itself does not stop their movement.

The saved mission owns every hostage's identity, status, feet position, and next route waypoint. The escort only updates that state; mesh transforms are derived from it. Restart clears navigation caches, delay state, and transient recovery routes, restores the actors, and derives each captive's own cell exit from its position.

Movement uses the existing guard capsule and floor checks. An authored corridor connects each cell doorway, underground hallway, stair flight, surface road, and jeep boarding point. This avoids applying the existing single-elevation A* grid to the multilevel basement. The player leads by progressing along the same route. Each hostage must physically reach every waypoint and the boarding point before it can occupy one of four seats. Only this final seat attachment snaps position.

Rally retries a stalled route from the saved position. On level ground it can compute a collision-checked local detour; on stairs it retraces a physically reached step before retrying. It never teleports through walls or skips the floor checks. Hostages open ordinary doors using existing navigation; locked cell doors remain controlled by the mission release action. Hostages do not collide with one another or the player, preventing crowd blockages in doorways.

`HostageEscort.jeepOffset` is the runtime's translation of the extraction vehicle from its initial position. Loaded actor transforms use the matching absolute seat coordinate plus that offset. The mission coordinator owns gate prerequisites, boarding authorization for the player, vehicle travel, and completion.

Verification: `node scripts/check-player.mjs scripts/hostage-checks.ts` exercises real compound collisions, all four cell exits, stairs, boarding, danger hold/resume, rally recovery, and state restoration. Browser verification covers their visual presentation and HUD integration.
