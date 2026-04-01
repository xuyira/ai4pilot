# 反重力飞行对战游戏参数文档

## 1. 文档目标

本文档统一定义核心运行参数、推荐默认值、建议范围和调参影响，避免参数散落和命名不一致。

参数分为五类：

1. 飞行参数
2. 相机参数
3. 速度感参数
4. 战斗参数
5. 调试、性能与行为参数

当前产品方向补充如下：

1. 游戏为偏竞技街机，不是飞行模拟。
2. 飞行器默认持续前进，玩家主要管理速度区间与姿态。
3. 参数设计应服务于“决策优先”的玩法，不应制造多余飞控负担。

## 2. 参数设计原则

1. 一个参数只控制一个主要感知维度。
2. 参数名体现含义，避免 `a1`、`speedFactor2` 一类命名。
3. 每个参数必须有默认值、建议范围和风险说明。
4. 优先使用无量纲比例值，其次才是绝对值。

## 3. 飞行参数

本项目的速度控制建议基于以下链路：

```text
speedAdjustInput -> targetForwardSpeed / throttleLevel -> currentForwardSpeed -> worldVelocity
```

因此，飞行参数要优先区分：

1. 巡航速度
2. 玩家调速能力
3. 刹车能力
4. 高速稳定性
5. 低速边界

| 参数名 | 默认值 | 建议范围 | 作用 | 调大效果 | 调小效果 | 风险 |
|---|---:|---:|---|---|---|---|
| `mass` | 1.0 | 0.6 - 2.5 | 模拟质量，影响加减速和姿态响应 | 更重、更钝、更稳 | 更轻、更灵、更飘 | 过小会过于敏感 |
| `cruiseSpeed` | 140 | 80 - 220 | 默认巡航速度 | 常态更快，节奏更紧 | 常态更稳，更易瞄准 | 过高压缩新手反应时间 |
| `minCruiseSpeed` | 70 | 40 - 120 | 允许的最低战术速度 | 不易停滞，维持节奏 | 更允许低速修正 | 过低会接近悬停 |
| `targetSpeedStepRate` | 90 | 30 - 180 | `W / S` 调整目标速度的变化率 | 调速更直接 | 调速更平缓 | 过高像档位跳变 |
| `linearResponseK` | 10.0 | 4 - 18 | 线性输入平滑强度 | 更跟手 | 更柔和 | 过大像瞬时输入 |
| `angularResponseK` | 12.0 | 5 - 22 | 角速度输入平滑强度 | 转向更直接 | 转向更顺滑 | 过大易生硬 |
| `maxForwardSpeed` | 220 | 120 - 420 | 最大前进速度 | 更快，更有冲刺感 | 更慢，更可控 | 过高会压缩反应时间 |
| `maxReverseSpeed` | 0 | 0 - 20 | 最大反向速度 | 更易后撤修正 | 更强调前冲节奏 | 首版过高会破坏竞技语义 |
| `forwardAcceleration` | 90 | 40 - 180 | 从巡航向更高速度区间加速的能力 | 提速更猛 | 起步更沉 | 过高会难调 FOV |
| `brakeAcceleration` | 110 | 50 - 220 | 主动减速强度 | 收速更快 | 惯性更强 | 过大像空气刹车 |
| `boostAcceleration` | 160 | 100 - 260 | 冲刺额外加速度 | 冲刺更明显 | 冲刺存在感弱 | 过高影响战斗可读性 |
| `forwardDrag` | 0.18 | 0.05 - 0.4 | 前向阻力 | 更容易降速 | 更容易长距离滑行 | 过低会失控 |
| `lateralDrag` | 1.4 | 0.6 - 2.5 | 横向阻力 | 漂移更受控 | 漂移更明显 | 过高会失去漂浮感 |
| `verticalDrag` | 1.8 | 0.8 - 3.0 | 垂向阻力 | 俯仰修正更快 | 上下浮动更强 | 过低会飘忽 |
| `hoverBalanceStrength` | 30 | 10 - 60 | 反重力平衡力 | 更能稳定悬浮 | 更依赖惯性 | 过高会像磁吸 |
| `hoverDamping` | 8 | 2 - 20 | 垂向悬浮阻尼 | 垂向更稳 | 更像漂浮 | 过高显僵硬 |
| `yawRate` | 1.8 | 0.8 - 3.2 | 偏航角速度系数 | 转弯更快 | 转弯更慢 | 过高不利瞄准 |
| `pitchRate` | 1.4 | 0.6 - 2.8 | 俯仰角速度系数 | 俯仰更敏捷 | 俯仰更迟缓 | 过高易眩晕 |
| `rollRate` | 2.4 | 1.0 - 4.0 | 横滚角速度系数 | 横滚更明显 | 侧倾更温和 | 过高视觉噪声大 |

