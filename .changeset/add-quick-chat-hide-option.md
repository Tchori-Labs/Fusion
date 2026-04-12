---
"@gsxdsm/fusion": patch
---

Add quick chat FAB hide option and fix mobile nav overlap

- Add project-scoped `showQuickChatFAB` setting to control Quick Chat FAB visibility (default: true)
- When disabled, the FAB is hidden but chat remains accessible from the More menu
- Fix mobile Quick Chat FAB/panel positioning to properly account for mobile nav bar height and safe-area insets
- Add regression tests for QuickChatFAB visibility behavior
- Update mobile CSS tests to properly verify Quick Chat offset rules
