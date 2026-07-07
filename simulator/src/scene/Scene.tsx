import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { activeModules } from '../core/design'
import { useSim, ViewMode } from '../state/store'
import { Board } from './Board'
import { viewApi } from './viewApi'
import { Wires } from './Wires'

const CAMERA_TARGETS: Record<ViewMode, THREE.Vector3> = {
  '3d': new THREE.Vector3(0, 12.6, 13.4),
  '2d': new THREE.Vector3(0, 18.5, 0.001),
}

function CameraRig({ view }: { view: ViewMode }) {
  const { camera, controls } = useThree()
  const animating = useRef(true)
  const lastView = useRef(view)
  const dragMode = useSim((s) => s.dragMode)

  useEffect(() => {
    if (lastView.current !== view) {
      lastView.current = view
      animating.current = true
    }
    camera.up.set(0, view === '2d' ? 0 : 1, view === '2d' ? -1 : 0)
  }, [view, camera])

  useEffect(() => {
    const orbit = controls as unknown as { mouseButtons?: { LEFT: number }; touches?: { ONE: number } } | null
    if (!orbit?.mouseButtons) return
    const rotate = dragMode === 'orbit' && view === '3d'
    orbit.mouseButtons.LEFT = rotate ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN
    if (orbit.touches) orbit.touches.ONE = rotate ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN
  }, [dragMode, view, controls])

  const zoomGoal = useRef<number | null>(null)

  useEffect(() => {
    viewApi.zoom = (factor) => {
      const orbit = controls as unknown as { target: THREE.Vector3 } | null
      const target = orbit?.target ?? new THREE.Vector3()
      const current = zoomGoal.current ?? camera.position.distanceTo(target)
      zoomGoal.current = Math.min(38, Math.max(2.5, current * factor))
    }
    viewApi.reset = () => {
      const orbit = controls as unknown as { target: THREE.Vector3; update: () => void } | null
      orbit?.target.set(0, 0, 0)
      camera.up.set(0, view === '2d' ? 0 : 1, view === '2d' ? -1 : 0)
      zoomGoal.current = null
      animating.current = true
      orbit?.update()
    }
  }, [camera, controls, view])

  useFrame((_, dt) => {
    if (animating.current) {
      const target = CAMERA_TARGETS[view]
      camera.position.lerp(target, 1 - Math.pow(0.0005, dt))
      camera.lookAt(0, 0, 0)
      if (camera.position.distanceTo(target) < 0.02) animating.current = false
      return
    }
    if (zoomGoal.current !== null) {
      const orbit = controls as unknown as { target: THREE.Vector3; update: () => void } | null
      const target = orbit?.target ?? new THREE.Vector3()
      const direction = camera.position.clone().sub(target)
      const distance = direction.length()
      const next = THREE.MathUtils.damp(distance, zoomGoal.current, 7, dt)
      camera.position.copy(target.clone().add(direction.multiplyScalar(next / distance)))
      orbit?.update()
      if (Math.abs(next - zoomGoal.current) < 0.02) zoomGoal.current = null
    }
  })
  return null
}

function BusGlow() {
  const snap = useSim((s) => s.snap)
  const active = snap.bus !== 0 && !snap.halted
  return (
    <mesh position={[0, -0.02, -0.1]}>
      <boxGeometry args={[0.06, 0.02, 8.0]} />
      <meshStandardMaterial
        color={active ? '#ffae00' : '#1a1206'}
        emissive="#ffae00"
        emissiveIntensity={active ? 1.6 : 0.05}
        roughness={0.5}
      />
    </mesh>
  )
}

export function Scene() {
  const view = useSim((s) => s.view)
  const designVersion = useSim((s) => s.designVersion)
  const modules = useMemo(() => activeModules(), [designVersion])
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 7.4, 8.6], fov: 40, near: 0.1, far: 60 }}
      gl={{ antialias: true }}
      style={{ position: 'fixed', inset: 0 }}
    >
      <color attach="background" args={['#0b0d10']} />
      <fog attach="fog" args={['#0b0d10', 20, 44]} />
      <ambientLight intensity={0.85} />
      <hemisphereLight args={['#8fa3c4', '#12100c', 0.5]} />
      <directionalLight position={[5, 9, 4]} intensity={1.4} color="#dfe8ff" />
      <directionalLight position={[-6, 5, -4]} intensity={0.45} color="#7f9dff" />

      <mesh position={[0, -0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#0d0f12" roughness={1} />
      </mesh>

      {modules.map((mod) => (
        <Board key={mod.id} module={mod} />
      ))}
      <BusGlow />
      <Wires />

      <CameraRig view={view} />
      <OrbitControls
        makeDefault
        enableRotate={view === '3d'}
        enablePan
        minDistance={2.5}
        maxDistance={38}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 0, 0]}
      />
      <EffectComposer>
        <Bloom mipmapBlur intensity={1.05} luminanceThreshold={1} luminanceSmoothing={0.2} />
      </EffectComposer>
    </Canvas>
  )
}
