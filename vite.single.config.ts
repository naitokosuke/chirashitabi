import vize from "@vizejs/vite-plugin";
import { viteSingleFile } from "vite-plugin-singlefile";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [vize({ vapor: true }), viteSingleFile()],
  build: { outDir: "dist-single" },
});
