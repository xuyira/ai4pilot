# 反重力飞行对战游戏技术设计文档

## 1. 文档目标

本文档定义首个可玩版本的技术实现方案，覆盖以下范围：

1. 引擎与运行时选型
2. 核心模块边界
3. 飞行运动学数学模型
4. 速度感与视觉反馈实现
5. 对战系统最小闭环
6. 性能预算与验收方法

本文档服务于“先做原型，再做可扩展架构”的目标，因此优先保证可实现性、可调试性和可调参能力。

## 2. 技术选型

### 2.1 推荐栈

- 渲染层：`Three.js + WebGL`
- 语言：`TypeScript`
- 构建工具：`Vite`
- UI 调试：`lil-gui` 或同类轻量参数面板
- 数学库：优先使用 `Three.js` 自带 `Vector3`、`Quaternion`、`Euler`，避免重复造轮子

### 2.2 不优先采用的方案

- 不引入 `PhysX`、`Cannon.js`、`Ammo.js` 等重型物理引擎
- 不在首版使用 WebGPU 作为主渲染路径
- 不在首版接入完整联网同步

原因：

1. 当前核心风险是飞行手感而不是图形 API 上限。
2. 纯数学运动学更适合快速调参。
3. 网络同步应该建立在单机手感和战斗闭环稳定之后。

## 3. 总体架构

### 3.1 模块划分

```text
App
|- EngineLoop
|  |- FixedStepSimulation
|  |- RenderFrame
|- Core
|  |- FlightPhysics
|  |- InputMapper
|  |- CameraRig
|  |- SpeedEffects
|- Gameplay
|  |- CombatSystem
|  |- WeaponSystem
|  |- TargetingSystem
|  |- AISystem
|- Scene
|  |- ArenaBuilder
|  |- ObstacleSystem
|- UI
|  |- HUD
|  |- DebugPanel
|  |- PerfOverlay
```

### 3.2 模块职责

`EngineLoop`

- 提供固定时间步长更新
- 控制物理更新与渲染更新解耦
- 输出帧时间统计

`FlightPhysics`

- 管理飞行器状态
- 应用输入平滑
- 计算加速度、速度、位置和姿态
- 输出可供渲染和战斗使用的当前状态

`CameraRig`

- 根据飞行状态更新追尾相机
- 处理 FOV、相机延迟、震动与速度感

`SpeedEffects`

- 管理空速线、边缘掠过物、后处理特效

`CombatSystem`

- 管理生命值、护盾、命中、击毁与重生

`TargetingSystem`

- 判断可锁定目标
- 输出 HUD 所需目标信息

`AISystem`

- 在首版提供靶机、追击、躲避等基础行为

## 4. 运行循环设计

### 4.1 更新原则

必须避免直接用波动的 `requestAnimationFrame dt` 驱动物理状态更新，否则不同帧率下手感会漂移。

### 4.2 推荐方案

- 渲染层：每次 `requestAnimationFrame` 执行一次
- 模拟层：使用固定步长 `fixedDt = 1 / 120`
- 若当前帧时间过长，则补跑多个模拟步
- 设置最大补帧数，避免卡顿导致“死亡螺旋”

### 4.3 伪代码

```ts
let accumulator = 0;
const fixedDt = 1 / 120;
const maxFrameDt = 1 / 20;

function frame(rawDt: number) {
  const clampedDt = Math.min(rawDt, maxFrameDt);
  accumulator += clampedDt;

  while (accumulator >= fixedDt) {
    simulation.update(fixedDt);
    accumulator -= fixedDt;
  }

  const alpha = accumulator / fixedDt;
  renderer.render(alpha);
}
```

### 4.4 设计收益

1. 物理手感不随帧率波动而变化。
2. 调参结果更稳定。
3. 便于性能测试和逻辑预算控制。

## 5. 飞行器状态模型

### 5.1 核心状态

```ts
type FlightState = {
  position: Vector3;
  velocity: Vector3;
  acceleration: Vector3;
  orientation: Quaternion;
  angularVelocity: Vector3;
  localVelocity: Vector3;
  forwardSpeed: number;
  hoverHeightError: number;
};
```

### 5.2 派生状态

- `speed = velocity.length()`
- `forward = orientation * (0, 0, -1)`
- `up = orientation * (0, 1, 0)`
- `right = orientation * (1, 0, 0)`
- `driftAngle = angle(velocity, forward)`

