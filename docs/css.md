# CSS

How the style sheets are written: the global sheets in `src/ui/styles`, and a scoped style block in each component.

## The style tree is the template tree

A component's style block has one root rule, for its root element, and every element inside is a rule nested where it sits in the template.
A direct child is written with `>`; a deeper element only when the path to it says nothing.
Reading the style block from the top reads the template from the top.

```css
header {
  > div:first-child {
    flex: 1;
  }

  > div:last-child {
    gap: 6px;
  }
}
```

Rules are nested with plain CSS nesting, which Vize flattens for a scoped block.
`&` is written only where it joins a compound, the element itself in a state or with a pseudo-element: `&:hover`, `&[aria-pressed="true"]`, `&::before`, `&:not(…)`.
A child is never written `& .x` or `& > x`; it is `.x` or `> x`.
A nested rule never starts with a bare pseudo-class, which would mean a descendant.
`:deep(…)` nests like any child.

## Elements and attributes, not classes

An element says what it is: `header`, `section`, `ol` and `li`, `h2`, `p`, `time`, `small`, `label`.
A state is the attribute that already says it: `aria-pressed`, `aria-checked`, `aria-selected`, `aria-current`, or a `data-` attribute when no ARIA one fits (`data-ready`, `data-turn`).

A class is kept where nothing else names the element.

- Siblings of one element type that `:first-child`, `:last-child` or an attribute cannot tell apart.
- A class set on a child component's root by its parent (`away` on a view).
- A class that script reads or writes, such as the map's pins, built outside Vue.
- A data-driven class, such as a paper's color or a `CtTextMorph` part's tone.

A scoped element rule also matches the root of every child component in the template, which carries the parent's scope.
So an element rule sits under the path that leads to it, never bare at the top of a view where a `CtChip`'s `button` or an `Icon`'s `span` would pick it up.

## Named media queries

Media queries are named in `src/ui/styles/media.css` with `@custom-media`, and LightningCSS (the CSS transformer in `vite.config.ts`) replaces each name with its query at build time.

- `--can-hover` is a pointer that can hover, so a hover style never sticks on a tapped phone.
- `--reduced-motion` is a request for less motion.
- `--dark` is the dark desk.
- `--wide` is wide enough for the 648px page column with margins.

A definition only reaches the sheet it is in, so a style block that uses a name starts with `@import` of `media.css`.
A name with no definition matches nothing and says nothing; `media.test.ts` fails on it, and on a sheet that uses a name without the import.

An `@media` rule is nested in the rule it changes.

```css
button {
  color: var(--muted);

  @media (--can-hover) {
    &:hover {
      color: var(--ink);
    }
  }
}
```

The page column's inline margin is the token `--page-margin`, which is 16px and switches to whatever centers the column under `--wide`.