## 4. 手感与漂移参数

| 参数名 | 默认值 | 建议范围 | 作用 | 调大效果 | 调小效果 | 风险 |
|---|---:|---:|---|---|---|---|
| `maxBankAngleDeg` | 42 | 20 - 65 | 自动 Banking 最大角度 | 视觉更激进 | 视觉更克制 | 过大影响瞄准 |
| `bankBySpeedFactor` | 1.0 | 0.4 - 1.6 | 速度对滚转角放大系数 | 高速更易侧倾 | 高速更稳 | 过大难控制 |
| `bankingLiftFactor` | 0.9 | 0.2 - 1.8 | 滚转引入的向心补偿强度 | 转向更咬地 | 更飘、更松 | 过大像轨道锁定 |
| `driftMaxAngleDeg` | 28 | 10 - 45 | 漂移允许最大偏角 | 更漂、更滑 | 更贴头指向 | 过大失控 |
| `driftCorrectionStrength` | 6 | 1 - 14 | 超过阈值后的回正强度 | 更快回正 | 保留更久漂移 | 过高会突兀 |
| `driftCorrectionDelay` | 0.15 | 0 - 0.4 | 开始回正前延迟 | 漂浮感更强 | 更即时收束 | 过大影响瞄准 |
| `idleRollReturnK` | 5 | 1 - 10 | 松手后横滚回正速度 | 更快回中 | 更松弛 | 过高像自动扶正 |
| `aimAssistYawDamping` | 0.2 | 0 - 0.6 | 锁定或瞄准状态下偏航阻尼 | 瞄准更稳 | 机动更自由 | 过高削弱手感 |

## 5. 相机参数

| 参数名 | 默认值 | 建议范围 | 作用 | 调大效果 | 调小效果 | 风险 |
|---|---:|---:|---|---|---|---|
| `cameraFollowDistance` | 8 | 4 - 14 | 相机与机体距离 | 画面更稳 | 临场感更强 | 过近影响读图 |
| `cameraFollowHeight` | 2.2 | 0.5 - 4 | 相机抬高量 | 更看清前方 | 更贴近机体 | 过高削弱速度感 |
| `cameraPositionLagK` | 7 | 2 - 14 | 相机位置平滑强度 | 更跟手 | 更有拖拽感 | 过小会晕 |
| `cameraLookLagK` | 9 | 3 - 18 | 相机朝向平滑强度 | 看向目标更直接 | 更柔和 | 过低会滞后 |
| `baseFov` | 78 | 65 - 90 | 基础视角 | 视野更广 | 更聚焦 | 过大有鱼眼感 |
| `maxFov` | 102 | 90 - 120 | 高速最大视角 | 拉伸感更强 | 速度感减弱 | 过大会失真 |
| `fovResponseK` | 6 | 2 - 14 | FOV 平滑响应速度 | 变化更直接 | 变化更柔和 | 过高会跳变 |
| `speedForMaxFov` | 220 | 120 - 420 | 达到最大 FOV 所需速度 | 更晚拉满 FOV | 更早拉满 FOV | 过低会长期大广角 |
| `cameraShakeStrength` | 0.08 | 0 - 0.2 | 高速震动强度 | 更刺激 | 更干净 | 过大影响瞄准 |

## 6. 速度感与特效参数