派生状态不长期存储，按需计算或缓存当前帧结果即可。

## 6. 输入系统设计

### 6.1 输入维度

- `throttle`: 推进输入，范围 `[-1, 1]`
- `yaw`: 偏航输入，范围 `[-1, 1]`
- `pitch`: 俯仰输入，范围 `[-1, 1]`
- `roll`: 横滚输入，范围 `[-1, 1]`
- `boost`: 短时加速
- `firePrimary`: 主武器
- `fireSecondary`: 副武器
- `lockTarget`: 锁定输入

### 6.2 输入处理链路

```text
Raw Input
-> InputMapper
-> InputState
-> SmoothedIntent
-> FlightPhysics
```

原则：

1. 原始输入只表达玩家意图，不直接改物理状态。
2. 平滑发生在“目标值”层，而不是最终状态层的所有变量都硬插值。
3. 不同输入轴要有不同阻尼系数。

## 7. 运动学模型

### 7.1 平滑响应

针对目标速度或目标角速度，采用指数平滑：

```text
current = current + (target - current) * (1 - exp(-k * dt))
```

说明：

- `k` 越大，响应越快
- `k` 越小，响应越柔和
- 可分别设置 `linearK` 和 `angularK`

### 7.2 姿态更新

角速度在本地坐标系定义更容易调参。

建议流程：

1. 根据输入得到目标角速度 `targetAngularVelocity`
2. 对目标角速度做指数平滑
3. 根据角速度增量生成小角度四元数
4. 乘到当前 `orientation`
5. 归一化四元数

### 7.3 推进模型

线性加速度建议由以下分量叠加：

```text
totalAcceleration =
  thrustAcceleration +
  antiGravityAcceleration +
  bankingCompensation +
  dragAcceleration +
  driftCorrectionAcceleration
```

### 7.4 反重力模型

首版建议定义一个“世界上方向”或“赛道局部法线”，不做复杂球面引力场。

反重力加速度：

```text
antiGravityAcceleration = surfaceNormal * hoverBalanceStrength
```

若后续加入地形贴地感，可扩展为：

```text
hoverError = targetHoverHeight - measuredHeight
hoverForce = surfaceNormal * (hoverError * hoverK - verticalVelocity * hoverDamping)
```

### 7.5 阻力模型

为获得“前冲快、横漂受控”的效果，阻力按本地坐标分解：

```text
localVelocity = inverse(orientation) * velocity

dragLocal.x *= -lateralDrag
dragLocal.y *= -verticalDrag
dragLocal.z *= -forwardDrag
```

建议约束：

- `forwardDrag < lateralDrag`
- `verticalDrag >= lateralDrag`

### 7.6 惯性漂移

目标：允许速度方向与机头方向短时分离。

实现策略：

1. 正常推进仍沿机头前方向施加
2. 当前速度不会瞬间旋转到前方
3. 当 `driftAngle` 超过阈值时施加回正加速度

```text
if driftAngle > driftMaxAngle:
  apply correction toward forward vector
```

### 7.7 Banking 与向心补偿

转向时自动生成目标滚转角：

```text
targetRoll = -yawInput * maxBankAngle * bankBySpeedFactor
```

为了让滚转不是纯视觉表现，需要根据滚转和速度施加横向补偿：

```text
bankingCompensation = right * (-sin(currentRoll) * speed * bankingLiftFactor)
```

首版实现不需要严格物理正确，只需满足“看起来侧倾，转起来顺手”。

## 8. 相机与速度感系统

### 8.1 相机 Rig

相机由独立 Rig 控制，避免直接绑定在机体节点上。

组成：

1. 跟随目标点
2. 延迟平滑
3. 速度驱动 FOV
4. 轻微横向偏移和震动

### 8.2 动态 FOV

```text
speedRatio = clamp(speed / speedForMaxFov, 0, 1)
targetFov = lerp(baseFov, maxFov, speedRatio)
currentFov = smooth(currentFov, targetFov, fovResponseK, dt)
```

### 8.3 空速线粒子

设计要求：

1. 粒子生成围绕相机而不是围绕世界固定点。
2. 粒子在相机局部空间中更新，更容易获得稳定视觉。
3. 粒子越过视锥后重置到前方生成带。

数据结构：

```ts
type SpeedParticle = {
  positionLocal: Vector3;
  velocityLocal: Vector3;
  life: number;
};
```

### 8.4 边缘参照物

