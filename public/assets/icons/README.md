# Iconos — familia "piedra tallada"

Subí aquí los SVG definitivos del usuario. Estructura:

```
assets/icons/
├── navigation/   home.svg training.svg nutrition.svg progress.svg more.svg
├── more/         library.svg routines.svg calendar.svg recovery.svg coach.svg profile.svg
├── actions/      add.svg delete.svg edit.svg confirm.svg back.svg forward.svg
│                 collapse.svg expand.svg search.svg view.svg play.svg clock.svg
│                 rotate.svg close.svg closeplain.svg download.svg info.svg alert.svg
│                 copy.svg code.svg camera.svg barcode.svg link.svg globe.svg
│                 offline.svg box.svg layers.svg heart.svg history.svg cpu.svg
│                 drive.svg droplets.svg energy.svg
└── modules/      (reservado: variantes por módulo si hicieran falta)
```

Reglas: formato SVG, `viewBox="0 0 24 24"`, trazo uniforme, sin `width`/`height`
fijos (los pone el componente), área táctil mínima resultante 44px.
Mientras un archivo falte, `BrandIcon` usa el fallback Lucide y avisa en consola.
