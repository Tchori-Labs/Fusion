---
"@dustinbyrne/kb": patch
---

Add markdown preview to file editor

The dashboard file editor now supports a preview mode for markdown files (.md, .markdown, .mdx). When viewing a markdown file, users can toggle between edit mode (textarea) and preview mode (rendered markdown) using Edit/Preview buttons. This follows the same pattern as the spec editor's view/edit toggle.

- Markdown files show Edit/Preview toggle buttons
- Preview mode renders using ReactMarkdown with GitHub-flavored markdown support
- Non-markdown files show only edit mode (no toggle)
- In read-only mode, markdown files default to preview mode with only the Preview button visible
