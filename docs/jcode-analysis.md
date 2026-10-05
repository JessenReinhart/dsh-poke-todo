# jcode Auto-Poke Todo Analysis

Detailed analysis of the auto-poke todo implementation in [jcode](https://github.com/1jehuang/jcode) and its mapping to DeepSeek Harness (DSH) Cordis plugin architecture.

## 1. jcode Auto-Poke Feature & User Surface

In jcode, auto-poke automatically continues an agent turn if the model stops while incomplete todo items remain.

### Commands & Keybindings
- **Slash Commands**:
  - `/poke`: triggers immediate poke check.
  - `/poke on`: enables auto-poke for the session.
  - `/poke off`: disables auto-poke and clears pending pokes (`crates/jcode-tui/src/tui/app/commands.rs:50-119`).
  - `/poke status`: shows current state.
- **Keybinding**: `ctrl+p` toggles auto-poke (`crates/jcode-config-types/src/lib.rs:1029-1030`, `keybindings.rs:280-281`).
- **Environment Overrides**: `JCODE_AUTO_POKE=0` or `JCODE_RUN_AUTO_POKE=0` (`crates/jcode-base/src/config/env_overrides.rs:354`).
- **Default Config**: Enabled by default (`auto_poke = true`, `crates/jcode-base/src/config/default_file.rs:288`).

## 2. Incomplete Todo Poke Message

When incomplete todos exist, jcode builds an auto-poke continuation message (`crates/jcode-base/src/todo.rs:648-654`):

```text
You have <count> incomplete todo<s>. Continue working, or update the todo tool.
```

- Singular: `You have 1 incomplete todo. Continue working, or update the todo tool.`
- Plural: `You have N incomplete todos. Continue working, or update the todo tool.`

## 3. Precedence Order & Circuit Breakers

In `src/cli/commands.rs:2774-2813` (`build_run_auto_poke_follow_up_from_todos`):

1. **Incomplete Todos (Highest Priority)**:
   - Filters out `completed` and `cancelled` / `canceled` statuses.
   - If any incomplete todos exist, returns `RunAutoPokeFollowUp::Incomplete`.
2. **Quality Gate Digest**:
   - If gate digest is pending and delivered, requests review of weak points.
3. **Completion Confidence / Spike Validation**:
   - Verifies whether confidence scores pass thresholds or if abrupt spikes occurred.
4. **Max Turns / Budget Circuit Breaker**:
   - Auto-poke stops after reaching max turns to prevent infinite execution loops.

## 4. UI Transcript Handling

Synthetic pokes are flagged via `is_auto_poke_message()` (`crates/jcode-base/src/todo.rs:743-775`).
The TUI suppresses rendering these as normal user-authored prompts in history, displaying an informational status notice instead.

## 5. What Was Deliberately Not Ported & Why

- **Confidence Scores & History**: jcode attaches `completion_confidence`, `confidence_history`, and spike detection heuristics to `TodoItem`. DSH's native `@deepseek-ai/dsh-tool-todo` only supports `{ content: string, status: "pending" | "in_progress" | "completed" }`.
- **Quality Gate Digest**: Dependent on jcode's internal gate-runner subroutines.
- **Synthetic Transcript Filter**: Handled natively in Cordis via `UserMessage` source tags (`source: { kind: "plugin", plugin: "jcode-poke-todo" }`).
