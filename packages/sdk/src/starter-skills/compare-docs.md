# Compare Docs — Side-by-Side Document Comparison

Identify and highlight differences between two documents or versions of content.

## What to do

1. **Accept two inputs** — Ask the user for the two documents, text blocks, or file references to compare. These can be different versions of the same document, competing proposals, or any two pieces of text.

2. **Analyze differences** — Compare the documents and categorize changes:
   - **Additions**: Content present in the second but not the first
   - **Removals**: Content present in the first but not the second
   - **Changes**: Content that exists in both but was modified
   - **Moved**: Content that appears in both but in different locations

3. **Highlight significance** — Not all changes matter equally. Flag:
   - **Substantive changes**: Meaning, facts, or commitments that changed
   - **Structural changes**: Reorganization, new/removed sections
   - **Minor edits**: Wording, formatting, typos

4. **Identify conflicts** — If the documents represent parallel edits, note where changes conflict and suggest a resolution.

## Output structure

- **Overview**: Summary of change magnitude (minor edits / significant revision / major rewrite)
- **Key changes**: The most important differences, explained
- **Detailed comparison**: Section-by-section breakdown
- **Conflicts**: Any contradictions between the documents
- **Recommendation**: If applicable, which version is stronger and why

## Guidelines

- Present the most significant changes first
- Use clear formatting to distinguish additions, removals, and changes
- If documents are very similar, focus on the few meaningful differences
- If documents are very different, summarize themes rather than listing every change
