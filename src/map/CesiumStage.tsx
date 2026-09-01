import { useEffect, useRef, useState } from 'react';
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  ConstantPositionProperty,
  Credit,
  CustomDataSource,
  EllipsoidTerrainProvider,
  Entity,
  HeightReference,
  Math as CesiumMath,
  PolylineDashMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  Viewer,
} from 'cesium';
import type { OperationalSnapshot } from '../domain/contracts';
import type { StaticOperationData } from '../data/loadOperation';
import type { BackgroundTrafficVehicle } from '../simulation/backgroundTraffic';
import { MapInstrumentation } from '../ui/MapInstrumentation';
import {
  createOperationalAdapter,
  resolveBackgroundTrafficPoint,
  type OperationalMapAdapter,
  type VehicleEntitySink,
} from './cesiumAdapter';
import { formatCoordinates, formatElevation, selectScaleBarMeters } from './cartographicReadout';
import { REGIONAL_VIEW } from './regionalView';
import { buildCorridorRenderLines, routeGeometryStyle } from './routeGeometryStyle';
import { visualHeightOffsetM } from './terrainPlacement';
import { installPreferredTerrain, normalizeTerrainToken } from './terrainRuntime';

export interface CesiumStageProps {
  data: StaticOperationData | null;
  snapshot: OperationalSnapshot;
  fleetIds: string[];
  backgroundIds: string[];
  backgroundTraffic: BackgroundTrafficVehicle[];
  onVehicleSelect?: (vehicleId: string) => void;
}

interface MapInstrumentState {
  headingDeg: number;
  scaleLabel: string | null;
  scaleWidthPx: number | null;
  cursorText: string | null;
}

type TerrainDisplayState = 'READY' | 'ELLIPSOID' | 'FAILED';

function canUseWebGl(): boolean {
  return typeof window !== 'undefined' && typeof WebGLRenderingContext !== 'undefined';
}

function vehicleColor(id: string): Color {
  if (id.includes('-PERS-')) return Color.fromCssColorString('#7dd3fc');
  if (id.includes('-FIELD-')) return Color.fromCssColorString('#fbbf24');
  return Color.fromCssColorString('#e5e7eb');
}

function createVehicleSink(dataSource: CustomDataSource): VehicleEntitySink {
  const entityId = (vehicleId: string) => `vehicle:${vehicleId}`;

  function requireEntity(vehicleId: string): Entity {
    const entity = dataSource.entities.getById(entityId(vehicleId));
    if (!entity) throw new Error(`Missing Cesium entity for vehicle ${vehicleId}`);
    return entity;
  }

  return {
    ensure(vehicleId) {
      if (dataSource.entities.getById(entityId(vehicleId))) return;
      dataSource.entities.add({
        id: entityId(vehicleId),
        name: vehicleId,
        position: new ConstantPositionProperty(Cartesian3.fromDegrees(-68.5364, -31.5375, 0)),
        point: {
          pixelSize: 9,
          color: vehicleColor(vehicleId),
          outlineColor: Color.fromCssColorString('#0b1115'),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: HeightReference.RELATIVE_TO_GROUND,
        },
      });
    },
    setPosition(vehicleId, lon, lat, _elevationM) {
      const entity = requireEntity(vehicleId);
      const next = Cartesian3.fromDegrees(lon, lat, visualHeightOffsetM('OPERATIONAL_VEHICLE'));
      if (entity.position instanceof ConstantPositionProperty) {
        entity.position.setValue(next);
      } else {
        entity.position = new ConstantPositionProperty(next);
      }
    },
    setVisible(vehicleId, visible) {
      requireEntity(vehicleId).show = visible;
    },
  };
}

