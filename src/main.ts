import "./styles.css";
import { App } from "./app";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root element");
}

try {
  const app = new App(root);
  app.start();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  root.innerHTML = `
    <div class="fallback-screen">
      <div class="fallback-card">
        <div class="fallback-eyebrow">AI4Pilot Prototype</div>
        <h1>WebGL 启动失败</h1>
        <p>当前环境没有可用的 WebGL 上下文，因此无法渲染 3D 原型。</p>
        <p class="fallback-detail">${message}</p>
      </div>
    </div>
  `;
}