| 参数名 | 默认值 | 建议范围 | 作用 | 调大效果 | 调小效果 | 风险 |
|---|---:|---:|---|---|---|---|
| `speedLineCount` | 600 | 100 - 2000 | 空速线数量 | 速度感更强 | 画面更干净 | 过高吃性能 |
| `speedLineLength` | 1.8 | 0.5 - 4 | 空速线长度 | 拉伸感更强 | 点状感更强 | 过长影响清晰度 |
| `speedLineSpawnRadius` | 18 | 8 - 32 | 粒子生成半径 | 覆盖面更广 | 更集中 | 过大稀疏 |
| `speedLineSpeedFactor` | 1.4 | 0.5 - 3 | 粒子反向速度系数 | 更强速度感 | 更克制 | 过高像下雨 |
| `edgeProxyCount` | 48 | 8 - 120 | 边缘参照物数量 | 掠过感更强 | 更简洁 | 过高分散注意力 |
| `edgeProxySpeedFactor` | 1.2 | 0.4 - 2.5 | 边缘参照物移动速度 | 边缘动态更强 | 更平缓 | 过高干扰战斗 |
| `radialBlurStrength` | 0.18 | 0 - 0.4 | 径向模糊强度 | 高速冲击更明显 | 更清晰 | 过大影响命中感 |
| `chromaticAberration` | 0.02 | 0 - 0.08 | 色差强度 | 冲刺更炫 | 更朴素 | 过高廉价感强 |
| `vignetteSpeedBoost` | 0.12 | 0 - 0.3 | 高速边缘压暗 | 更聚焦中心 | 更自然 | 过高压画面 |

## 7. 战斗参数

战斗参数需要配合“决策优先”的设计目标。

推荐原则：

1. 击杀不能太快，否则难以体现路线和时机选择。
2. 也不能太慢，否则玩家会把战斗感知成纯追逐。
3. 锁定和副武器应奖励良好决策，而不是代替玩家决策。

| 参数名 | 默认值 | 建议范围 | 作用 | 调大效果 | 调小效果 | 风险 |
|---|---:|---:|---|---|---|---|
| `maxHp` | 100 | 50 - 250 | 最大生命值 | 更耐打 | 更脆 | 过高拖慢节奏 |
| `maxShield` | 75 | 0 - 200 | 最大护盾值 | 更强调消耗战 | 更强调爆发 | 过高击杀反馈弱 |
| `shieldRegenDelay` | 3.5 | 1 - 8 | 受击后护盾恢复延迟 | 更保守 | 更频繁恢复 | 过低难击杀 |
| `shieldRegenRate` | 12 | 4 - 30 | 护盾回复速度 | 更持久 | 更脆弱 | 过高拉长战斗 |
| `primaryDamage` | 8 | 2 - 20 | 主武器单次伤害 | 击杀更快 | 更依赖持续命中 | 过高秒杀感强 |
| `primaryFireRate` | 10 | 2 - 20 | 主武器每秒射速 | 压制更强 | 更强调点射 | 过高噪声大 |
| `primaryRange` | 650 | 200 - 1200 | 主武器有效距离 | 更远程 | 更贴身 | 过高降低追逐价值 |
| `missileDamage` | 28 | 10 - 80 | 副武器伤害 | 锁定奖励更大 | 更偏骚扰 | 过高不公平 |
| `missileLockTime` | 1.2 | 0.3 - 2.5 | 锁定所需时间 | 锁定更难 | 锁定更快 | 过低过于无脑 |
| `missileTurnRate` | 1.6 | 0.4 - 3.5 | 导弹追踪转向率 | 更容易命中 | 更容易躲避 | 过高像必中 |
| `respawnDelay` | 4 | 2 - 8 | 重生等待时间 | 惩罚更重 | 节奏更快 | 过低击杀意义弱 |
| `matchTimeSeconds` | 300 | 120 - 900 | 单局时长 | 战术空间更大 | 更快出结果 | 过长疲劳 |

## 8. AI 参数

AI 应采用与玩家一致的巡航/调速语义，避免出现脚本式瞬时速度变化。

| 参数名 | 默认值 | 建议范围 | 作用 | 调大效果 | 调小效果 | 风险 |
|---|---:|---:|---|---|---|---|
| `aiAggression` | 0.7 | 0.2 - 1.2 | 进攻倾向 | 更主动贴脸 | 更保守 | 过高容易送死 |
| `aiAimAccuracy` | 0.65 | 0.2 - 0.95 | 瞄准精度 | 更难打 | 更容易陪练 | 过高挫败感强 |
| `aiEvadeStrength` | 0.55 | 0.1 - 1.0 | 躲避强度 | 更会规避 | 更直来直去 | 过高像作弊 |
| `aiRepathInterval` | 0.4 | 0.1 - 1.5 | 重算目标间隔 | 更灵活 | 更迟钝 | 过低浪费性能 |

