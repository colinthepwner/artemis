# Why these stubs exist

`scripts/audit-forms.ts` runs the studio's own React components in node. Two of the libraries they
import only work in a browser: framer-motion animates real DOM nodes, and radix measures and
portals them. Neither is the thing under test, and both would fail on the first render with no
`document`.

lucide-react is deliberately NOT stubbed. Its icons are plain function components that build an
`<svg>` element and touch nothing outside React, so the real package runs here and one less thing
is pretended.

So the harness build aliases them to the files here. Every stub follows the same rule: **keep every
prop the studio's own code passes through, and drop only what the library itself would have
consumed.** A radix `Switch.Root` becomes a `<button onClick>` that calls the same
`onCheckedChange`; a `Menu.Item` becomes a node whose click calls the same `onSelect`. So when the
harness clicks something in the rendered tree, the handler that runs is the studio's, not a stub's,
which is the whole point.

What that costs, written down so nobody has to guess later:

- Anything only the real library decides is not covered here. Whether a dropdown opens on click,
  whether a slider thumb tracks the pointer, whether a portal lands in the right place, whether an
  animation ever finishes. Those need a browser.
- The stubs render every menu in place instead of in a portal, so a `Menu.Content` and its items are
  in the tree whether the menu is open or closed. The harness therefore never asserts "this menu is
  closed", only what its rows are and what they do.

These files ship nowhere: electron-builder packs `out/**`, `resources/**` and `package.json` only,
and nothing under `src/` imports them.
