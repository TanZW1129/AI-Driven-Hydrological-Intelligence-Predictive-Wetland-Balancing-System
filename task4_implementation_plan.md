# Task 4 详细实施方案：交互式 3D 数字孪生模型与工业级管控仪表盘 (Command Center UI)

本文档定义了 **Bandar Bukit Raja (BBR) 智慧防洪与湿地管理数字孪生原型** 的 **Task 4** 详细执行规范、模块架构、基于 Three.js / React Three Fiber 的 3D 物理水体与水闸模型、双轨时序图表、仿真播放器以及企业级控制中心大屏的设计与验收标准（Checkpoint 4）。

---

## 1. 目标与设计愿景 (Objective & Vision)

Task 4 是整个原型系统的最终集大成阶段，将 Task 1（水文计算与安全联锁）、Task 2（天气 API 与 Swagger 自定义注入）和 Task 3（状态机与双轨仿真推演）的全部计算成果，整合进一个**高沉浸感、企业级专业度、可实时交互的数字孪生管控中心（Command Center Dashboard）**。

### 核心交付目标：
1. **中央 3D 交互式数字孪生沙盘（3D Digital Twin Viewport）**：
   - 采用 **Three.js + @react-three/fiber + @react-three/drei** 构建。
   - **湿地水体动态升降**：真实反映 $1.0\text{ m} \sim 3.5\text{ m}$ 水位变化，水面带实时反射与波动特效，池底带 $1.0\text{m}/2.0\text{m}/3.5\text{m}$ 3D 标尺标线。
   - **双孔电动机械水闸物理升降**：垂直提升闸板跟随 IoT 执行器电机速率平滑升降。
   - **水流瀑布流体粒子特效**：开闸排水（$Q_{out} > 0$）时，闸底喷涌流体并涌向下游；暴雨入流（$Q_{in} > 0$）时，上游产生汇流瀑布动效。
   - **下游巴生河/海潮潮位联动**：独立受潮汐曲线驱动，直观演示高潮位与防倒灌闭锁。
   - **360° 自由旋转视角与运镜预设**（全景视角、聚焦水闸、俯视湿地、下游视角）。
2. **顶部企业级 KPI 态势感知条（Top Status & KPI Bar）**：
   - 运行阶段状态徽章（`NORMAL`, `PRE_DISCHARGE`, `PEAK_SHAVING`, `RECOVERY`, `INTERLOCK_SUSPENDED`）。
   - 湿地水位仪表（当前水深、库容百分比、防洪缓冲安全裕度）。
   - 水动力速率对（实时入流 $Q_{in}$ vs 允许出流 $Q_{out}$）。
   - 下游绝对联锁安全指示灯（绿灯正常，红灯闪烁报警并显示诊断原因）。
   - 减灾成效指标（累计避免城市淹水体积 $\text{m}^3$、洪峰削减高度）。
3. **24 小时水文历时曲线对比面板（Hydrograph Comparison Panel）**：
   - 采用 Recharts 构建交互式图表，同步对比：
     - 降雨强度柱状图（$mm/h$）。
     - **AI 智能湿地水位曲线**（平稳控在 $3.5\text{ m}$ 警戒线以下）。
     - **传统无控湿地水位曲线**（直观展示击穿 $3.5\text{ m}$ 漫顶内涝区域）。
     - 下游外河/海潮潮位曲线（含 $2.5\text{ m}$ 联锁严禁开闸线）。
4. **仿真时钟播放控制器（Simulation Player & Timeline）**：
   - 播放 / 暂停 / 重置 / 单步推进。
   - 加速倍率调节（1x 实时间隔, 10x, 60x, 300x 极速推演）。
   - 24 小时交互进度滑块，支持任意时间点拖拽定位。
5. **情景切换与 Swagger / OpenAPI 注入抽屉（Scenario & Swagger Console）**：
   - 一键切换：Open-Meteo 现场真实气象、暴雨预警场景、百年一遇极端暴雨高潮。
   - 侧边/弹窗 Swagger 控制台：直接编辑或粘贴自定义 JSON 时序，秒级校验并热注入 3D 仿真。
6. **手动干预 / 应急模式（Manual Override Mode）**：
   - 支持从“AI 自主管控”切换为“人工强制操控”，手动调节水闸开度，同时**严格受下游安全联锁底层兜底**（下游超标时人工指令亦被安全熔断截断）。

---

## 2. 界面布局与信息架构 (Dashboard Layout)

