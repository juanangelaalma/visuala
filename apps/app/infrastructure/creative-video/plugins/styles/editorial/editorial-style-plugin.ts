import type { StylePlugin } from "../../../../../domain/creative-video/contracts";

export const editorialStylePlugin: StylePlugin = {
  ref: { id: "editorial", version: "1" },
  tokens: {},
  typographyRequirements: [],
  layoutIds: [],
  motionIds: [],
  sceneConstraints: [],
  textConstraints: {
    headlineMaxLength: 80,
    supportingTextMaxLength: 140,
  },
  capabilities: ["vertical-video"],
  runtimeDependencies: {},
  async compile() {
    throw new Error("Editorial compilation is not implemented.");
  },
  supportsScene() {
    return false;
  },
};
