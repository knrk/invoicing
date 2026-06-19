@AGENTS.md

# File Naming

Always name files in English (e.g. `invoice-list.tsx`, `tax-config.ts`). Never use Czech or other non-English names.

# TypeScript

Avoid `any`. Use precise types — `unknown`, explicit interfaces, or type imports from libraries. If a cast is truly necessary, use the narrowest possible type (e.g. `as React.ReactElement<DocumentProps>`), never `as any`.

# React Keys

Never use array index as a React key. Always use a unique, stable identifier from the data (e.g. `item.id`, `item.text`). Index keys cause subtle bugs when lists reorder or items are added/removed.