采用现代工业监控大屏深色系（Dark Theme）布局，全屏沉浸式呈现：

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [Logo] Bandar Bukit Raja 智慧防洪与湿地管理数字孪生 (BBR Twin)     [情景切换] [Swagger控制台] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ KPI 1: 运行阶段     KPI 2: 湿地水位/库容  KPI 3: 进出水流量    KPI 4: 下游潮位/联锁  KPI 5: 避免淹水量 │
├────────────────────────────────────────────────┬───────────────────────────────────────┤
│                                                │ 侧边分析栏 / 操作面板                 │
│                                                │                                       │
│          中央 3D 数字孪生画布                  │ 1. 24h 双轨水文历时对比图表           │
│         (React Three Fiber / 3D)               │    - 降雨 vs 智能水位 vs 传统溢流水位 │
│                                                │    - 避免洪涝淹没阴影区               │
│   [上游市镇汇流] ──> [125英亩湿地水体]          │                                       │
│          └──> [双孔机械水闸] ──> [下游海潮]    ├───────────────────────────────────────┤
│                                                │ 2. 状态机决策日志与遥测诊断           │
│   [视点切换: 全景 | 水闸 | 湿地 | 下游]        │    - 毫秒级诊断码 / 联锁状态          │
│                                                │    - 闸门电机当前行进位置             │
├────────────────────────────────────────────────┴───────────────────────────────────────┤
│ 底部时间轴播放器: [播放/暂停] [步进] [时钟: 04:30 / 24:00] ──[时间滑块]── [倍速: 1x/10x/60x] [手动干预]│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 3D 场景技术规格 (Three.js 3D Specifications)

为确保 100% 离线可用、无模型丢失风险且帧率稳定在 60 FPS，全部 3D 对象采用高精度**程序化网格（Procedural Meshes）与着色材质**：

### 3.1 场景几何分布
1. **地形底座（Terrain & Ground）**：
   - 尺寸：$60\text{m} \times 30\text{m}$ 宏观台地，区分深色草甸市镇区、湿地泥岸、出流明渠。
2. **125 英亩湿地水体（Wetland Water Mesh）**：
   - 半透明深蓝绿物理着色，水面网格 Y 轴高度严格绑定实测水位 $H_{wetland}$：
     $$Y_{water} = (H_{wetland} - 1.0) \times 1.5\text{ 比例因子}$$
   - 垂直水位测量标尺塔（带 $1.0\text{m}$ 绿色生态底线、$2.0\text{m}$ 蓝色常态线、$3.5\text{m}$ 红色警戒溢流线与发光刻度）。
3. **混凝土水闸防洪枢纽（Sluice Gate Structure）**：
   - 混凝土闸墩、上部电机驱动机房桥架。
   - **双孔垂直提升钢闸板**：位置 Y 轴跟随 `gateActuator.currentOpeningM` 动态实时升降，展现真实的机械行程阻尼感。
   - **出流流体效果**：当出流 $Q_{out} > 0$ 时，闸门底部生成白色湍流瀑布与下泄水花粒子，出流流量越大粒子密度和速度越快；断流时特效平滑消失。
   - **闸门顶部三色状态信号球**：
     - 绿色：正常受控排水
     - 蓝色：主动预泄洪
     - 黄色：削峰滞洪闭闸
     - 红色高频闪烁：下游潮位高涨 / 倒灌风险联锁熔断挂起
4. **下游巴生河道/海峡水体（Downstream Estuary Mesh）**：
   - 位于闸门右侧，受 $H_{downstream}$ 驱动独立升降。
   - 直观展现：当下游水位高于湿地水位时，闸板紧闭，下游海水被牢牢挡在闸外。

---

## 4. 全局仿真状态总线设计 (Zustand Global Store)

在 `src/store/simulationStore.ts` 建立单向响应式数据流，驱动所有 3D 实体与 2D UI 组件：

```typescript
export interface SimulationStoreState {
  // 仿真时钟状态
  isPlaying: boolean;
  playbackSpeed: number; // 1, 5, 20, 60, 300
  currentStepIndex: number;
  totalSteps: number;
  simTimeSec: number;
  
  // 当前加载的情景与时序数据
  activeScenario: WeatherScenarioPayload | null;
  dualTrackResult: {
    frames: SimulationFrame[];
    summary: DualTrackComparisonSummary | null;
  };
  
  // 当前帧遥测数据
  currentFrame: SimulationFrame | null;
  
  // 控制模式
  controlMode: 'AUTO_AI' | 'MANUAL_OVERRIDE';
  manualGateTargetM: number;
  
  // 视点控制
  cameraViewPreset: 'OVERVIEW' | 'GATE' | 'WETLAND' | 'DOWNSTREAM';
  
  // 动作方法
  loadScenarioById: (id: string) => Promise<void>;
  injectCustomSwaggerJson: (json: string) => void;
  play: () => void;
  pause: () => void;
  stepForward: () => void;
  seekToTime: (timeSec: number) => void;
  setSpeed: (speed: number) => void;
  setControlMode: (mode: 'AUTO_AI' | 'MANUAL_OVERRIDE') => void;
  setManualGate: (gateM: number) => void;
}
```

