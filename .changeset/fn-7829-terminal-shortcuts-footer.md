---
"@runfusion/fusion": patch
---

summary: Move terminal shortcuts into the footer and collapse crowded terminal tabs into a dropdown.
category: feature
dev: The shared terminalActionControls fragment now always renders in the .terminal-status-bar footer (never the header .terminal-actions); a ResizeObserver-driven container-overflow check swaps the .terminal-tabs strip for the existing .terminal-mobile-tabs <select> dropdown when tabs don't fit, distinct from the viewport-based isMobileTerminal/isTabletTerminal flags.
