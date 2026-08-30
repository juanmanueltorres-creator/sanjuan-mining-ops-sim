# Cesium cartographic controls audit

Date: 2026-08-30

## Goal

Add compact cartographic instrumentation without turning the map into a dashboard: north reference, local scale, cursor coordinates/elevation, home extent, and readable attribution.

## Chosen patterns

### North / heading

Use Cesium `viewer.camera.heading` (radians) as the single source of truth. The north marker rotates by the inverse camera heading so the glyph continues to indicate geographic north as the view rotates.

Source: https://cesium.com/learn/cesiumjs/ref-doc/Camera.html

Important boundary: this is camera orientation, not magnetic declination or a field compass.

### Cursor coordinate + elevation

For a cursor screen position:

1. `viewer.camera.getPickRay(windowCoordinates)`
2. `viewer.scene.globe.pick(ray, viewer.scene)`
3. convert the returned Cartesian position to cartographic longitude/latitude/height
4. if no globe intersection exists, display `—` rather than synthesizing a coordinate

Cesium documents `Globe.pick` specifically for intersecting a camera ray through a screen pixel with the rendered globe.

Sources:
- https://cesium.com/learn/cesiumjs/ref-doc/Globe.html
- https://cesium.com/learn/cesiumjs-learn/cesiumjs-camera/

For V0 the elevation readout represents the rendered globe/terrain intersection. It is not a surveyed road elevation.

### Local scale bar

Use a local screen-to-ground estimate near the lower center of the map:

1. shoot two camera rays through screen points separated by a small known number of pixels
2. intersect both with `scene.globe`
3. convert both intersections to cartographic points
4. calculate ground distance
5. derive metres-per-pixel
6. choose a readable `1 / 2 / 5 × 10^n` scale length

This follows the Cesium community/Terria-style scale indicator pattern. Because a perspective globe does not have one uniform scale across the entire screen, the UI must label this as a local scale and compute it near the scale bar location.

Reference: https://community.cesium.com/t/distance-scale-indicator/10371

If either ray misses the globe, the scale becomes unavailable (`—`) rather than freezing a stale value.

### Home / regional extent

Use a fixed sourced San Juan regional extent with `camera.flyTo`, not a magic camera state copied from a user session. Cesium accepts a `Rectangle` as a camera destination.

Source: https://cesium.com/learn/cesiumjs/ref-doc/Camera.html

The home action restores the regional operational view only; it does not modify simulation time or selection state.

### Attribution / credits

Do not replace or hide Cesium/provider credits. Cesium exposes `Viewer.creditDisplay` / `CreditDisplay`, including static credits and its native credit container. Keep that container readable at the lower edge and add our territorial-data attribution separately only when necessary.

Sources:
- https://cesium.com/learn/cesiumjs/ref-doc/CreditDisplay.html
- https://cesium.com/learn/cesiumjs/ref-doc/Viewer.html

## Implementation boundary

`MapInstrumentation` may read camera/globe state, but formatting and scale selection remain pure helpers in `cartographicReadout.ts` and are unit tested. The instrumentation must not create a second Viewer, alter the simulation engine, or infer safety/transitability from terrain.

## Visual rules

- north control compact and always visible
- scale and coordinate/elevation readouts live at map edges, not in large cards
- unavailable values render `—`
- attribution remains readable and unobstructed
- no decorative compass animation; update only with camera state
- controls must not cover critical route/vehicle content
- mobile collapses readouts before shrinking text below legible size
