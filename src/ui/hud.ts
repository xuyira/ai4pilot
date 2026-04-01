type HudState = {
  speed: number;
  driftAngleDeg: number;
  altitude: number;
  presetMass: number;
  keysHint: string;
};

export function createHud(root: HTMLDivElement) {
  const container = document.createElement("div");
  container.className = "hud";
  container.innerHTML = `
    <div class="hud-panel hud-title">
      <div class="eyebrow">AI4Pilot Prototype</div>
      <div class="headline">Anti-Gravity Flight Core</div>
    </div>
    <div class="hud-panel hud-stats"></div>
    <div class="hud-panel hud-help"></div>
    <div class="reticle"></div>
  `;
  root.append(container);

  const stats = container.querySelector<HTMLDivElement>(".hud-stats");
  const help = container.querySelector<HTMLDivElement>(".hud-help");

  if (!stats || !help) {
    throw new Error("HUD mount failed");
  }

  return {
    update(state: HudState) {
      stats.innerHTML = `
        <div><span>SPEED</span><strong>${state.speed.toFixed(1)}</strong></div>
        <div><span>DRIFT</span><strong>${state.driftAngleDeg.toFixed(1)}°</strong></div>
        <div><span>ALT</span><strong>${state.altitude.toFixed(1)}</strong></div>
        <div><span>MASS</span><strong>${state.presetMass.toFixed(2)}</strong></div>
      `;
      help.textContent = state.keysHint;
    },
  };
}
