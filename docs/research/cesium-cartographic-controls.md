# Cesium cartographic controls audit

Date: 2026-08-30

Scope: the V0 regional operational scene. This note documents the APIs and display rules used for orientation, scale, cursor readout, regional reset and attribution. The goal is a compact map-first instrument layer, not decorative GIS chrome.

## North / camera orientation

Chosen pattern: derive north from `Viewer.camera.heading`, convert radians to degrees and update from the camera `changed` event. `camera.percentageChanged` is reduced from its default so the compass stays aligned without a React animation-frame loop.

Reference: https://cesium.com/learn/cesiumjs/ref-doc/Camera.html

Implementation rule: rotate the north arrow by the negative camera heading. This is camera orientation, not magnetic declination or a field compass. The readout does not mutate the camera and does not create a second viewer.

## Local scale bar

Chosen pattern: estimate ground distance from two horizontal screen samples near the lower map area.

1. Convert each screen sample into a pick ray with `camera.getPickRay`.
2. Intersect the ray with the rendered globe using `scene.globe.pick`.
3. Measure the resulting Cartesian distance.
4. Derive metres per pixel.
5. Select a readable `1 / 2 / 5 × 10^n` distance that fits the target width.

References:
- https://cesium.com/learn/cesiumjs/ref-doc/Globe.html
- https://cesium.com/learn/cesiumjs/ref-doc/Camera.html

A perspective globe has no single uniform screen scale, so this is a local scale around the measurement position. If either ray misses the globe, or the result is non-finite, the UI shows `SCALE UNAVAILABLE`; it does not synthesize a value from camera height or freeze a stale one.

## Cursor coordinates and elevation

Chosen pattern: use `ScreenSpaceEventHandler` on `MOUSE_MOVE`, intersect the cursor ray with the globe, and derive longitude/latitude from the picked Cartesian position.

References:
- https://cesium.com/learn/cesiumjs/ref-doc/ScreenSpaceEventHandler.html
- https://cesium.com/learn/cesiumjs/ref-doc/Globe.html

Elevation is stricter than coordinates. `Globe.getHeight(cartographic)` returns a terrain height or `undefined`; therefore V0 exposes elevation only when a terrain provider is actually available and the returned value is finite. Ellipsoid-only fallback or missing terrain data renders `ELEV —`. A longitude/latitude pick is never silently promoted into a surveyed or road-surface elevation.

## Regional view

Chosen pattern: `camera.setView` resets the scene to one deterministic San Juan regional camera position/orientation. Cesium documents `setView` as setting camera position, orientation and transform.

Reference: https://cesium.com/learn/cesiumjs/ref-doc/Camera.html#setView

The reset is deliberately immediate rather than cinematic. It changes presentation only; it does not change simulation time, selected vehicle, source state or the immutable operational run.

## Credits and OpenStreetMap

Cesium's credit display remains the canonical attribution surface. Credits must stay visible and unobstructed by the operational HUD.

References:
- https://cesium.com/learn/cesiumjs/ref-doc/Credit.html
- https://cesium.com/learn/cesiumjs/ref-doc/CreditDisplay.html
- https://www.openstreetmap.org/copyright
- https://operations.osmfoundation.org/policies/tiles/

V0 uses the standard HTTPS OSM raster tile URL for ordinary interactive viewing only. The map displays an on-screen link to the OSM copyright/licence page. The application does not bulk-download, prefetch areas for offline use or bypass HTTP caching.

Operational limitation: `tile.openstreetmap.org` is a community-funded best-effort service with no SLA. Sustained/commercial production traffic should use a configurable appropriate OSM-derived provider or self-hosted tiles rather than treating the community server as guaranteed infrastructure.

## Architecture boundary

Cesium owns globe/camera/picking state. React owns the compact instrument presentation. Formatting and 1/2/5 scale selection remain pure helpers in `cartographicReadout.ts`.

The instrumentation must not:
- create another `Viewer` or `CustomDataSource`;
- write simulation truth into React on every animation frame;
- infer transitability, authorization or safety from terrain/weather;
- hide provider credits;
- drive geospatial geometry with a UI motion library.

V0 invariant: `one Viewer + one primary CustomDataSource + persistent entities + fail-closed readouts`.
