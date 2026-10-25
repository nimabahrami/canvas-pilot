# Journal enhancer

The bottom-right orb turns the complete saved journal into instructions for another AI assistant. It requests concrete tasks, observable acceptance checks, and one final audit instruction covering the whole journal. It does not execute the work or certify that an audit has passed.

The canonical system prompt is `ENHANCEMENT_INSTRUCTIONS` in [`shared/journal.mjs`](../shared/journal.mjs). All six provider integrations use the same instructions. The provider receives the selected MD/TXT/XML journal text, ordered entry IDs, screenshot paths, and available window metadata. Screenshot pixels are not uploaded.

## Expected handoff

For each actionable entry, the enhancer should preserve the intended outcome and constraints, break compound requests into tasks, and describe how the receiving assistant can verify them. Context-only cards stay context. It must not infer a visual defect from a filename or invent code locations, libraries, measurements, or requirements. The receiving assistant is instructed to inspect available screenshots and project files.

One audit instruction belongs at the end of the last card. For coding work it asks the receiving assistant to inspect repository guidance and tooling, run the appropriate verified checks, review relevant UI/data/security behavior, fix supported gaps, and report evidence and limitations. For non-coding work it audits the delivered artifact instead. An exact shell command is included only if the source journal establishes it; otherwise the receiving assistant must discover the correct command.

Illustrative output for a caption saying “I can't scroll to the last entry in export preview”:

> Make the export preview usable for the whole journal.
>
> Tasks:
> 1. Inspect the referenced screenshot and the existing export preview.
> 2. Fix scrolling so the user can reach the final entry while keeping export controls reachable.
>
> Acceptance checks:
> - A journal longer than the preview can be scrolled to its last entry.
> - Export controls remain usable.
>
> Final audit:
> Check every task and constraint in this journal against the completed changes. Inspect the project's instructions and available checks, then run the relevant verified commands and exercise the export interaction. Fix regressions within scope. Report the changes, actual checks and results, and any blocked or unverified items. Do not claim a check passed without evidence.

This is a hand-written example, not a recorded model response or a promise of identical wording. In a multi-card journal, the final audit covers all cards and appears only once.

## Preservation and review

The model returns JSON containing only entry IDs and improved text. The application validates card count, order, IDs, and text limits. Metadata, paths, images, and timestamps remain application-owned. The shared serializer escapes XML and produces all three formats from the same reviewed entries. The result is editable before copy/apply, and the original wording can be restored. Unsaved composer text is excluded.

These structural checks cannot establish that model-generated tasks are semantically correct. Review the result for omitted requirements, excessive scope, incorrect assumptions, and a proportionate audit. Provider/model quality varies.

The prompt uses explicit role, instructions, grounding, and output sections, consistent with [OpenAI's prompt engineering guidance](https://developers.openai.com/api/docs/guides/prompt-engineering). That guidance informs the structure; it does not establish the quality of this app's output on other providers.
