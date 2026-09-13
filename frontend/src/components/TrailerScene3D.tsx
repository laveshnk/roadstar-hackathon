"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Environment } from "@react-three/drei";
import * as THREE from "three";

const TRAILER_LENGTH = 53;
const TRAILER_HEIGHT = 8.5;
const TRAILER_WIDTH = 8.17;
const CAB_LENGTH = 10;
const CAB_HEIGHT = 9;
const CAB_WIDTH = 8.5;
const PALLET_L = 4;
const PALLET_W = 3.33;
const PALLET_BASE_H = 0.5;
const TRAILER_FRONT = TRAILER_LENGTH / 2;
const TRAILER_REAR = -TRAILER_LENGTH / 2;
const CAB_X = TRAILER_FRONT + CAB_LENGTH / 2;

export type TrailerType = "dry_van" | "reefer" | "heated_van";

function Wheel({ position, radius = 1.5 }: { position: [number, number, number]; radius?: number }) {
  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[radius, radius, 0.6, 20]} />
      <meshStandardMaterial color="#1e293b" roughness={0.8} metalness={0.2} />
    </mesh>
  );
}

/** Dual tandem axle group — two wheels side-by-side at the rear. */
function DualTandem({ x, side }: { x: number; side: 1 | -1 }) {
  return (
    <group>
      <Wheel position={[x - 1.8, -0.5, side * (TRAILER_WIDTH / 2 + 0.3)]} />
      <Wheel position={[x, -0.5, side * (TRAILER_WIDTH / 2 + 0.3)]} />
      <Wheel position={[x - 1.8, -0.5, side * (TRAILER_WIDTH / 2 + 1.1)]} />
      <Wheel position={[x, -0.5, side * (TRAILER_WIDTH / 2 + 1.1)]} />
    </group>
  );
}

/**
 * Tractor cab — clean styling with windshield glass, steer axle at the
 * front, landing gear, and chrome exhaust stacks.
 */
function TractorCab({ trailerType }: { trailerType: TrailerType }) {
  const cabColor = trailerType === "reefer" ? "#dc2626" : trailerType === "heated_van" ? "#0891b2" : "#1e40af";
  const cabMat = useMemo(() => new THREE.MeshStandardMaterial({ color: cabColor, roughness: 0.35, metalness: 0.4 }), [cabColor]);
  const glassMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#7dd3fc", transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.9 }), []);
  const chromeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.15, metalness: 0.95 }), []);
  const darkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.6, metalness: 0.3 }), []);

  // Steer axle at x = -6.5 (front of cab), dual tandem at rear (x = +4.5 to +5.5).
  const STEER_X = -CAB_LENGTH / 2 + 1.5;
  const DRIVE_X = CAB_LENGTH / 2 - 2.5;

  return (
    <group position={[CAB_X, 0, 0]}>
      {/* Main cab body — sloped hood + sleeper */}
      <mesh position={[0, CAB_HEIGHT / 2, 0]} castShadow material={cabMat}>
        <boxGeometry args={[CAB_LENGTH, CAB_HEIGHT, CAB_WIDTH]} />
      </mesh>
      {/* Hood slope (aerodynamic front) */}
      <mesh position={[-CAB_LENGTH / 2 + 1, CAB_HEIGHT * 0.35, 0]} rotation={[0, 0, 0.35]} material={cabMat}>
        <boxGeometry args={[3, CAB_HEIGHT * 0.7, CAB_WIDTH - 0.5]} />
      </mesh>
      {/* Windshield glass (front, angled) */}
      <mesh position={[-CAB_LENGTH / 2 + 0.5, CAB_HEIGHT * 0.75, 0]} rotation={[0, 0, -0.35]} material={glassMat}>
        <boxGeometry args={[0.12, 2.8, CAB_WIDTH - 1.5]} />
      </mesh>
      {/* Side windows */}
      <mesh position={[-1, CAB_HEIGHT * 0.7, CAB_WIDTH / 2 + 0.01]} material={glassMat}>
        <boxGeometry args={[3.5, 1.8, 0.05]} />
      </mesh>
      <mesh position={[-1, CAB_HEIGHT * 0.7, -CAB_WIDTH / 2 - 0.01]} material={glassMat}>
        <boxGeometry args={[3.5, 1.8, 0.05]} />
      </mesh>
      {/* Grille / front bumper */}
      <mesh position={[-CAB_LENGTH / 2 - 0.1, 1.5, 0]} material={darkMat}>
        <boxGeometry args={[0.3, 2, CAB_WIDTH]} />
      </mesh>
      {/* Chrome exhaust stacks */}
      <mesh position={[-CAB_LENGTH / 4, CAB_HEIGHT + 0.3, CAB_WIDTH / 2 + 0.15]} material={chromeMat}>
        <cylinderGeometry args={[0.18, 0.18, 4, 12]} />
      </mesh>
      <mesh position={[-CAB_LENGTH / 4, CAB_HEIGHT + 0.3, -CAB_WIDTH / 2 - 0.15]} material={chromeMat}>
        <cylinderGeometry args={[0.18, 0.18, 4, 12]} />
      </mesh>
      {/* Side mirrors */}
      <mesh position={[-CAB_LENGTH / 2 + 0.8, CAB_HEIGHT * 0.7, CAB_WIDTH / 2 + 0.4]} material={chromeMat}>
        <boxGeometry args={[0.08, 0.8, 0.4]} />
      </mesh>
      <mesh position={[-CAB_LENGTH / 2 + 0.8, CAB_HEIGHT * 0.7, -CAB_WIDTH / 2 - 0.4]} material={chromeMat}>
        <boxGeometry args={[0.08, 0.8, 0.4]} />
      </mesh>
      {/* Steer axle (front, single wheels each side) */}
      <Wheel position={[STEER_X, -0.5, TRAILER_WIDTH / 2 + 0.4]} radius={1.3} />
      <Wheel position={[STEER_X, -0.5, -(TRAILER_WIDTH / 2 + 0.4)]} radius={1.3} />
      {/* Drive axle (rear of cab, dual wheels each side) */}
      <DualTandem x={DRIVE_X} side={1} />
      <DualTandem x={DRIVE_X} side={-1} />
      {/* Fuel tank (cylindrical, side-mounted) */}
      <mesh position={[1, 1.5, CAB_WIDTH / 2 + 0.2]} material={chromeMat}>
        <cylinderGeometry args={[0.6, 0.6, 3, 12]} />
      </mesh>
      <mesh position={[1, 1.5, -CAB_WIDTH / 2 - 0.2]} material={chromeMat}>
        <cylinderGeometry args={[0.6, 0.6, 3, 12]} />
      </mesh>
    </group>
  );
}

