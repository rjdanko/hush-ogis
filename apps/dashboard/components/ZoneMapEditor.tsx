// apps/dashboard/components/ZoneMapEditor.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { closeRing, validatePolygonRing, type Point } from "../lib/geo";
import type { GeoJsonPolygon } from "@hush/shared-types";

interface ZoneMapEditorProps {
  initialPolygon?: GeoJsonPolygon;
  onChange: (polygon: GeoJsonPolygon | null, error: string | null) => void;
}

export function ZoneMapEditor({ initialPolygon, onChange }: ZoneMapEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: initialPolygon?.coordinates[0]?.[0] ?? [121.05, 14.55],
      zoom: 16,
    });
    mapRef.current = map;

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
    });
    map.addControl(draw);

    function handleDrawChange() {
      const features = draw.getAll().features;
      const feature = features[0];
      if (!feature || feature.geometry.type !== "Polygon") {
        onChange(null, null);
        return;
      }
      const ring = closeRing(feature.geometry.coordinates[0] as Point[]);
      const result = validatePolygonRing(ring);
      if (!result.ok) {
        onChange(null, result.reason);
        return;
      }
      onChange({ type: "Polygon", coordinates: [ring] }, null);
    }

    map.on("draw.create", handleDrawChange);
    map.on("draw.update", handleDrawChange);
    map.on("draw.delete", handleDrawChange);

    if (initialPolygon) {
      map.on("load", () => {
        draw.add({ type: "Feature", properties: {}, geometry: initialPolygon });
      });
    }

    return () => {
      map.remove();
    };
    // Deliberately mount-once: re-running this on every render would tear
    // down and recreate the whole WebGL map on every keystroke elsewhere in
    // the form. Two implicit contracts this depends on, for whoever wires up
    // a caller: (1) `onChange` must stay referentially side-effect-free (only
    // call stable setters, never close over per-render values) since the
    // captured reference from first mount is what fires for the component's
    // entire lifetime; (2) to load a different `initialPolygon` (e.g. editing
    // a different zone), remount this component (e.g. `key={zone.id}`) rather
    // than relying on a prop change -- it is never re-synced after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "400px" }} />;
}
