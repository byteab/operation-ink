# Combat expansion

Requested scope: wire-fence ballistics and vision; substantially more enemies including indoor surprises; two-way tower cable traversal; stronger blood and body/kill sounds; near-miss suspicion; livelier character motion.

Implementation is split among focused specialists. Independent verification uses the real map, loaded character rigs, and isolated agent-browser sessions. Staged integration checks and input-driven checks are identified in the evidence report.

Acceptance checks:

- Wire fencing permits player/enemy shots and AI sight, while still stopping movement. Solid walls and closed doors retain their blocking behavior.
- The opening mess hall and other furnished buildings contain grounded, reachable occupants; added patrols have traversable routes and do not overlap props or each other.
- Both tower cable endpoints offer interaction. A ride reaches a supported landing, holds weapons safely, and handles pause, reset and VR consistently.
- Confirmed hits produce stronger bounded blood effects. Misses do not spawn blood. Repeated hits, deaths and checkpoint restore preserve effect limits.
- Body impacts and kills produce distinct immediate confirmation through existing volume/mute/pause controls without making phantom hits audible.
- A nearby passing shot makes an unaware guard visibly suspicious and scan before investigating. Solid occlusion and actual bullet travel bound the response; a miss does not damage the guard or expose an unseen player precisely.
- Idle, suspicion and search animations have variation, preserve gun/hand contacts, and retain the recent fix for repeated aim/lower snapping.