在高速飞行中，仅靠中心区域粒子不够，需要视野边缘的“掠过物”。

实现建议：

1. 在相机前方和两侧生成低面数几何体
2. 它们沿相机局部后方快速移动
3. 超出范围后循环回收

### 8.5 后处理优先级

优先级从高到低：

1. 动态 FOV
2. 粒子
3. 边缘掠过物
4. 径向模糊
5. 色差/拉伸

原因：前 3 项对速度感贡献更大，且成本更低。

## 9. 战斗系统最小方案

### 9.1 首版目标

验证“高速追逐 + 锁定 + 射击 + 击毁”的闭环，不做复杂成长系统。

### 9.2 战斗对象状态

```ts
type CombatState = {
  hp: number;
  shield: number;
  alive: boolean;
  respawnTimer: number;
  teamId: number;
  targetId?: string;
};
```

### 9.3 主武器

推荐首版使用命中反馈明确的高速射线武器。

理由：

1. 更容易验证准星与追击体验
2. 比弹丸更容易调试
3. 更适合先做快节奏飞行战斗

### 9.4 副武器

推荐首版使用弱追踪导弹。

锁定条件：

- 目标在前方视锥内
- 距离低于锁定半径
- 持续瞄准时间超过阈值

### 9.5 命中检测

首版采用简化包围体：

- 飞机：包围球或胶囊体
- 场景障碍：AABB 或包围球
- 射线武器：Raycast
- 导弹：距离触发爆炸

## 10. AI 原型设计

首版 AI 不追求复杂决策，只需要支撑测试。

行为状态：

1. 巡航
2. 追击
3. 拉开距离
4. 攻击
5. 重置航线

输入接口不应直接操作物理状态，应与玩家一样走 `InputState` 接口。

这样后续做人机共用飞行模型不会分叉。

## 11. 场景与地图设计要求

### 11.1 地图功能目标

地图不是装饰，而是服务飞行与战斗：

1. 提供速度参照
2. 提供掩体与绕障路线
3. 提供高风险高速通道

### 11.2 原型地图结构

推荐一张高空竞技场，包含：

- 中央开放交火区
- 两侧障碍群
- 一条高速穿越环道
- 若干竖向高低差参照结构

## 12. 配置系统设计

所有关键体验参数必须集中配置，禁止散落在业务逻辑中。

建议分层：

```text
config/
  flight.ts
  camera.ts
  particles.ts
  combat.ts
  ai.ts
  debug.ts
```

约束：

1. 所有参数具备默认值
2. 所有参数允许调试面板热更新
3. 支持预设导出与切换

## 13. 性能预算

### 13.1 单帧预算建议

以 60 FPS 为目标，单帧总预算约 `16.67ms`。

建议预算：

- 飞行逻辑：`<= 1ms`
- AI + 战斗：`<= 1ms`
- 粒子与特效 CPU 开销：`<= 1.5ms`
- 渲染提交与场景更新：`<= 4ms`
- GPU 预算：尽量控制在 `8ms` 以内

### 13.2 优化重点

1. 避免每帧 new 大量 `Vector3`、`Quaternion`
2. 粒子采用对象池或 instancing
3. HUD 与调试面板减少无意义重绘
4. 后处理效果可降级关闭

## 14. 测试与验收方案

### 14.1 物理验收

- 修改 `k` 后，输入响应曲线可明显变化
- 修改 `mass` 后，加减速与姿态响应可明显变化
- 停止输入时飞行器非瞬停

### 14.2 视觉验收

- 纯黑背景中仅开启粒子仍能感知位移
- 加速时 FOV 有明显增长
- 高速下视野边缘有掠过参照

### 14.3 战斗验收

- AI 敌机可被追踪、命中、击毁
- 重生与胜负结算完整
- HUD 信息不缺失

### 14.4 性能验收

- 逻辑耗时稳定在目标预算
- 关闭后处理后仍保留核心速度感
- 粒子规模增长后系统不会明显抖动

## 15. 首版非目标

以下内容不进入首版范围：

1. 真实空气动力学仿真
2. 完整网络同步
3. 高级任务系统
4. 成长、装备、经济系统
5. 复杂美术资产生产流程

## 16. 建议落地顺序

1. 跑通循环与调试面板
2. 跑通飞行运动学
3. 打磨 Banking、漂移与回正
4. 接入动态 FOV 和粒子
5. 接入主武器、锁定和 AI
6. 搭地图和障碍
7. 做性能收口

