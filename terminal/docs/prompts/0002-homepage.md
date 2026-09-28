# 0002 — homepage (Excalidraw pattern)

Source: Justin, same thread, 2026-09-28. Verbatim:

> excalidraw.com is a genius homepage. It lets you start and is obvious how it works. You dont signup until you need or want to. It also has shortcuts on the icons, and little doodles of what is what. Consider this our homepage for freshterminal. ... I personally dont like the name terminal. But its what people know, and this can always route them to the better worded domain later.

## Reply summary

The landing page is the product: the visitor lands in an auto-created anonymous box with the composer focused; one short line above the fold; no sign-up. Icons carry shortcuts in tooltips (`N`, `[`, `T`, `D`, `L`) and the shortcuts work (single key outside the composer, Ctrl/Cmd inside). An empty box shows inline-SVG doodle hints that fade after the first line. A quiet "save / sign in" affordance appears after a few lines and is marked not wired yet. The name is a single constant `PRODUCT_NAME` in `shared/src/brand.ts`. Decision: `decisions/0005-homepage.md`.
