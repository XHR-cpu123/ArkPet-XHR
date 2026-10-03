import type { BoneRoleMap } from "../types";

export const FIRST_PET_LEG_WALK = "__preset_first_pet_leg_walk";
export const FIRST_PET_LEG_WALK_LABEL = "腿部基础动作";

type LegSample = {
  t: number;
  l1: [number, number];
  lk: [number, number];
  la: [number, number];
  r1: [number, number];
  rk: [number, number];
  ra: [number, number];
  lf: number;
  rf: number;
};

const samples: LegSample[] = [
  { t: 0, l1: [-0.12309, 0.00941], lk: [-0.19915, 0.89538], la: [-0.60564, 1.0394], r1: [0.10265, -0.02194], rk: [0.32422, 0.93428], ra: [0.27878, 1.06663], lf: 120.2288, rf: 75.3523 },
  { t: 0.2778, l1: [-0.14121, -0.01007], lk: [0.14669, 0.9042], la: [-0.76785, 0.92394], r1: [0.03394, 0.01977], rk: [0.24763, 0.95606], ra: [-0.11336, 1.09512], lf: 129.7288, rf: 95.9097 },
  { t: 0.5556, l1: [-0.16332, -0.03359], lk: [0.40311, 0.78898], la: [-0.30353, 1.12163], r1: [-0.00443, 0.07464], rk: [-0.11869, 0.94783], ra: [-0.34537, 1.00732], lf: 105.1422, rf: 108.925 },
  { t: 0.8333, l1: [-0.18836, -0.04695], lk: [0.28141, 0.87308], la: [0.21196, 1.18422], r1: [0.07646, 0.07089], rk: [-0.22084, 0.96402], ra: [-0.70774, 0.84536], lf: 79.8522, rf: 129.9364 },
  { t: 1.1111, l1: [-0.16878, -0.0351], lk: [0.23162, 0.88626], la: [-0.11307, 1.19602], r1: [0.08406, 0.04199], rk: [-0.05462, 0.9861], ra: [-0.7838, 0.77317], lf: 95.4004, rf: 135.3911 },
  { t: 1.3889, l1: [-0.1366, -0.00944], lk: [-0.12442, 0.87722], la: [-0.37084, 1.10121], r1: [0.0905, 0.01074], rk: [0.36422, 0.88307], ra: [-0.27795, 1.02797], lf: 108.6116, rf: 105.1302 },
  { t: 1.6667, l1: [-0.12309, 0.00941], lk: [-0.19915, 0.89538], la: [-0.60564, 1.0394], r1: [0.10265, -0.02194], rk: [0.34475, 0.9269], ra: [0.15553, 1.09143], lf: 120.2288, rf: 81.8898 },
  { t: 1.9444, l1: [-0.14121, -0.01007], lk: [0.14669, 0.9042], la: [-0.76785, 0.92394], r1: [0.03394, 0.01977], rk: [0.22918, 0.96065], ra: [-0.14921, 1.09081], lf: 129.7288, rf: 97.7892 },
  { t: 2.2222, l1: [-0.16332, -0.03359], lk: [0.33743, 0.81923], la: [-0.2387, 1.13719], r1: [-0.00443, 0.07464], rk: [-0.1305, 0.94628], ra: [-0.34468, 1.00755], lf: 101.8542, rf: 108.8856 },
  { t: 2.5, l1: [-0.18836, -0.04695], lk: [0.28141, 0.87308], la: [0.21196, 1.18422], r1: [0.07646, 0.07089], rk: [-0.22084, 0.96402], ra: [-0.70774, 0.84536], lf: 79.8522, rf: 129.9364 },
  { t: 2.7778, l1: [-0.16878, -0.0351], lk: [0.23162, 0.88626], la: [-0.11307, 1.19602], r1: [0.08406, 0.04199], rk: [-0.05462, 0.9861], ra: [-0.7838, 0.77317], lf: 95.4004, rf: 135.3911 },
  { t: 3.0556, l1: [-0.1366, -0.00944], lk: [-0.12442, 0.87722], la: [-0.37084, 1.10121], r1: [0.0905, 0.01074], rk: [0.46357, 0.83521], ra: [-0.31344, 1.01771], lf: 108.6116, rf: 107.1181 },
  { t: 3.3333, l1: [-0.12309, 0.00941], lk: [-0.19915, 0.89538], la: [-0.60564, 1.0394], r1: [0.10265, -0.02194], rk: [0.32422, 0.93428], ra: [0.27878, 1.06663], lf: 120.2288, rf: 75.3523 }
];

