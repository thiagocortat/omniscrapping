import { startDedicatedScanWorker } from "../lib/job-store";

startDedicatedScanWorker();

console.log("[scan-worker] BullMQ worker started.");

process.on("SIGINT", () => {
  process.exit(0);
});

process.on("SIGTERM", () => {
  process.exit(0);
});
