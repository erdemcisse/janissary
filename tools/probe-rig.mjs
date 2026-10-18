// Throwaway probe: dump rig structure of a Meshy GLB (nodes, skin, animations).
import { NodeIO } from "@gltf-transform/core";

const io = new NodeIO();
for (const path of process.argv.slice(2)) {
  const doc = await io.read(path);
  const root = doc.getRoot();
  console.log(`\n=== ${path}`);
  console.log("scenes:", root.listScenes().length, "nodes:", root.listNodes().length,
    "skins:", root.listSkins().length, "anims:", root.listAnimations().length,
    "meshes:", root.listMeshes().length, "images:", root.listTextures().length);
  const printNode = (node, depth) => {
    const t = node.getTranslation().map((v) => v.toFixed(3));
    const s = node.getScale().map((v) => v.toFixed(4));
    const r = node.getRotation().map((v) => v.toFixed(3));
    console.log(`${"  ".repeat(depth)}${node.getName()} t=[${t}] s=[${s}] r=[${r}]${node.getMesh() ? " [mesh]" : ""}${node.getSkin() ? " [skin]" : ""}`);
    for (const child of node.listChildren()) printNode(child, depth + 1);
  };
  for (const scene of root.listScenes()) for (const child of scene.listChildren()) printNode(child, 0);
  for (const skin of root.listSkins()) {
    console.log("skin joints:", skin.listJoints().map((j) => j.getName()).join(", "));
  }
  for (const anim of root.listAnimations()) {
    console.log(`anim "${anim.getName()}" channels=${anim.listChannels().length} samplers=${anim.listSamplers().length}`);
    const targets = new Set(anim.listChannels().map((c) => `${c.getTargetNode()?.getName()}:${c.getTargetPath()}`));
    console.log("  targets:", [...targets].join(", "));
    const sampler = anim.listSamplers()[0];
    if (sampler) {
      const input = sampler.getInput();
      console.log("  duration ~", input ? Math.max(...Array.from(input.getArray() ?? [])).toFixed(2) : "?", "s");
    }
  }
  for (const tex of root.listTextures()) {
    console.log(`tex "${tex.getName()}" ${tex.getMimeType()} size=${tex.getSize()?.join("x") ?? "?"} slot=${tex.getURI() ?? "embedded"}`);
  }
  for (const mat of root.listMaterials()) {
    console.log(`mat "${mat.getName()}" baseTex=${mat.getBaseColorTexture() ? "yes" : "no"} mrTex=${mat.getMetallicRoughnessTexture() ? "yes" : "no"} normalTex=${mat.getNormalTexture() ? "yes" : "no"} emissiveTex=${mat.getEmissiveTexture() ? "yes" : "no"} occlusionTex=${mat.getOcclusionTexture() ? "yes" : "no"}`);
  }
}
