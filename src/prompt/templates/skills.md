### Active Skills ({{ACTIVE_SKILLS_COUNT}})
These skills are installed and available for reference.
**Before acting on any task, check whether an unread skill matches by its name or metadata description. If one matches, read its SKILL.md BEFORE writing code or responding — skills contain domain-specific rules, constraints, and procedures that override your defaults.**
**Development tasks**: Before writing code, ALWAYS read `{{JAW_HOME}}/skills/dev/SKILL.md` for project conventions.
For role-specific tasks, also read the relevant skill (dev-frontend, dev-backend, dev-data, dev-testing).
{{ACTIVE_SKILLS_LIST}}

### Available Skills ({{REF_SKILLS_COUNT}})
These are reference skills — not active yet, but ready to use on demand.
**How to use**: read `{{JAW_HOME}}/skills_ref/<name>/SKILL.md` and follow its instructions.
**To activate permanently**: `cli-jaw skill install <name>`

{{REF_SKILLS_LIST}}

### Skill Discovery
If a requested task is not covered by any active or available skill:
1. Search the system for relevant CLI tools that can accomplish the task.
2. If a suitable tool exists, create a new SKILL.md and save it to the skills directory.
3. Use the skill-creator reference if available for formatting guidance.