---

## 5. 组件与代码架构 (Component File Tree)

```text
src/
├── components/
│   ├── 3d/
│   │   ├── WetlandSceneCanvas.tsx    # R3F Canvas 容器与环境光影
│   │   ├── WetlandBasinMesh.tsx      # 湿地地貌与动态水体
│   │   ├── SluiceGateMesh.tsx        # 机械升降闸门与出流流体特效
│   │   ├── DownstreamBasinMesh.tsx   # 下游河道与潮位水体
│   │   ├── LevelGaugeMarker.tsx      # 1.0/2.0/3.5m 3D 水位标尺杆
│   │   └── CameraController.tsx      # 视点预设平滑过渡控制
│   ├── dashboard/
│   │   ├── TopKpiBar.tsx             # 顶部关键 KPI 指标卡片条
│   │   ├── HydrographChart.tsx       # 24h 水文双轨对比曲线图 (Recharts)
│   │   ├── SimulationPlayerBar.tsx   # 底部时钟播放控制条
│   │   ├── TelemetryDiagnostic.tsx   # 决策原因与传感器遥测状态卡
│   │   └── SwaggerConsoleModal.tsx   # Swagger/OpenAPI 自定义 JSON 交互抽屉
│   └── common/
│       └── Badge.tsx
├── store/
│   └── simulationStore.ts            # Zustand 全局仿真与 3D 数据总线
├── App.tsx                           # 主仪表盘组合入口
└── index.css                         # 样式与暗黑科技风微调
```

---

## 6. 详细执行步骤 (Execution Sequence)

Task 4 的开发将分为以下 5 个严密步骤推进：

1. **步骤 1：搭建 Zustand 全局状态总线 (`simulationStore.ts`)**
   - 汇集 Task 1（计算）、Task 2（天气场景）、Task 3（双轨推演时序）。
   - 实现毫秒级平滑时间步推进、暂停与任意时间拖拽跳跃。
2. **步骤 2：构建 3D 数字孪生可视化场景 (`src/components/3d/`)**
   - 创建 Procedural 3D 地形、水体网格、动态闸门机构与水流流体特效。
   - 绑定水闸当前实际开度与水位标高，实现平滑机械升降动画。
3. **步骤 3：构建 2D 工业级管控面板 (`src/components/dashboard/`)**
   - 实现顶部 KPI 指标卡、状态机运行徽章与联锁报警卡片。
   - 采用 Recharts 绘制 24 小时水文对比曲线图（AI 调蓄 vs 传统漫顶溢流）。
4. **步骤 4：构建 Swagger 自定义数据注入抽屉与情景切换器**
   - 集成 Task 2 中的 `injectCustomScenario`，支持用户随时打开面板输入自定义降雨与潮位数据，即刻刷新 3D 推演。
5. **步骤 5：启动 Vite 开发服务器并进行系统级集成验收 (Checkpoint 4)**
   - 验证 3D 场景在浏览器中渲染达到 60 FPS，无 WebGL 报错。
   - 验证切换三种内置场景及自定义输入时，3D 水位升降、闸门动作、图表同步演进无缝联动。

---

## 7. Checkpoint 4 验收标准与交付规范

| 校验项 | 测试目标与方法 | 验收断言 |
| :--- | :--- | :--- |
| **3D 场景渲染稳定性** | 启动开发服务器并在浏览器加载 3D 画布 | 60 FPS 流畅运行，无 WebGL/Console 错误，支持 360° 旋转缩放 |
| **水闸机械运动与流体特效** | 触发开闸预泄洪（$Q_{out} > 0$）与关闸 | 闸板按 $0.05\text{ m/s}$ 物理平滑升降，水流流体粒子同步喷涌或隐去 |
| **下游联锁瞬时响应** | 注入高潮位或切换至 `SCENARIO_FLASH_FLOOD_HIGH_TIDE` | 3D 闸门顶部红灯闪烁，闸板强制归零，顶部大屏显示联锁警报 |
| **24h 水文历时曲线对比** | 观测图表中的两条水位线 | 清晰呈现传统湿地溢流（$> 3.5\text{ m}$）与智能湿地安全受控，显示避免淹水量 |
| **自定义 Swagger 注入联动** | 打开 Swagger 抽屉输入自定义降雨数据并提交 | 3D 场景与图表瞬间热更新，按用户输入的数据开展全新推演 |

---

## 8. 交付物

- 全套 3D 渲染组件 (`src/components/3d/*`)
- 全套大屏监控组件 (`src/components/dashboard/*`)
- 全局仿真状态机总线 (`src/store/simulationStore.ts`)
- 整合后的现代企业级数字孪生主界面 (`src/App.tsx`)
- 本地服务启动命令与使用说明
