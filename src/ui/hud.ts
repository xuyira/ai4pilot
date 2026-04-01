type HudState = {
  speed: number;
  targetSpeed: number;
  throttlePercent: number;
  driftAngleDeg: number;
  altitude: number;
  presetMass: number;
  status: string;
  zoneLabel: string;
  keysHint: string;
};

export function createHud(root: HTMLDivElement) {
  const container = document.createElement("div");
  container.className = "hud";
  container.innerHTML = `
    <div class="hud-topline">
      <div class="hud-brand">
        <div class="eyebrow">AEROTACTICAL COMMAND</div>
        <div class="headline">AG-Interceptor / Low Altitude Run</div>
      </div>
      <div class="hud-banner">
        <span class="hud-banner-label">Flight Status</span>
        <strong class="hud-banner-value">Nominal</strong>
      </div>
    </div>
    <div class="hud-left">
      <div class="hud-panel hud-primary"></div>
      <div class="hud-panel hud-secondary"></div>
    </div>
    <div class="hud-panel hud-help"></div>
  `;
  root.append(container);

  const primary = container.querySelector<HTMLDivElement>(".hud-primary");
  const secondary = container.querySelector<HTMLDivElement>(".hud-secondary");
  const help = container.querySelector<HTMLDivElement>(".hud-help");
  const bannerValue = container.querySelector<HTMLElement>(".hud-banner-value");

  if (!primary || !secondary || !help || !bannerValue) {
    throw new Error("HUD mount failed");
  }

  return {
    update(state: HudState) {
      bannerValue.textContent = state.status === "CRASH" ? "Impact Detected" : "Nominal";

      primary.innerHTML = `
        <div class="stat-block stat-speed">
          <span>SPEED</span>
          <strong>${state.speed.toFixed(0)}</strong>
          <em>km/h eq.</em>
        </div>
        <div class="stat-grid">
          <div><span>TARGET</span><strong>${state.targetSpeed.toFixed(0)}</strong></div>
          <div><span>THRUST</span><strong>${state.throttlePercent.toFixed(0)}%</strong></div>
          <div><span>ALT</span><strong>${state.altitude.toFixed(1)}</strong></div>
          <div><span>DRIFT</span><strong>${state.driftAngleDeg.toFixed(1)}°</strong></div>
        </div>
      `;

      secondary.innerHTML = `
        <div class="sys-row"><span>FRAME</span><strong>${state.status}</strong></div>
        <div class="sys-row"><span>MASS</span><strong>${state.presetMass.toFixed(2)}</strong></div>
        <div class="sys-row"><span>MODE</span><strong>CRUISE HOLD</strong></div>
        <div class="sys-row"><span>ZONE</span><strong>${state.zoneLabel}</strong></div>
      `;
      help.textContent = state.keysHint;
    },
  };
}