function TrailerBox({ trailerType }: { trailerType: TrailerType }) {
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e2e8f0", transparent: true, opacity: 0.12, side: THREE.DoubleSide, roughness: 0.3 }), []);
  const panelColor = trailerType === "heated_van" ? "#cbd5e1" : "#f1f5f9";
  const panelMat = useMemo(() => new THREE.MeshStandardMaterial({ color: panelColor, roughness: 0.4, metalness: 0.2 }), [panelColor]);
  const ribMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.5 }), []);
  const steelMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#64748b", roughness: 0.3, metalness: 0.6 }), []);
  const ledMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#22c55e", emissive: "#22c55e", emissiveIntensity: 0.8 }), []);

  return (
    <group>
      <mesh position={[0, 0, 0]} receiveShadow material={panelMat}><boxGeometry args={[TRAILER_LENGTH, 0.2, TRAILER_WIDTH]} /></mesh>
      <mesh position={[TRAILER_REAR, TRAILER_HEIGHT / 2, 0]} material={panelMat}><boxGeometry args={[0.15, TRAILER_HEIGHT, TRAILER_WIDTH]} /></mesh>
      <mesh position={[TRAILER_FRONT, TRAILER_HEIGHT / 2, 0]} material={panelMat}><boxGeometry args={[0.15, TRAILER_HEIGHT, TRAILER_WIDTH]} /></mesh>
      <mesh position={[0, TRAILER_HEIGHT, 0]} material={panelMat}><boxGeometry args={[TRAILER_LENGTH, 0.15, TRAILER_WIDTH]} /></mesh>
      <mesh position={[0, TRAILER_HEIGHT / 2, TRAILER_WIDTH / 2]} material={wallMat}><boxGeometry args={[TRAILER_LENGTH, TRAILER_HEIGHT, 0.05]} /></mesh>
      {Array.from({ length: 14 }).map((_, i) => (
        <mesh key={i} position={[TRAILER_REAR + 1.5 + i * 3.7, TRAILER_HEIGHT / 2, TRAILER_WIDTH / 2 + 0.03]} material={ribMat}><boxGeometry args={[0.06, TRAILER_HEIGHT - 0.3, 0.06]} /></mesh>
      ))}
      <mesh position={[0, 0.1, TRAILER_WIDTH / 2]} material={ribMat}><boxGeometry args={[TRAILER_LENGTH, 0.15, 0.1]} /></mesh>
      <mesh position={[0, TRAILER_HEIGHT - 0.08, TRAILER_WIDTH / 2]} material={ribMat}><boxGeometry args={[TRAILER_LENGTH, 0.15, 0.1]} /></mesh>
      {/* Landing gear near trailer front */}
      <mesh position={[TRAILER_FRONT - 3, -1.5, 0]} material={steelMat}><boxGeometry args={[0.3, 3, 0.3]} /></mesh>
      <mesh position={[TRAILER_FRONT - 3, -2.8, 0]} material={steelMat}><boxGeometry args={[0.5, 0.3, 0.5]} /></mesh>
      {/* Reefer: nose-mounted Thermo King unit with LED status display */}
      {trailerType === "reefer" && (
        <group position={[TRAILER_FRONT, TRAILER_HEIGHT - 1.5, 0]}>
          <mesh material={steelMat}><boxGeometry args={[1.2, 3, TRAILER_WIDTH - 1]} /></mesh>
          <mesh position={[0.7, 0.5, 0]} material={ledMat}><boxGeometry args={[0.1, 0.4, 1.5]} /></mesh>
          <mesh position={[0.7, -0.3, 0]}><boxGeometry args={[0.05, 0.2, 1]} /><meshStandardMaterial color="#1e293b" /></mesh>
        </group>
      )}
      {/* Heated Van: winter logistics tag */}
      {trailerType === "heated_van" && (
        <mesh position={[TRAILER_FRONT - 1, TRAILER_HEIGHT - 0.5, TRAILER_WIDTH / 2 + 0.1]}>
          <boxGeometry args={[2, 0.6, 0.05]} />
          <meshStandardMaterial color="#0891b2" emissive="#0891b2" emissiveIntensity={0.3} />
        </mesh>
      )}
      {/* Trailer tandem wheels at the rear */}
      <DualTandem x={TRAILER_REAR + 5} side={1} />
      <DualTandem x={TRAILER_REAR + 5} side={-1} />
      <mesh position={[TRAILER_REAR - 0.1, 1, 0]} material={steelMat}><boxGeometry args={[0.2, 4, TRAILER_WIDTH]} /></mesh>
    </group>
  );
}

