import type { ActionBindings, BoneRoleMap } from "../types";
import { FIRST_PET_LEG_WALK } from "./firstPetLegWalk";

export type UniversalAction = {
  id: string;
  label: string;
  candidates: string[];
  description: string;
};

export const universalActions: UniversalAction[] = [
  {
    id: "idle",
    label: "待机",
    candidates: ["Default", "Relax", "Sit", "Idle"],
    description: "站立停留时播放"
  },
  {
    id: "walk",
    label: "走路",
    candidates: ["Move", "Walk", "Run"],
    description: "没有专用动画时使用通用步态"
  },
  {
    id: "fall",
    label: "掉落",
    candidates: ["Fall", "Air", "Special"],
    description: "被抛出或空中下落时播放"
  },
  {
    id: "land",
    label: "落地",
    candidates: ["Land", "Default", "Relax"],
    description: "接触桌面时播放"
  },
  {
    id: "drag",
    label: "被抓",
    candidates: ["Interact", "Relax", "Special"],
    description: "鼠标拖动角色时播放"
  },
  {
    id: "sleep",
    label: "休眠",
    candidates: ["Sleep", "Relax", "Sit"],
    description: "进入睡眠时播放"
  }
];

const bonePatterns: Array<[keyof BoneRoleMap, RegExp[]]> = [
  ["root", [/^root$/i, /base/i]],
  ["hip", [/^f_hip_?\d+$/i, /^f_hip$/i, /hip$/i, /pelvis/i]],
  ["spine", [/^f_waist$/i, /spine/i, /waist/i]],
  ["chest", [/^f_chest$/i, /chest/i, /torso/i]],
  ["head", [/^f_head(_[^ ]+)?$/i, /head$/i]],
  ["leftUpperLeg", [/^f_l_leg_?\d+$/i, /^f_l_leg$/i, /l.*upper.*leg/i, /left.*thigh/i]],
  ["leftLowerLeg", [/^f_l_claf_?\d+$/i, /^f_l_calf_?\d+$/i, /l.*lower.*leg/i, /left.*calf/i]],
  ["leftFoot", [/^f_l_foot_?01$/i, /^f_l_foot_?\d+$/i, /left.*foot/i]],
  ["rightUpperLeg", [/^f_r_leg_?\d+$/i, /^f_r_leg$/i, /r.*upper.*leg/i, /right.*thigh/i]],
  ["rightLowerLeg", [/^f_r_claf_?\d+$/i, /^f_r_calf_?\d+$/i, /r.*lower.*leg/i, /right.*calf/i]],
  ["rightFoot", [/^f_r_foot_?01$/i, /^f_r_foot_?\d+$/i, /right.*foot/i]],
  ["leftUpperArm", [/f_l_arm$/i, /left.*upper.*arm/i]],
  ["leftLowerArm", [/f_l_forearm$/i, /left.*forearm/i]],
  ["rightUpperArm", [/f_r_arm$/i, /right.*upper.*arm/i]],
  ["rightLowerArm", [/f_r_forearm$/i, /right.*forearm/i]]
];

export function analyzeBoneMap(
  boneNames: string[]
): BoneRoleMap {
  const result: BoneRoleMap = {};
  for (const [role, patterns] of bonePatterns) {
    for (const pattern of patterns) {
      const match = boneNames.find((name) => pattern.test(name));
      if (match) {
        result[role] = match;
        break;
      }
    }
  }
  return result;
}

export function chooseBoundAnimation(
  actionId: string,
  bindings: ActionBindings | undefined,
  available: string[],
  durations?: Record<string, number>
) {
  const isPlayable = (name: string) =>
    !durations || Number(durations[name] || 0) > 0;
  const bound = bindings?.[actionId];
  if (bound === FIRST_PET_LEG_WALK) return FIRST_PET_LEG_WALK;
  if (
    bound &&
    isPlayable(bound) &&
    available.some((name) => name.toLowerCase() === bound.toLowerCase())
  ) {
    return available.find((name) => name.toLowerCase() === bound.toLowerCase());
  }
  const definition = universalActions.find((action) => action.id === actionId);
  if (!definition) return undefined;
  for (const candidate of definition.candidates) {
    const match = available.find(
      (name) =>
        name.toLowerCase() === candidate.toLowerCase() && isPlayable(name)
    );
    if (match) return match;
  }
  return undefined;
}

export type ActionDiagnostics = {
  status: "ok" | "warning" | "invalid";
  title: string;
  message: string;
  missing: string[];
};

export function validateActionSet(
  animations: string[],
  durations: Record<string, number>,
  bindings?: ActionBindings
): ActionDiagnostics {
  const playable = animations.filter(
    (name) => Number(durations[name] || 0) > 0
  );
  if (playable.length === 0) {
    return {
      status: "invalid",
      title: "该文件不能驱动模型运动",
      message: "没有检测到任何有时长的动画，请重新导入正确的骨骼文件。",
      missing: universalActions.map((action) => action.label)
    };
  }

  const missing = universalActions
    .filter(
      (action) =>
        !chooseBoundAnimation(action.id, bindings, animations, durations)
    )
    .map((action) => action.label);

  if (missing.length > 0) {
    return {
      status: "warning",
      title: "模型动作不全",
      message: `缺少：${missing.join("、")}。缺失部分将使用通用动作补足。`,
      missing
    };
  }

  return {
    status: "ok",
    title: "动作文件检查通过",
    message: "已检测到待机、走路、掉落、落地、被抓和休眠动作。",
    missing: []
  };
}
