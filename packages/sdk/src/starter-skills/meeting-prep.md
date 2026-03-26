# Meeting Prep — Context-Aware Meeting Preparation

Prepare for meetings by pulling relevant context from the workspace and generating structured preparation materials.

## What to do

1. **Identify the meeting** — Ask for meeting topic, attendees, and purpose if not provided. Check workspace memory for related prior discussions.

2. **Generate agenda items** — Based on workspace context, suggest 3-7 agenda items ordered by priority. Include time estimates if the user specifies meeting duration.

3. **Build talking points** — For each agenda item, provide:
   - Key point to make (1-2 sentences)
   - Supporting data or context from workspace
   - Potential questions others might raise

4. **Prepare questions to ask** — Generate 3-5 questions the user should ask, based on gaps in current knowledge or decisions that need to be made.

5. **Pull relevant background** — Search workspace memory for related decisions, open threads, and prior meeting outcomes that provide context.

## Output structure

- **Meeting**: Topic and purpose
- **Suggested agenda**: Numbered items with time estimates
- **Talking points**: Per agenda item
- **Questions to ask**: With rationale for each
- **Background context**: Relevant prior decisions and open items
- **Pre-meeting actions**: Anything to prepare or send beforehand

## Guidelines

- Prioritize actionable items over informational ones
- Flag decisions that need to be made in this meeting
- Note any conflicts or tensions that may arise based on workspace context
- Keep talking points concise — the user needs glanceable notes, not scripts
