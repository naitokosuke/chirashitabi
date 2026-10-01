import { defineConfig } from "vite-plus";
import vize from "@vizejs/vite-plugin";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [vize({ vapor: true }), viteSingleFile()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { outDir: "dist-single" },
});
