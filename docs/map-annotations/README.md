# Annotated map fixes

Applied the supplied September 18 screenshot:

- Removed the surrounding masonry wall; existing out-of-bounds recovery remains.
- Moved the west utility building three metres north so its walls/roof clear the cross fence.
- Removed the pine between that building and the observation tower.
- Moved the inner gate from plan coordinate `(667, 674)` to `(667, 555)`, sealing the old opening.
- Closed the water-tower shortcut around the west end of the rail platform with a fence from `(915, 290)` to `(915, 415)`.
- Connected the observation tower's southeast foot to the cross fence and closed the small return beside the administration building. The ladder remains accessible.
- Made the tower zipline one-way from the water tower to the observation tower, including VR interaction.
- Changed the jeep to simple neutral pen outlines with opaque white paper surfaces (clarified after the initial transparent version).
- Fixed enemy navigation around open leaves, cached door geometry, leaf tips and guards overlapped by a swinging door.

Validation: production build; player, map, rescue, AI and expansion suites pass. `test:ai` includes five new physical door regression scenarios. Revised map route tests pass through the relocated inner gate and the rail maintenance gate instead of the newly fenced shortcuts. Existing checks verify both tower ladders and the zipline's safe arrival.

Agent-browser was used for staged overview and jeep visual inspection. Images are in `evidence/`; these are inspection views, not evidence of an input-only full mission playthrough.