function createBackgroundTrafficSink(dataSource: CustomDataSource): VehicleEntitySink {
  const entityId = (vehicleId: string) => `background:${vehicleId}`;

  function requireEntity(vehicleId: string): Entity {
    const entity = dataSource.entities.getById(entityId(vehicleId));
    if (!entity) throw new Error(`Missing Cesium background entity for ${vehicleId}`);
    return entity;
  }

  return {
    ensure(vehicleId) {
      if (dataSource.entities.getById(entityId(vehicleId))) return;
      dataSource.entities.add({
        id: entityId(vehicleId),
        name: `Synthetic background traffic ${vehicleId}`,
        show: false,
        position: new ConstantPositionProperty(Cartesian3.fromDegrees(-68.5364, -31.5375, 0)),
        point: {
          pixelSize: 4,
          color: Color.fromCssColorString('#b9c3c8').withAlpha(0.42),
          outlineColor: Color.fromCssColorString('#0b1115').withAlpha(0.55),
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: HeightReference.RELATIVE_TO_GROUND,
        },
      });
    },
    setPosition(vehicleId, lon, lat, _elevationM) {
      const entity = requireEntity(vehicleId);
      const next = Cartesian3.fromDegrees(lon, lat, visualHeightOffsetM('BACKGROUND_TRAFFIC'));
      if (entity.position instanceof ConstantPositionProperty) {
        entity.position.setValue(next);
      } else {
        entity.position = new ConstantPositionProperty(next);
      }
    },
    setVisible(vehicleId, visible) {
      requireEntity(vehicleId).show = visible;
    },
  };
}

function addStaticTerritory(dataSource: CustomDataSource, data: StaticOperationData): void {
  for (const project of data.projects) {
    const active = project.activeOperationalDestination;
    dataSource.entities.add({
      id: `project:${project.id}`,
      name: project.name,
      position: Cartesian3.fromDegrees(
        project.lon,
        project.lat,
        visualHeightOffsetM(active ? 'ACTIVE_PROJECT' : 'PROJECT'),
      ),
      point: {
        pixelSize: active ? 9 : 5,
        color: active ? Color.fromCssColorString('#fbbf24') : Color.fromCssColorString('#89939b'),
        outlineColor: Color.fromCssColorString('#11181d'),
        outlineWidth: 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: HeightReference.RELATIVE_TO_GROUND,
      },
      label: active
        ? {
            text: project.name.toUpperCase(),
            font: '600 12px Inter, sans-serif',
            fillColor: Color.fromCssColorString('#f6f7f8'),
            outlineColor: Color.fromCssColorString('#11181d'),
            outlineWidth: 3,
            pixelOffset: new Cartesian2(0, -16),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            heightReference: HeightReference.RELATIVE_TO_GROUND,
          }
        : undefined,
    });
  }

  const corridorColors = ['#70c8d7', '#e3aa54', '#97b99a'];
  data.corridors.forEach((corridor, index) => {
    const baseColor = Color.fromCssColorString(corridorColors[index % corridorColors.length]);
    const renderLines = buildCorridorRenderLines(corridor);
    const isV2 = Boolean(corridor.geometrySegments?.length);

    for (const line of renderLines) {
      const positions = line.points.map((point) =>
        Cartesian3.fromDegrees(point.lon, point.lat, Math.max(0, point.elevationM + 3)),
      );
      if (positions.length < 2) continue;

      const style = routeGeometryStyle(line.geometryClass);
      const color = baseColor.withAlpha(style.alpha);
      const material = style.pattern === 'solid'
        ? color
        : new PolylineDashMaterialProperty({
            color,
            dashLength: style.dashLength,
            dashPattern: style.dashPattern,
          });

      dataSource.entities.add({
        id: isV2 ? `corridor:${corridor.id}:${line.id}` : `corridor:${corridor.id}`,
        name: isV2 ? `${corridor.name} · ${line.geometryClass}` : corridor.name,
        polyline: {
          positions,
          width: style.width,
          material,
          clampToGround: true,
          zIndex: 10,
        },
      });
    }
  });
}

function setRegionalView(viewer: Viewer): void {
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(REGIONAL_VIEW.lon, REGIONAL_VIEW.lat, REGIONAL_VIEW.heightM),
    orientation: {
      heading: CesiumMath.toRadians(REGIONAL_VIEW.headingDeg),
      pitch: CesiumMath.toRadians(REGIONAL_VIEW.pitchDeg),
      roll: 0,
    },
  });
  viewer.scene.requestRender();
}

function pickGlobe(viewer: Viewer, position: Cartesian2): Cartesian3 | null {
  const ray = viewer.camera.getPickRay(position);
  if (!ray) return null;
  return viewer.scene.globe.pick(ray, viewer.scene) ?? null;
}

function formatScale(distanceM: number): string {
  if (distanceM >= 1000) {
    const km = distanceM / 1000;
    return `${Number.isInteger(km) ? km.toFixed(0) : km.toFixed(1)} km`;
  }
  return `${Math.round(distanceM)} m`;
}

