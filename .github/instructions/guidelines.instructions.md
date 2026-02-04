---
applyTo: '**'
---
Keep output and complexity to a minimum if possible. This is because the context for LLM is limited and the LLM may not be able to retain all relevant information across multiple interactions. Never use Emojis.

Do not create new .md files (examples: CHANGES.md, FLOW_DIAGRAM.md, QUICK_REFERENCE.md, SETUP_FLOW.md) and other general documentation/summary files. Instead when a summary is needed, update .github/codebase.md so it contains only the most critical of the information. Do NOT include any code in copilot-instructions.md unless absolutely necessary.

If you create new files, make sure they go in appropriate folders. Creating new files should be a rarity and only done when absolutely necessary. If a test file is made, put it in a tests folder and if a source file is made, put it in the src folder, etc.

Comments should be kept when they add value by explaining complex logic, regex patterns, file operations, or non-obvious behavior. Remove only redundant comments that simply restate what the code obviously does.
