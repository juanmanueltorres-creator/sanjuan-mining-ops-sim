import { useEffect, useRef } from 'react';
import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  CustomDataSource,
  Entity,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  Viewer,
} from 'cesium';
import type { OperationalSnapshot } from '../domain/contracts';
import type { StaticOperationData } from '../data/loadOperation';
import { createOperationalAdapter, type OperationalMapAdapter, type VehicleEntitySink } from './cesiumAdapter';

export interface CesiumStageProps {
  data: StaticOperationData | null;
  snapshot: OperationalSnapshot;
  fleetIds: string[];
  onVehicleSelect?: (vehicleId: string) => void;
}

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
        },
      });
    },
    setPosition(vehicleId, lon, lat, elevationM) {
      const entity = requireEntity(vehicleId);
      const next = Cartesian3.fromDegrees(lon, lat, Math.max(0, elevationM + 8));
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
      position: Cartesian3.fromDegrees(project.lon, project.lat, active ? 80 : 20),
      point: {
        pixelSize: active ? 9 : 5,
        color: active ? Color.fromCssColorString('#fbbf24') : Color.fromCssColorString('#89939b'),
        outlineColor: Color.fromCssColorString('#11181d'),
        outlineWidth: 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
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
          }
        : undefined,
    });
  }

  const corridorColors = ['#70c8d7', '#e3aa54', '#97b99a'];
  data.corridors.forEach((corridor, index) => {
    const positions = corridor.routeSamples.map((sample) =>
      Cartesian3.fromDegrees(sample.lon, sample.lat, Math.max(0, sample.elevationM + 3)),
    );
    if (positions.length < 2) return;

    dataSource.entities.add({
      id: `corridor:${corridor.id}`,
      name: corridor.name,
      polyline: {
        positions,
        width: 3,
        material: Color.fromCssColorString(corridorColors[index % corridorColors.length]).withAlpha(0.9),
      },
    });
  });
}

export function CesiumStage({ data, snapshot, fleetIds, onVehicleSelect }: CesiumStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const dataSourceRef = useRef<CustomDataSource | null>(null);
  const adapterRef = useRef<OperationalMapAdapter | null>(null);
  const staticTerritoryReadyRef = useRef(false);
  const onVehicleSelectRef = useRef(onVehicleSelect);

  onVehicleSelectRef.current = onVehicleSelect;

  useEffect(() => {
    if (!containerRef.current || !canUseWebGl()) return;

    const viewer = new Viewer(containerRef.current, {
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

    viewer.scene.requestRenderMode = true;
    viewer.scene.maximumRenderTimeChange = Number.POSITIVE_INFINITY;
    viewer.scene.globe.baseColor = Color.fromCssColorString('#1a252b');
    viewer.scene.backgroundColor = Color.fromCssColorString('#0b1115');
    viewer.scene.globe.showGroundAtmosphere = true;

    viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        maximumLevel: 18,
        credit: '© OpenStreetMap contributors',
      }),
    );

    const dataSource = new CustomDataSource('san-juan-mining-operations');
    void viewer.dataSources.add(dataSource);

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(-69.25, -30.65, 760_000),
      orientation: {
        heading: CesiumMath.toRadians(2),
        pitch: CesiumMath.toRadians(-53),
        roll: 0,
      },
    });

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.position) as { id?: Entity } | undefined;
      const pickedEntity = picked?.id;
      if (!pickedEntity || typeof pickedEntity.id !== 'string' || !pickedEntity.id.startsWith('vehicle:')) return;
      onVehicleSelectRef.current?.(pickedEntity.id.slice('vehicle:'.length));
    }, ScreenSpaceEventType.LEFT_CLICK);

    viewerRef.current = viewer;
    dataSourceRef.current = dataSource;

    return () => {
      handler.destroy();
      adapterRef.current = null;
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

    viewer.scene.requestRender();
  }, [data, fleetIds]);

  useEffect(() => {
    const adapter = adapterRef.current;
    const viewer = viewerRef.current;
    if (!adapter || !viewer) return;
    adapter.apply(snapshot);
    viewer.scene.requestRender();
  }, [snapshot]);

  return (
    <section className="map-stage" role="region" aria-label="3D operational map">
      <div ref={containerRef} className="cesium-host" aria-hidden="true" />
      {!canUseWebGl() && <div className="map-fallback">3D MAP · WEBGL PREVIEW UNAVAILABLE</div>}
    </section>
  );
}