type PalletKind = "GMA" | "HIGH_CUBE" | "DOUBLE_STACK" | "REEFER_BLUE";

function PalletMesh({ position, kind }: { position: [number, number, number]; kind: PalletKind }) {
  const woodMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#a16207", roughness: 0.8 }), []);
  const plasticMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#0369a1", roughness: 0.3, metalness: 0.1 }), []);
  const isBlue = kind === "REEFER_BLUE";
  const baseMat = isBlue ? plasticMat : woodMat;
  const cartonH = kind === "HIGH_CUBE" ? 6.0 : kind === "DOUBLE_STACK" ? 2.0 : 4.0;
  const cartonColor = isBlue ? "#0ea5e9" : kind === "HIGH_CUBE" ? "#b45309" : "#d97706";
  const topColor = isBlue ? "#7dd3fc" : kind === "HIGH_CUBE" ? "#92400e" : "#fbbf24";

  return (
    <group position={position}>
      <mesh castShadow material={baseMat}><boxGeometry args={[PALLET_L, PALLET_BASE_H, PALLET_W]} /></mesh>
      {[-PALLET_L / 3, 0, PALLET_L / 3].map((x) => (
        <mesh key={x} position={[x, PALLET_BASE_H / 2 + 0.05, 0]} material={baseMat}><boxGeometry args={[PALLET_L * 0.3, 0.1, PALLET_W]} /></mesh>
      ))}
      <mesh position={[0, PALLET_BASE_H + cartonH / 2, 0]} castShadow>
        <boxGeometry args={[PALLET_L * 0.9, cartonH, PALLET_W * 0.9]} />
        <meshStandardMaterial color={cartonColor} transparent opacity={0.85} roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={[0, PALLET_BASE_H + cartonH + 0.02, 0]}>
        <boxGeometry args={[PALLET_L * 0.9, 0.08, PALLET_W * 0.9]} />
        <meshStandardMaterial color={topColor} />
      </mesh>
      {kind === "DOUBLE_STACK" && (
        <mesh position={[0, PALLET_BASE_H + cartonH + 0.1, 0]} castShadow>
          <boxGeometry args={[PALLET_L * 0.85, 2.0, PALLET_W * 0.85]} />
          <meshStandardMaterial color={cartonColor} transparent opacity={0.85} roughness={0.5} />
        </mesh>
      )}
      {isBlue && (
        <mesh position={[0, PALLET_BASE_H + cartonH / 2, 0]}>
          <boxGeometry args={[PALLET_L * 0.95, cartonH + 0.2, PALLET_W * 0.95]} />
          <meshStandardMaterial color="#38bdf8" transparent opacity={0.12} roughness={0.1} metalness={0.5} />
        </mesh>
      )}
    </group>
  );
}

