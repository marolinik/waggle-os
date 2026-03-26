# Extract Actions — Pull Action Items from Text

Extract actionable tasks from unstructured text such as meeting notes, emails, conversations, or documents.

## What to do

1. **Accept the text** — Take meeting notes, email threads, conversation logs, or any text containing implicit or explicit action items.

2. **Identify action items** — Scan for:
   - Explicit commitments ("I will...", "We need to...", "Action: ...")
   - Implicit tasks ("We should consider...", "It would be good to...")
   - Follow-ups ("Let's revisit...", "Circle back on...")
   - Decisions that require implementation
   - Questions that need answers

3. **Structure each action** — For every action item, extract:
   - **Action**: Clear, specific task description (start with a verb)
   - **Owner**: Who is responsible (name or role, or "Unassigned" if unclear)
   - **Deadline**: When it is due (or "No deadline" if not specified)
   - **Priority**: High / Medium / Low based on context and urgency
   - **Context**: The original quote or reference that generated this action

4. **Organize by priority** — Group actions by priority level, then by owner.

## Output format

```
## High Priority
- [ ] [Action] — Owner: [name] — Due: [date]
      Context: "[relevant quote]"

## Medium Priority
...
```

## Guidelines

- Be thorough — catch implicit actions, not just explicit ones
- Do not invent actions that are not supported by the text
- If ownership is ambiguous, flag it and suggest who might own it
- Merge duplicate or overlapping actions
- Ask the user to confirm owners and deadlines for ambiguous items
