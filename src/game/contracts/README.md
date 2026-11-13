# Contracts (data-driven missions)

Separate from the campaign `MISSIONS` in `catalog.ts` (those unlock ships). Contracts are the repeatable
jobs on the Missions screen, "Contracts" tab.

- `data.ts`        every contract, plus the difficulty time multipliers. **Add a mission here, nothing else.**
- `objectives.ts`  one handler per objective type (`registerObjective`).
- `manager.ts`     state machine (available, active, success / failed / abandoned), timer, oxygen, board.
- `state.ts`       the saved slice (`save.contracts`) and its tolerant loader.
- `types.ts`       all types. New objective type: add its params to `ObjectiveParamsMap`, then register a handler.

The engine (`engine.ts`, search `contracts-v1`) only forwards events (`landed`, `crash`), a per-frame tick and
`E` presses. Rewards are paid in `onContractFinish`. Logic tests: `npx tsx scripts/contracts.test.mts`.

Time limits are written for "normal" and scaled by difficulty (easy x1.4, normal x1, hard x0.75).
The timer only runs while the game is simulating (not paused, not in a modal).
