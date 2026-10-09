import { defineConfig } from "@trigger.dev/sdk";
import { additionalFiles, aptGet } from "@trigger.dev/build/extensions/core";
import { puppeteer } from "@trigger.dev/build/extensions/puppeteer";

const project = process.env.TRIGGER_PROJECT_REF;

if (!project) throw new Error("Set TRIGGER_PROJECT_REF to the existing Trigger.dev project reference before starting or deploying Trigger tasks.");

export default defineConfig({
  project,
  runtime: "node-24",
  dirs: ["./src/trigger"],
  maxDuration: 1500,
  build: {
    external: ["hyperframes", "ffmpeg-static", "ffprobe-static"],
    extensions: [
      puppeteer(),
      aptGet({ packages: ["ffmpeg"] }),
      additionalFiles({ files: ["./fnb-library/**", "./fnb-fonts/**"] }),
    ],
  },
});