function measureScale(viewer: Viewer): Pick<MapInstrumentState, 'scaleLabel' | 'scaleWidthPx'> {
  const canvas = viewer.scene.canvas;
  const sampleWidthPx = Math.min(120, Math.max(60, canvas.clientWidth * 0.12));
  const centerX = canvas.clientWidth / 2;
  const y = Math.max(1, canvas.clientHeight - 90);
  const left = pickGlobe(viewer, new Cartesian2(centerX - sampleWidthPx / 2, y));
  const right = pickGlobe(viewer, new Cartesian2(centerX + sampleWidthPx / 2, y));
  if (!left || !right) return { scaleLabel: null, scaleWidthPx: null };

  const measuredDistanceM = Cartesian3.distance(left, right);
  const metersPerPixel = measuredDistanceM / sampleWidthPx;
  const scaleDistanceM = selectScaleBarMeters(metersPerPixel * 100);
  if (!scaleDistanceM || !Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
    return { scaleLabel: null, scaleWidthPx: null };
  }

  return {
    scaleLabel: formatScale(scaleDistanceM),
    scaleWidthPx: Math.max(32, Math.min(120, scaleDistanceM / metersPerPixel)),
  };
}

export function CesiumStage({
  data,
  snapshot,
  fleetIds,
  backgroundIds,
  backgroundTraffic,
  onVehicleSelect,
}: CesiumStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const dataSourceRef = useRef<CustomDataSource | null>(null);
  const adapterRef = useRef<OperationalMapAdapter | null>(null);
  const backgroundSinkRef = useRef<VehicleEntitySink | null>(null);
  const staticTerritoryReadyRef = useRef(false);
  const onVehicleSelectRef = useRef(onVehicleSelect);
  const terrainStateRef = useRef<TerrainDisplayState>('ELLIPSOID');
  const [mapAvailable, setMapAvailable] = useState(canUseWebGl);
  const [terrainState, setTerrainState] = useState<TerrainDisplayState>('ELLIPSOID');
  const [instruments, setInstruments] = useState<MapInstrumentState>({
    headingDeg: REGIONAL_VIEW.headingDeg,
    scaleLabel: null,
    scaleWidthPx: null,
    cursorText: null,
  });

  onVehicleSelectRef.current = onVehicleSelect;

  useEffect(() => {
    if (!containerRef.current || !canUseWebGl()) {
      setMapAvailable(false);
      return;
    }

    let viewer: Viewer;
    try {
      viewer = new Viewer(containerRef.current, {
        animation: false,
        baseLayer: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        scene3DOnly: true,
      });
    } catch (error) {
      console.warn('Cesium WebGL initialization failed; continuing with the non-map operational fallback.', error);
      setMapAvailable(false);
      return;
    }

    setMapAvailable(true);
    viewer.scene.requestRenderMode = true;
    viewer.scene.maximumRenderTimeChange = Number.POSITIVE_INFINITY;
    viewer.scene.globe.baseColor = Color.fromCssColorString('#1a252b');
    viewer.scene.backgroundColor = Color.fromCssColorString('#0b1115');
    viewer.scene.globe.showGroundAtmosphere = true;

    const token = normalizeTerrainToken(import.meta.env.VITE_CESIUM_ION_TOKEN);
    void installPreferredTerrain(viewer, token).then((result) => {
      if (viewer.isDestroyed() || result.state === 'ABORTED') return;

      const nextState: TerrainDisplayState = result.state === 'READY'
        ? 'READY'
        : result.state === 'FAILED'
          ? 'FAILED'
          : 'ELLIPSOID';

      if (result.state === 'FAILED') {
        console.warn('Cesium terrain unavailable; continuing with ellipsoid fallback.');
      }

      terrainStateRef.current = nextState;
      setTerrainState(nextState);
      viewer.scene.requestRender();
    });

    viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        maximumLevel: 18,
        credit: new Credit(
          '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors · ODbL</a>',
          true,
        ),
      }),
    );

    const dataSource = new CustomDataSource('san-juan-mining-operations');
    void viewer.dataSources.add(dataSource);
    setRegionalView(viewer);

    const updateCameraInstruments = () => {
      const scale = measureScale(viewer);
      const headingDeg = ((CesiumMath.toDegrees(viewer.camera.heading) % 360) + 360) % 360;
      setInstruments((current) => ({ ...current, headingDeg, ...scale }));
    };

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.position) as { id?: Entity } | undefined;
      const pickedEntity = picked?.id;
      if (!pickedEntity || typeof pickedEntity.id !== 'string' || !pickedEntity.id.startsWith('vehicle:')) return;
      onVehicleSelectRef.current?.(pickedEntity.id.slice('vehicle:'.length));
    }, ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
      const position = pickGlobe(viewer, movement.endPosition);
      if (!position) {
        setInstruments((current) => ({ ...current, cursorText: null }));
        return;
      }

      const cartographic = Cartographic.fromCartesian(position);
      const lon = CesiumMath.toDegrees(cartographic.longitude);
      const lat = CesiumMath.toDegrees(cartographic.latitude);
      const hasTerrain = terrainStateRef.current === 'READY'
        && !(viewer.terrainProvider instanceof EllipsoidTerrainProvider);
      const terrainHeight = hasTerrain ? viewer.scene.globe.getHeight(cartographic) : undefined;
      setInstruments((current) => ({
        ...current,
        cursorText: `${formatCoordinates(lat, lon)} · ELEV ${formatElevation(terrainHeight)}`,
      }));
    }, ScreenSpaceEventType.MOUSE_MOVE);

    viewer.camera.percentageChanged = 0.01;
    viewer.camera.changed.addEventListener(updateCameraInstruments);
    window.addEventListener('resize', updateCameraInstruments);
    updateCameraInstruments();

    viewerRef.current = viewer;
    dataSourceRef.current = dataSource;

    return () => {
      window.removeEventListener('resize', updateCameraInstruments);
      viewer.camera.changed.removeEventListener(updateCameraInstruments);
      handler.destroy();
      adapterRef.current = null;
      backgroundSinkRef.current = null;
      staticTerritoryReadyRef.current = false;
      dataSourceRef.current = null;
      viewerRef.current = null;
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []);

  useEffect(() => {
    const dataSource = dataSourceRef.current;
    const viewer = viewerRef.current;
    if (!dataSource || !viewer || !data) return;

    if (!staticTerritoryReadyRef.current) {
      addStaticTerritory(dataSource, data);
      staticTerritoryReadyRef.current = true;
    }

    if (!adapterRef.current && fleetIds.length > 0) {
      adapterRef.current = createOperationalAdapter(createVehicleSink(dataSource), fleetIds);
    }

    if (!backgroundSinkRef.current && backgroundIds.length > 0) {
      backgroundSinkRef.current = createBackgroundTrafficSink(dataSource);
    }
    if (backgroundSinkRef.current) backgroundIds.forEach((id) => backgroundSinkRef.current!.ensure(id));

    viewer.scene.requestRender();
  }, [data, fleetIds, backgroundIds]);

  useEffect(() => {
    const adapter = adapterRef.current;
    const viewer = viewerRef.current;
    if (!adapter || !viewer) return;
    adapter.apply(snapshot);
    viewer.scene.requestRender();
  }, [snapshot]);

  useEffect(() => {
    const sink = backgroundSinkRef.current;
    const viewer = viewerRef.current;
    if (!sink || !viewer || !data) return;

    const known = new Set(backgroundIds);
    backgroundIds.forEach((id) => sink.setVisible(id, false));

    for (const vehicle of backgroundTraffic) {
      if (!known.has(vehicle.id)) throw new Error(`Unknown background traffic entity id: ${vehicle.id}`);
      const point = resolveBackgroundTrafficPoint(vehicle, data.corridors);
      sink.setPosition(vehicle.id, point.lon, point.lat, point.elevationM);
      sink.setVisible(vehicle.id, true);
    }

    viewer.scene.requestRender();
  }, [backgroundTraffic, backgroundIds, data]);

  return (
    <section className="map-stage" role="region" aria-label="3D operational map">
      <div ref={containerRef} className="cesium-host" aria-hidden="true" />
      {!mapAvailable && <div className="map-fallback">3D MAP · WEBGL PREVIEW UNAVAILABLE</div>}

      <MapInstrumentation
        headingDeg={instruments.headingDeg}
        scaleLabel={instruments.scaleLabel}
        scaleWidthPx={instruments.scaleWidthPx}
        cursorText={instruments.cursorText}
        webGlAvailable={mapAvailable}
        terrainState={terrainState}
        onRegionalView={() => {
          const viewer = viewerRef.current;
          if (viewer) setRegionalView(viewer);
        }}
      />
    </section>
  );
}