import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Plus, Minus, Layers } from 'lucide-react';

interface InteractiveDeliveryMapProps {
  lat: number;
  lng: number;
  onChangeCoords: (lat: number, lng: number) => void;
}

const TILE_SIZE = 256;
const WGS84_E = 0.0818191908426;

function latLngToWorldPixels(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const phi = (clampedLat * Math.PI) / 180;
  const sinPhi = Math.sin(phi);

  const xNorm = (lng + 180) / 360;
  const esin = WGS84_E * sinPhi;
  const mercY = Math.log(
    Math.tan(Math.PI / 4 + phi / 2) * Math.pow((1 - esin) / (1 + esin), WGS84_E / 2)
  );
  const yNorm = 0.5 - mercY / (2 * Math.PI);

  return {
    x: xNorm * scale,
    y: yNorm * scale,
  };
}

function worldPixelsToLatLng(worldX: number, worldY: number, zoom: number): { lat: number; lng: number } {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const xNorm = worldX / scale;
  const yNorm = Math.max(0.01, Math.min(0.99, worldY / scale));

  const lng = xNorm * 360 - 180;
  const mercY = (0.5 - yNorm) * 2 * Math.PI;

  let phi = 2 * Math.atan(Math.exp(mercY)) - Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const esin = WGS84_E * Math.sin(phi);
    phi =
      2 *
        Math.atan(
          Math.exp(mercY) * Math.pow((1 + esin) / (1 - esin), WGS84_E / 2)
        ) -
      Math.PI / 2;
  }

  const lat = (phi * 180) / Math.PI;
  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
  };
}

