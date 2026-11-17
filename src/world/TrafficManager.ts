import {
  Color3,
  MeshBuilder,
  PBRMaterial,
  TransformNode,
  Vector3,
  type AbstractMesh,
  type Scene,
} from '@babylonjs/core';

interface TrafficPlacement {
  readonly x: number;
  readonly z: number;
  readonly facingCamera: boolean;
  readonly paintColor: Color3;
}

/**
 * Pobla Paseo de la Reforma con vehículos de tráfico nocturno estilizados
 * (evitando cubos planos) situados fuera del carril de arranque del jugador.
 */
export class TrafficManager {
  private readonly scene: Scene;
  private readonly reflectables: AbstractMesh[] = [];
  private readonly shadowCasters: AbstractMesh[] = [];
  private readonly glowMeshes: AbstractMesh[] = [];

  public constructor(scene: Scene) {
    this.scene = scene;
    this.populateTraffic();
  }

  public getReflectableMeshes(): readonly AbstractMesh[] {
    return this.reflectables;
  }

  public getShadowCasters(): readonly AbstractMesh[] {
    return this.shadowCasters;
  }

  public getGlowMeshes(): readonly AbstractMesh[] {
    return this.glowMeshes;
  }

  private populateTraffic(): void {
    const placements: readonly TrafficPlacement[] = [
      // Carriles izquierdos mirando hacia el sur
      { x: -13.5, z: 24, facingCamera: true, paintColor: new Color3(0.08, 0.1, 0.14) },
      { x: -12.8, z: 108, facingCamera: true, paintColor: new Color3(0.14, 0.16, 0.2) },
      // Carriles derechos mirando hacia el norte (hacia el Ángel)
      { x: 6.5, z: 22, facingCamera: false, paintColor: new Color3(0.12, 0.14, 0.18) },
      { x: 12.5, z: 42, facingCamera: false, paintColor: new Color3(0.84, 0.16, 0.45) }, // Taxi CDMX Rosa/Blanco
      { x: 8.5, z: 112, facingCamera: false, paintColor: new Color3(0.16, 0.18, 0.22) },
    ];

    const glassMat = new PBRMaterial('traffic-glass-pbr', this.scene);
    glassMat.albedoColor = new Color3(0.02, 0.03, 0.06);
    glassMat.metallic = 0.3;
    glassMat.roughness = 0.06;

    const tireMat = new PBRMaterial('traffic-tire-pbr', this.scene);
    tireMat.albedoColor = new Color3(0.04, 0.04, 0.05);
    tireMat.roughness = 0.85;

    const headlightMat = new PBRMaterial('traffic-headlight-pbr', this.scene);
    headlightMat.albedoColor = new Color3(1, 1, 1);
    headlightMat.emissiveColor = new Color3(2.4, 2.6, 2.8);

    const taillightMat = new PBRMaterial('traffic-taillight-pbr', this.scene);
    taillightMat.albedoColor = new Color3(1, 0.1, 0.12);
    taillightMat.emissiveColor = new Color3(2.2, 0.14, 0.16);

    const sedanProfile = [
      new Vector3(0, 0.22, -2.15),
      new Vector3(0, 0.78, -2.08),
      new Vector3(0, 0.84, -1.35),
      new Vector3(0, 1.36, -0.78),
      new Vector3(0, 1.38, 0.42),
      new Vector3(0, 0.86, 1.05),
      new Vector3(0, 0.72, 2.02),
      new Vector3(0, 0.24, 2.15),
    ];

    placements.forEach((spec, idx) => {
      const root = new TransformNode(`traffic-car-${idx}`, this.scene);
      root.position.set(spec.x, 0, spec.z);
      root.rotation.y = spec.facingCamera ? Math.PI : 0;

      const bodyMat = new PBRMaterial(`traffic-body-pbr-${idx}`, this.scene);
      bodyMat.albedoColor = spec.paintColor;
      bodyMat.metallic = 0.78;
      bodyMat.roughness = 0.2;
      bodyMat.clearCoat.isEnabled = true;
      bodyMat.clearCoat.intensity = 0.85;

      const leftEdge = sedanProfile.map((p) => new Vector3(-0.88, p.y, p.z));
      const midLeft = sedanProfile.map((p) => new Vector3(-0.62, p.y + (p.y > 1.0 ? 0.04 : 0), p.z));
      const midRight = sedanProfile.map((p) => new Vector3(0.62, p.y + (p.y > 1.0 ? 0.04 : 0), p.z));
      const rightEdge = sedanProfile.map((p) => new Vector3(0.88, p.y, p.z));

      const shell = MeshBuilder.CreateRibbon(
        `traffic-shell-${idx}`,
        { pathArray: [leftEdge, midLeft, midRight, rightEdge], closePath: true },
        this.scene,
      );
      shell.parent = root;
      shell.material = bodyMat;

      const greenhouse = MeshBuilder.CreateBox(
        `traffic-cabin-${idx}`,
        { width: 1.48, height: 0.42, depth: 1.75 },
        this.scene,
      );
      greenhouse.parent = root;
      greenhouse.position.set(0, 1.12, -0.18);
      greenhouse.material = glassMat;

      this.reflectables.push(shell, greenhouse);
      this.shadowCasters.push(shell);

      for (const [wx, wz] of [
        [-0.84, 1.32],
        [0.84, 1.32],
        [-0.84, -1.32],
        [0.84, -1.32],
      ] as const) {
        const wheel = MeshBuilder.CreateCylinder(
          `traffic-wheel-${idx}-${wx}-${wz}`,
          { diameter: 0.64, height: 0.24, tessellation: 14 },
          this.scene,
        );
        wheel.parent = root;
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.32, wz);
        wheel.material = tireMat;
        this.reflectables.push(wheel);
      }

      for (const side of [-0.62, 0.62]) {
        const lamp = MeshBuilder.CreateBox(
          `traffic-lamp-${idx}-${side}`,
          { width: 0.36, height: 0.14, depth: 0.08 },
          this.scene,
        );
        lamp.parent = root;
        if (spec.facingCamera) {
          lamp.position.set(side, 0.56, 2.13);
          lamp.material = headlightMat;
        } else {
          lamp.position.set(side, 0.64, -2.13);
          lamp.material = taillightMat;
        }
        this.reflectables.push(lamp);
        this.glowMeshes.push(lamp);
      }
    });
  }
}