function TrailerScene({ pallets, trailerType, truckStatus }: { pallets: number; trailerType: TrailerType; truckStatus?: "IN_TRANSIT" | "DOCKED_WAITING" | "OFF_DUTY" }) {
  const palletPositions = useMemo(() => {
    const positions: { pos: [number, number, number]; kind: PalletKind }[] = [];
    const startX = TRAILER_REAR + 1 + PALLET_L / 2;
    const palletRows = 13;
    const stepX = (TRAILER_LENGTH - 2) / palletRows;
    const colZ = [-TRAILER_WIDTH / 4, TRAILER_WIDTH / 4];
    const kinds: PalletKind[] = ["GMA", "HIGH_CUBE", "DOUBLE_STACK", "REEFER_BLUE"];
    for (let row = 0; row < palletRows; row++) {
      for (let col = 0; col < 2; col++) {
        const idx = row * 2 + col;
        if (idx >= pallets) break;
        const kind: PalletKind = trailerType === "reefer" && idx % 3 === 0
          ? "REEFER_BLUE" : kinds[idx % kinds.length];
        positions.push({ pos: [startX + row * stepX, 0.1 + PALLET_BASE_H / 2, colZ[col]], kind });
      }
    }
    return positions;
  }, [pallets, trailerType]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[15, 20, 15]} intensity={0.9} castShadow />
      <directionalLight position={[-10, 15, -10]} intensity={0.3} />
      <TractorCab trailerType={trailerType} />
      <TrailerBox trailerType={trailerType} />
      {palletPositions.map((p, i) => (
        <PalletMesh key={i} position={p.pos} kind={p.kind} />
      ))}
      {/* Status indicator: colored ring under the trailer */}
      {truckStatus && (
        <mesh position={[0, -1.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[6, 7, 32]} />
          <meshStandardMaterial
            color={truckStatus === "IN_TRANSIT" ? "#10b981" : truckStatus === "DOCKED_WAITING" ? "#f59e0b" : "#64748b"}
            transparent
            opacity={0.4}
            emissive={truckStatus === "IN_TRANSIT" ? "#10b981" : truckStatus === "DOCKED_WAITING" ? "#f59e0b" : "#64748b"}
            emissiveIntensity={0.3}
          />
        </mesh>
      )}
      {/* Loading dock bay: amber floor markers when docked */}
      {truckStatus === "DOCKED_WAITING" && (
        <mesh position={[TRAILER_REAR - 1, -1.85, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4, TRAILER_WIDTH]} />
          <meshStandardMaterial color="#fbbf24" transparent opacity={0.15} />
        </mesh>
      )}
      <Grid args={[100, 40]} position={[0, -2, 0]} cellSize={2} cellThickness={0.5} cellColor="#cbd5e1" sectionSize={10} sectionThickness={1} sectionColor="#94a3b8" fadeDistance={60} fadeStrength={1} infiniteGrid={false} />
      <Environment preset="warehouse" />
      <OrbitControls enablePan={false} minDistance={12} maxDistance={80} maxPolarAngle={Math.PI / 2.1} target={[0, 3, 0]} />
    </>
  );
}

export default function TrailerScene3D({ pallets, isReefer, truckStatus }: { pallets: number; isReefer: boolean; truckStatus?: "IN_TRANSIT" | "DOCKED_WAITING" | "OFF_DUTY" }) {
  const trailerType: TrailerType = isReefer ? "reefer" : "dry_van";
  // When docked, show fewer pallets (loading in progress). When off-duty,
  // show empty trailer. When in-transit, show full load.
  const effectivePallets = truckStatus === "OFF_DUTY" ? 0 : truckStatus === "DOCKED_WAITING" ? Math.floor(pallets / 2) : pallets;
  return (
    <Canvas shadows camera={{ position: [30, 18, 25], fov: 42 }} dpr={[1, 2]} style={{ width: "100%", height: "100%" }}>
      <color attach="background" args={["#f1f5f9"]} />
      <TrailerScene pallets={effectivePallets} trailerType={trailerType} truckStatus={truckStatus} />
    </Canvas>
  );
}