## 9. 调试、性能与行为参数

| 参数名 | 默认值 | 建议范围 | 作用 | 备注 |
|---|---:|---:|---|---|
| `fixedDt` | 0.008333 | 0.004166 - 0.016666 | 固定模拟步长 | 推荐 120Hz |
| `maxSubSteps` | 4 | 2 - 8 | 单帧最多补跑步数 | 防止卡顿时死循环 |
| `perfOverlayEnabled` | `true` | boolean | 是否开启性能面板 | 发布版可关闭 |
| `debugFlightVectors` | `false` | boolean | 显示前/上/速度向量 | 调飞行手感时有用 |
| `debugCollisionShapes` | `false` | boolean | 显示碰撞体 | 调命中检测时有用 |
| `qualityPreset` | `medium` | low/high | 视觉质量档位 | 控制粒子与后处理 |
| `telemetryEnabled` | `true` | boolean | 是否开启行为事件记录 | 开发期默认开启 |
| `decisionWindowMs` | 2500 | 800 - 5000 | 关键决策窗口时长 | 用于统计是否及时选择目标或路线 |
| `reactionWindowMs` | 800 | 150 - 1500 | 反应窗口时长 | 用于测算威胁响应延迟 |
| `focusSampleHz` | 10 | 2 - 30 | 专注相关连续采样频率 | 过高会增加日志量 |

## 10. 预设建议

### 轻型预设

适合强调机动和漂移：

```text
mass = 0.75
cruiseSpeed = 150
minCruiseSpeed = 78
targetSpeedStepRate = 120
linearResponseK = 14
angularResponseK = 16
forwardDrag = 0.12
lateralDrag = 1.0
maxBankAngleDeg = 50
driftMaxAngleDeg = 35
```

### 中型预设

适合作为默认竞技体验：

```text
mass = 1.0
cruiseSpeed = 140
minCruiseSpeed = 70
targetSpeedStepRate = 90
linearResponseK = 10
angularResponseK = 12
forwardDrag = 0.18
lateralDrag = 1.4
maxBankAngleDeg = 42
driftMaxAngleDeg = 28
```

### 重型预设

适合强调稳定性和火力平台感：

```text
mass = 1.8
cruiseSpeed = 125
minCruiseSpeed = 62
targetSpeedStepRate = 65
linearResponseK = 7
angularResponseK = 8
forwardDrag = 0.26
lateralDrag = 1.9
maxBankAngleDeg = 30
driftMaxAngleDeg = 18
```

## 11. 调参顺序建议

不要同时乱调所有参数，按以下顺序进行：

1. 先定 `mass`
2. 再定 `cruiseSpeed`、`minCruiseSpeed`
3. 再定 `targetSpeedStepRate`
4. 再定 `linearResponseK` 与 `angularResponseK`
5. 再定 `forwardAcceleration`、`brakeAcceleration`
6. 再定 `forwardDrag`、`lateralDrag`、`verticalDrag`
7. 再定 `maxBankAngleDeg`、`bankingLiftFactor`
8. 再定 `driftMaxAngleDeg` 与回正参数
9. 最后调 `baseFov`、`maxFov`、粒子与后处理

## 12. 高风险参数组合

以下组合容易直接破坏体验：

1. `angularResponseK` 很高，同时 `yawRate` 很高
   - 结果：机体过于敏感，难以瞄准
2. `cruiseSpeed` 很低，同时 `minCruiseSpeed` 很低
   - 结果：战斗容易滑向低速盘旋，破坏竞技节奏
3. `forwardDrag` 很低，同时 `driftMaxAngleDeg` 很高
   - 结果：高速下持续侧滑，几乎无法回正
4. `maxFov` 很高，同时 `radialBlurStrength` 很高
   - 结果：速度感强，但战斗可读性下降
5. `bankingLiftFactor` 很高，同时 `maxBankAngleDeg` 很高
   - 结果：转向像被轨道吸附，失去漂浮感
