# Esculturas / fondos por sección

Los motivos abstractos actuales viven en código (`SectionSigil` en
`src/components/brand/temple.tsx`): misma dirección artística, adaptados a la
paleta claro/oscuro, sin costo de red y 100% offline.

Si el usuario provee imágenes hero por sección, usar este esquema:

```
assets/sculptures/<seccion>-hero.jpg
```

Secciones: `inicio, entrenar, nutricion, progreso, mas, biblioteca, rutina,
calendario, recuperacion, perfil, coach`. JPG ≤ 200KB, tonos compatibles con
la paleta (mármol/navy o mármol/arena). `TempleBackdrop` las precarga como
capa opcional detrás del sigilo.
