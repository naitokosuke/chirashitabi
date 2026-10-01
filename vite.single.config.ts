import vize from "@vizejs/vite-plugin";
import { viteSingleFile } from "vite-plugin-singlefile";
import { defineConfig, type Plugin, type Rollup } from "vite-plus";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A worker imported with `?worker&url` (MapLibre's, in Map.vue) is built to a file of its own,
 * which a single-file build cannot ship. Put its code into the chunk that refers to it and
 * hand out a blob URL instead. Runs before viteSingleFile, which then inlines that chunk.
 */
function inlineWorkerUrls(): Plugin {
  return {
    name: "chirashitabi:inline-worker-urls",
    enforce: "post",
    generateBundle(_, bundle) {
      const files = Object.values(bundle);
      const workers = files.filter(
        (f): f is Rollup.OutputAsset => f.type === "asset" && f.fileName.endsWith(".js"),
      );
      for (const worker of workers) {
        const code =
          typeof worker.source === "string"
            ? worker.source
            : new TextDecoder().decode(worker.source);
        // `new URL("maplibre-gl-worker-….js", import.meta.url).href`, with any quote
        const ref = new RegExp(
          `new URL\\((["'\`])${escapeRegExp(worker.fileName)}\\1,\\s*import\\.meta\\.url\\)\\.href`,
          "g",
        );
        const blob = `URL.createObjectURL(new Blob([${JSON.stringify(code)}],{type:"text/javascript"}))`;
        let inlined = false;
        for (const chunk of files) {
          if (chunk.type !== "chunk") continue;
          const code = chunk.code.replace(ref, () => blob);
          if (code === chunk.code) continue;
          chunk.code = code;
          inlined = true;
        }
        if (inlined) delete bundle[worker.fileName];
      }
    },
  };
}

export default defineConfig({
  plugins: [vize({ vapor: true }), inlineWorkerUrls(), viteSingleFile()],
  build: { outDir: "dist-single" },
});
