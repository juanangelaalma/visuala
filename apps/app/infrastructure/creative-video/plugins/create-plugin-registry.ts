import { PluginRegistry } from "../../../domain/creative-video/plugin-registry";
import { fnbCategoryPlugin } from "./categories/fnb/fnb-category-plugin";
import { editorialStylePlugin } from "./styles/editorial/editorial-style-plugin";

export function createCreativeVideoPluginRegistry(): PluginRegistry {
  return new PluginRegistry([fnbCategoryPlugin], [editorialStylePlugin]);
}