function interpolateSample(time: number): LegSample {
  let right = samples.findIndex((sample) => sample.t >= time);
  if (right <= 0) return samples[0];
  const left = right - 1;
  const from = samples[left];
  const to = samples[right];
  const ratio =
    to.t === from.t ? 0 : (time - from.t) / (to.t - from.t);
  const lerp = (a: number, b: number) => a + (b - a) * ratio;
  const pair = (a: [number, number], b: [number, number]): [number, number] => [
    lerp(a[0], b[0]),
    lerp(a[1], b[1])
  ];
  return {
    t: time,
    l1: pair(from.l1, to.l1),
    lk: pair(from.lk, to.lk),
    la: pair(from.la, to.la),
    r1: pair(from.r1, to.r1),
    rk: pair(from.rk, to.rk),
    ra: pair(from.ra, to.ra),
    lf: lerp(from.lf, to.lf),
    rf: lerp(from.rf, to.rf)
  };
}

export function applyFirstPetLegWalk(
  skeleton: {
    bones: Array<{
      data: { name: string; rotation: number; x: number; y: number };
      rotation: number;
      x: number;
      y: number;
      worldX: number;
      worldY: number;
      worldToLocalRotation(rotation: number): number;
      updateWorldTransform(): void;
      parent?: {
        matrix: { a: number; b: number };
        updateWorldTransform(): void;
      };
    }>;
  },
  boneMap: BoneRoleMap | undefined,
  now: number
) {
  if (!boneMap) return;
  const source = interpolateSample((now / 1000) % 3.3333);
  const find = (name?: string) =>
    name ? skeleton.bones.find((bone) => bone.data.name === name) : undefined;
  const hip = find(boneMap.hip || boneMap.spine);
  const head = find(boneMap.head);
  if (!hip || !head) return;
  const bodyHeight = Math.max(1, Math.abs(head.worldY - hip.worldY));

  const applyLeg = (
    upperRole: keyof BoneRoleMap,
    lowerRole: keyof BoneRoleMap,
    footRole: keyof BoneRoleMap,
    upperVector: [number, number],
    lowerVector: [number, number],
    footAngle: number
  ) => {
    const upper = find(boneMap[upperRole]);
    const lower = find(boneMap[lowerRole]);
    const foot = find(boneMap[footRole]);
    if (!upper || !lower || !foot) return;

    upper.parent?.updateWorldTransform();
    const kneeX = upper.worldX + upperVector[0] * bodyHeight;
    const kneeY = upper.worldY + upperVector[1] * bodyHeight;
    upper.rotation = upper.worldToLocalRotation(
      Math.atan2(kneeY - upper.worldY, kneeX - upper.worldX) * 180 / Math.PI
    );
    upper.updateWorldTransform();

    const ankleX = lower.worldX + lowerVector[0] * bodyHeight;
    const ankleY = lower.worldY + lowerVector[1] * bodyHeight;
    lower.rotation = lower.worldToLocalRotation(
      Math.atan2(ankleY - lower.worldY, ankleX - lower.worldX) * 180 / Math.PI
    );
    lower.updateWorldTransform();

    foot.rotation = foot.worldToLocalRotation(footAngle);
    foot.updateWorldTransform();
  };

  applyLeg(
    "leftUpperLeg",
    "leftLowerLeg",
    "leftFoot",
    source.lk,
    source.la,
    source.lf
  );
  applyLeg(
    "rightUpperLeg",
    "rightLowerLeg",
    "rightFoot",
    source.rk,
    source.ra,
    source.rf
  );
}
