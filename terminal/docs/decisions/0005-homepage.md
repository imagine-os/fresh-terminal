# 0005 — homepage follows the Excalidraw pattern

- The landing page is the product. `/` renders the visitor's most recent box (created on first visit under an anonymous identity) with the composer focused. One short headline line and a three-item "how it works" row appear only while the box is empty; they fade with the doodles after the first line.
- No sign-up. A "save / sign in" control appears after a few lines and in dev mode; it is a not-wired placeholder for Clerk.
- Icons carry keyboard shortcuts in their tooltips (`N` new box, `[` toggle sidebar, `T` theme, `D` dev mode, `L` language). Single key when focus is outside the composer, Ctrl/Cmd+key inside it. Escape closes floating panels.
- Doodle hints are inline SVG with a hand-drawn feel pointing at the composer, mic, suggestion strip and new-box button. No image assets.
- Tokens keep the SpacetimeDB-inspired dark, sparse aesthetic (now the "Void" and "Glass Window" themes); the Excalidraw pattern governs layout and first-run behaviour.
- The name stays "Fresh Terminal" as one constant (`PRODUCT_NAME` in `shared/src/brand.ts`) so it can be renamed in one place later.
