export type PerfOverlay = ReturnType<typeof createPerfOverlay>;

type PerfState = {
  fps: number;
  simMs: number;
  drawCalls: number;
  speedLines: number;
};

export function createPerfOverlay(root: HTMLDivElement) {
  const panel = document.createElement("div");
  panel.className = "perf-overlay";
  root.append(panel);

  return {
    update(state: PerfState) {
      panel.innerHTML = `
        <div>FPS ${state.fps}</div>
        <div>SIM ${state.simMs.toFixed(3)}ms</div>
        <div>DRAW ${state.drawCalls}</div>
        <div>LINES ${state.speedLines}</div>
      `;
    },
  };
}