export const InteractiveDeliveryMap: React.FC<InteractiveDeliveryMapProps> = ({
  lat,
  lng,
  onChangeCoords,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<number>(15);
  const [layer, setLayer] = useState<'map' | 'sat'>('map');
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 640,
    height: 320,
  });

  const [viewCenter, setViewCenter] = useState<{ lat: number; lng: number }>({ lat, lng });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startWorldX: number;
    startWorldY: number;
    moved: boolean;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    startWorldX: 0,
    startWorldY: 0,
    moved: false,
  });

  useEffect(() => {
    if (!dragStateRef.current.active) {
      setViewCenter({ lat, lng });
    }
  }, [lat, lng]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handlePointerStart = useCallback(
    (clientX: number, clientY: number) => {
      const world = latLngToWorldPixels(viewCenter.lat, viewCenter.lng, zoom);
      dragStateRef.current = {
        active: true,
        startX: clientX,
        startY: clientY,
        startWorldX: world.x,
        startWorldY: world.y,
        moved: false,
      };
      setIsDragging(true);
    },
    [viewCenter.lat, viewCenter.lng, zoom]
  );

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!dragStateRef.current.active) return;
      const dx = clientX - dragStateRef.current.startX;
      const dy = clientY - dragStateRef.current.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        dragStateRef.current.moved = true;
      }
      const nextWorldX = dragStateRef.current.startWorldX - dx;
      const nextWorldY = dragStateRef.current.startWorldY - dy;
      const nextCoords = worldPixelsToLatLng(nextWorldX, nextWorldY, zoom);
      setViewCenter(nextCoords);
    },
    [zoom]
  );

  const handlePointerEnd = useCallback(
    (clientX?: number, clientY?: number) => {
      if (!dragStateRef.current.active) return;
      const wasMoved = dragStateRef.current.moved;
      dragStateRef.current.active = false;
      setIsDragging(false);

      if (!wasMoved && typeof clientX === 'number' && typeof clientY === 'number' && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const clickOffsetX = clientX - rect.left - rect.width / 2;
        const clickOffsetY = clientY - rect.top - rect.height / 2;
        if (Math.abs(clickOffsetX) > 2 || Math.abs(clickOffsetY) > 2) {
          const currentWorld = latLngToWorldPixels(viewCenter.lat, viewCenter.lng, zoom);
          const clickedCoords = worldPixelsToLatLng(
            currentWorld.x + clickOffsetX,
            currentWorld.y + clickOffsetY,
            zoom
          );
          setViewCenter(clickedCoords);
          onChangeCoords(clickedCoords.lat, clickedCoords.lng);
          return;
        }
      }

      onChangeCoords(viewCenter.lat, viewCenter.lng);
    },
    [viewCenter.lat, viewCenter.lng, zoom, onChangeCoords]
  );

  useEffect(() => {
    const onWinMouseMove = (e: MouseEvent) => {
      if (dragStateRef.current.active) {
        handlePointerMove(e.clientX, e.clientY);
      }
    };
    const onWinMouseUp = (e: MouseEvent) => {
      if (dragStateRef.current.active) {
        handlePointerEnd(e.clientX, e.clientY);
      }
    };
    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWinMouseMove);
      window.removeEventListener('mouseup', onWinMouseUp);
    };
  }, [handlePointerMove, handlePointerEnd]);

  const centerWorld = latLngToWorldPixels(viewCenter.lat, viewCenter.lng, zoom);
  const halfW = containerSize.width / 2;
  const halfH = containerSize.height / 2;

  const minTileX = Math.floor((centerWorld.x - halfW) / TILE_SIZE) - 1;
  const maxTileX = Math.floor((centerWorld.x + halfW) / TILE_SIZE) + 1;
  const minTileY = Math.floor((centerWorld.y - halfH) / TILE_SIZE) - 1;
  const maxTileY = Math.floor((centerWorld.y + halfH) / TILE_SIZE) + 1;
  const maxTileIndex = Math.pow(2, zoom);

  const tiles: Array<{ key: string; url: string; left: number; top: number }> = [];
  for (let tx = minTileX; tx <= maxTileX; tx++) {
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      if (ty < 0 || ty >= maxTileIndex) continue;
      const wrappedX = ((tx % maxTileIndex) + maxTileIndex) % maxTileIndex;
      const left = Math.round(tx * TILE_SIZE - centerWorld.x + halfW);
      const top = Math.round(ty * TILE_SIZE - centerWorld.y + halfH);

      const url =
        layer === 'map'
          ? `https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x=${wrappedX}&y=${ty}&z=${zoom}&scale=2&lang=uz_UZ`
          : `https://sat02.maps.yandex.net/tiles?l=sat&x=${wrappedX}&y=${ty}&z=${zoom}&lang=uz_UZ`;

      tiles.push({
        key: `${layer}-${zoom}-${tx}-${ty}`,
        url,
        left,
        top,
      });
    }
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        handlePointerStart(e.clientX, e.clientY);
      }}
      onTouchStart={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (e.touches.length === 1) {
          handlePointerStart(e.touches[0].clientX, e.touches[0].clientY);
        }
      }}
      onTouchMove={(e) => {
        if (dragStateRef.current.active && e.touches.length === 1) {
          handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
        }
      }}
      onTouchEnd={(e) => {
        if (dragStateRef.current.active) {
          const touch = e.changedTouches[0];
          handlePointerEnd(touch ? touch.clientX : undefined, touch ? touch.clientY : undefined);
        }
      }}
      onWheel={(e) => {
        e.preventDefault();
        setZoom((prev) => Math.max(7, Math.min(18, prev + (e.deltaY < 0 ? 1 : -1))));
      }}
      className={`relative h-64 sm:h-72 w-full rounded-xl bg-[#EAE6DF] border border-[#51504A] overflow-hidden shadow-inner select-none touch-none ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      {/* Map Tiles Layer */}
      <div className="absolute inset-0 pointer-events-none">
        {tiles.map((t) => (
          <img
            key={t.key}
            src={t.url}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: `${t.left}px`,
              top: `${t.top}px`,
              width: `${TILE_SIZE}px`,
              height: `${TILE_SIZE}px`,
              maxWidth: 'none',
            }}
            className="select-none pointer-events-none"
          />
        ))}
      </div>

      {/* Top-Right: Layer Toggle */}
      <div className="absolute top-3 right-3 z-20">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setLayer((prev) => (prev === 'map' ? 'sat' : 'map'));
          }}
          className="px-3 py-1.5 rounded-xl bg-[#151719]/90 hover:bg-[#151719] text-[#F5F5F2] border border-[#51504A] shadow-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
        >
          <Layers className="w-3.5 h-3.5 text-[#FFB800]" />
          <span>{layer === 'map' ? 'Sxema' : 'Kosmos'}</span>
        </button>
      </div>

      {/* Right-Side: Zoom In / Out Controls */}
      <div className="absolute right-3 bottom-3 z-20 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setZoom((z) => Math.min(18, z + 1));
          }}
          className="w-8 h-8 rounded-xl bg-[#151719]/95 hover:bg-[#151719] text-[#F5F5F2] border border-[#51504A] shadow-lg flex items-center justify-center cursor-pointer transition-all active:scale-95"
          title="Yaqinlashtirish"
        >
          <Plus className="w-4 h-4 text-[#FFB800]" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setZoom((z) => Math.max(7, z - 1));
          }}
          className="w-8 h-8 rounded-xl bg-[#151719]/95 hover:bg-[#151719] text-[#F5F5F2] border border-[#51504A] shadow-lg flex items-center justify-center cursor-pointer transition-all active:scale-95"
          title="Uzoqlashtirish"
        >
          <Minus className="w-4 h-4 text-[#FFB800]" />
        </button>
      </div>

      {/* Center Delivery Pin ("Yetkazish nuqtasi") */}
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full flex flex-col items-center pointer-events-none z-10 transition-transform duration-150 ${
          isDragging ? '-mt-2 scale-110' : 'mt-0 scale-100'
        }`}
      >
        <div className="px-2.5 py-1 rounded-lg bg-[#151719]/95 text-[#FFB800] border border-[#FFB800] font-bold text-[11px] shadow-xl whitespace-nowrap mb-0.5 font-mono">
          Yetkazish nuqtasi
        </div>
        <MapPin className="w-9 h-9 text-red-500 drop-shadow-[0_4px_10px_rgba(0,0,0,0.85)] fill-red-500" />
        <div className="w-2.5 h-1.5 rounded-full bg-black/50 blur-[1px] -mt-1" />
      </div>
    </div>
  );
};
