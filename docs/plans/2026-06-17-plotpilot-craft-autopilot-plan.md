# PlotPilot Craft Autopilot Plan

## Goal

Absorb PlotPilot-style staged narrative control into the current platform without rebuilding the core runtime. The first iteration prioritizes quality gates, configurable craft profiles, and reviewable state patches.

## Scope

- Add a `CraftProfile` layer with built-in defaults and project-level `bible/craft-profile.json` overrides.
- Extend character, scene, event, recap, runtime snapshot, and quality metric types with optional craft fields.
- Make chapter planning and drafting carry scene-level craft beats for payoff, foreshadowing, progression, redemption, sublimation, daily-life movement, and hooks.
- Keep character state changes, foreshadowing payoff, progression changes, and core setting changes in reviewable recap patches before long-term memory merge.
- Surface character arcs, chapter craft coverage, and pending recap patches in the cockpit.

## Execution Order

1. Type and context extensions.
2. Task template contracts.
3. Runtime quality gates and recap behavior.
4. Cockpit UI views.
5. Unit and integration tests.

## Acceptance

- Old projects still load without craft fields.
- Draft context always contains a Craft Profile block.
- Planning prompts require scene function, character function, emotional shift, information release, progression change, reader payoff, and craft beats.
- Runtime saves recap candidates for approval instead of auto-applying them.
- Series quality metrics include craft coverage signals.
