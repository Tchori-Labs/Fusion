---
"@fusion/dashboard": patch
---

Fix a cross-agent overwrite bug in the Agents split view. The Config tab's form state was initialized once at mount and never resynced on `agent` change, while the master-detail layout reused the same `<AgentDetailView>` / `<ConfigTab>` instance across selections (no `key`). Switching agents while sitting on the Config tab made `hasChanges` evaluate true (stale form values vs. the newly loaded agent), and the 700ms autosave then wrote the previously-viewed agent's name/role/title/icon/model/skills onto the newly-selected agent's row. Adds `key={selectedAgentId}` to `<AgentDetailView>` and `key={agent.id}` to `<ConfigTab>` so both remount with fresh state on every agent transition.
