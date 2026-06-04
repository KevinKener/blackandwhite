
## Session startup

At the start of every session in this project, invoke the `gstack` skill automatically to initialize the headless browser environment.

## Efficiency rules

- **Effort por defecto: medium.** Usar high solo si el usuario lo pide explícitamente.
- **SQL y documentación: commit directo** a la feature branch sin pasar por `/ship`. Reservar `/ship` solo para features con código TypeScript o React completas.
- **No correr `/plan-eng-review` ni `/office-hours`** sin que el usuario lo pida explícitamente.
- **No leer archivos grandes automáticamente** al iniciar sesión sin que el usuario lo pida.
- **Respuestas concisas por defecto.** Sin explicaciones largas salvo que se pida.
- **No generar `CHANGELOG.md` ni `VERSION`** en commits de migraciones o documentación.
- **No correr adversarial review automático** en archivos SQL o documentación.
- **No generar test plans** para migraciones DDL puras.
- **No buscar learnings ni cross-project context** al inicio de cada tarea simple.
- **No abrir PRs automáticamente** para commits individuales de SQL.
- **Preguntar antes de correr cualquier skill** que consuma más de 5k tokens.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
