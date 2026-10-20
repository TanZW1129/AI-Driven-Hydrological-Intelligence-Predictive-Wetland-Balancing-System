# Task 1 详细实施方案：项目脚手架搭建与水文学/安全联锁核心引擎

本文档定义了 **Bandar Bukit Raja (BBR) 智慧防洪与湿地管理数字孪生原型** 的 **Task 1** 详细执行规范、模块架构、水文学算法逻辑、全生命周期下游联锁安全设计及验收标准（Checkpoint 1）。

---

## 1. 目标与范围 (Objective & Scope)

Task 1 的核心目标是**奠定坚实、类型安全且高扩展性的企业级工程底座**，并实现纯逻辑水文学与安全控制引擎：
1. **工程骨架搭建**：构建基于 **Vite + React 18/19 + TypeScript + Tailwind CSS** 的现代化前端工程，预留 WebGL/Three.js 与大屏 UI 的完整依赖支持。
2. **水文学物理计算引擎 (`hydrologyEngine`)**：实现入流（Rational Method）、可用库容（Available Storage）、水闸出流（Orifice Discharge）以及离散时间步水平衡更新（Water Balance）。
3. **全生命周期下游联锁安全系统 (`downstreamInterlock`)**：
   - **开闸前准入严审（Pre-Discharge Safety Check）**
   - **排水中动态实时监控与瞬时熔断（In-Flight Auto-Halt & Lockout）**
4. **自动化验证套件（Checkpoint 1 Verification）**：编写独立运行的验证脚本，对所有水文公式及安全拦截逻辑进行严苛的单元与边界测试。

---

## 2. 目录结构与架构设计 (Project Architecture)

在 `C:\Users\Tan Zhi Wei\Desktop\Sime Darby` 目录下建立清晰、高内聚低耦合的企业级工程目录：

```text
Sime Darby/
├── package.json                   # 项目依赖与脚本配置
├── tsconfig.json                  # TypeScript 严格类型配置
├── tsconfig.node.json
├── vite.config.ts                 # Vite 构建配置（支持别名与优化）
├── tailwind.config.js             # Tailwind CSS 配置
├── postcss.config.js
├── index.html                     # SPA 入口 HTML
├── scripts/
│   └── verify-task1.ts            # Task 1 自动化基准与安全验证脚本
├── src/
│   ├── constants/
│   │   └── hydrologyConstants.ts  # BBR 地理常量、湿地尺寸、安全阈值
│   ├── types/
│   │   └── hydrology.ts           # 核心水文、遥测、状态机与安全类型定义
│   ├── core/
│   │   ├── hydrologyEngine.ts     # 纯函数水文计算引擎 (Qin, Vavail, Qout, Water Balance)
│   │   └── downstreamInterlock.ts # 全生命周期下游动态安全联锁守护器
│   ├── assets/                    # 静态资源与样式
│   ├── App.tsx                    # 基础应用入口
│   └── main.tsx                   # React 渲染入口
├── plan.md                        # 项目总体规划
└── implementation_plan.md         # 本 Task 1 实施计划文档
```

---

## 3. 核心物理常数与数学模型规范 (Mathematical Specifications)

所有水文计算遵循严格的国际水利学与《城市暴雨径流计算规范》（合理化经验公式 Rational Method）：

### 3.1 地理与物理常量 (`src/constants/hydrologyConstants.ts`)
| 常量名 | 物理意义 | 数值与单位 |
| :--- | :--- | :--- |
| `BBR_LATITUDE` | Bandar Bukit Raja 纬度 | `3.0850` |
| `BBR_LONGITUDE` | Bandar Bukit Raja 经度 | `101.4450` |
| `WETLAND_AREA` ($A_{wetland}$) | 湿地总面积 (125 英亩) | $505,857.0\text{ m}^2$ |
| `DEFAULT_CATCHMENT_AREA` ($A_{cat}$) | 上游市镇汇水面积 (500 公顷) | $500.0\text{ ha} = 5,000,000\text{ m}^2$ |
| `BASE_RUNOFF_COEFF` ($C_{base}$) | 基础城市径流系数 | $0.65$ |
| `H_MIN_ECOLOGICAL` ($H_{min}$) | 湿地生态保护最低底线水位 | $1.0\text{ m}$ |
| `H_NORMAL_OPERATING` ($H_{normal}$) | 湿地常态景观/运营水位 | $2.0\text{ m}$ |
| `H_MAX_CRITICAL` ($H_{max}$) | 湿地临界溢流/防洪警戒水位 | $3.5\text{ m}$ |
| `GATE_WIDTH` ($W$) | 泄洪电动水闸总净宽 | $10.0\text{ m}$ |
| `GATE_MAX_OPENING` ($O_{max}$) | 水闸最大开启高度 | $2.0\text{ m}$ |
| `DISCHARGE_COEFF` ($C_d$) | 水闸孔口出流流量系数 | $0.62$ |
| `GRAVITY_ACCEL` ($g$) | 重力加速度 | $9.81\text{ m/s}^2$ |

---

### 3.2 水文学计算函数 (`src/core/hydrologyEngine.ts`)

#### 1. 动态径流系数计算 ($C_{eff}$)
结合土壤湿度饱和度 $S \in [0, 1]$ 动态调节：
$$C_{eff} = C_{base} + (1 - C_{base}) \times S \times 0.3$$
- 当土壤完全干燥（$S = 0$）：$C_{eff} = 0.65$
- 当土壤完全饱和（$S = 1$）：$C_{eff} = 0.65 + 0.35 \times 0.3 = 0.755$

#### 2. 地表汇流入流速率计算 ($Q_{in}$)
采用 Rational Method（合理化公式）：
$$Q_{in} = \frac{C_{eff} \cdot i \cdot A_{cat}}{360}$$
- $Q_{in}$：入流速率 ($\text{m}^3/\text{s}$)
- $i$：降雨强度 ($\text{mm/h}$)
- $A_{cat}$：汇水面积 ($\text{ha}$)

#### 3. 可用缓冲库容计算 ($V_{avail}$)
距警戒溢流水位 ($H_{max}$) 所剩容积：
$$V_{avail} = \max\left(0, (H_{max} - H_{current}) \times A_{wetland}\right)$$

#### 4. 闸门孔口重力出流速率计算 ($Q_{out}$)
在下游安全且水闸开启高度为 $O_{gate} \in [0, O_{max}]$ 时：
$$Q_{out} = C_d \cdot W \cdot O_{gate} \cdot \sqrt{2 \cdot g \cdot (H_{current} - H_{downstream})}$$
- 若 $H_{current} \le H_{downstream}$（下游水位反超）或触发安全熔断，则强制 $Q_{out} = 0$。

#### 5. 离散步长时间积分更新 (Water Balance Step)
给定时间步长 $\Delta t$（秒，如 $60\text{s}$ 或 $3600\text{s}$）：
$$\Delta V = (Q_{in} - Q_{out}) \times \Delta t$$
$$H_{next} = \max\left(0, H_{current} + \frac{\Delta V}{A_{wetland}}\right)$$

---

## 4. 绝对下游联锁安全机制设计 (`src/core/downstreamInterlock.ts`)

为确保“**无论何时在开闸前必须校验下游，且排水中下游超标时立即暂停排水**”，设计独立的安全守护系统：

### 4.1 安全门限常量
- **最小正水头压差** ($\Delta H_{safe}$): 设定为 $0.10\text{ m}$（湿地必须高于下游至少 10cm，杜绝低水头湍流不稳定及微弱倒灌）。
- **下游河道警戒阈值** ($H_{downstream\_critical}$): 设定为 $2.50\text{ m}$（当下游巴生河水位达到或超过 2.5m 时，下游自身已处于行洪高位，严禁继续向下游排水以防灾情叠加）。
- **湿地生态安全红线** ($H_{min}$): 设定为 $1.00\text{ m}$（湿地水位不可排至 1.0m 以下）。

### 4.2 双重校验逻辑

```typescript
export interface DownstreamSafetyEvaluation {
  canDischarge: boolean;           // 是否允许开闸/维持排水
  activeLockout: boolean;          // 是否触发强制闭锁
  reasonCode: InterlockReasonCode; // 状态原因码
  diagnosticMessage: string;       // 详细诊断提示信息
  recommendedGateOpening: number;  // 建议闸门开度 (安全允许开度或强制 0)
}
```

#### 机制 A：开闸前准入校验 (`evaluatePreDischargeSafety`)
在系统准备开闸下泄前调用：
1. **湿地红线检查**：若 $H_{wetland} \le H_{min}$ $\rightarrow$ 拒绝开闸 (`REASON: ECOLOGICAL_LIMIT_REACHED`)。
2. **防倒灌水头检查**：若 $H_{wetland} - H_{downstream} < \Delta H_{safe}$ $\rightarrow$ 拒绝开闸 (`REASON: TIDAL_BACKFLOW_RISK`)。
3. **下游防洪承受力检查**：若 $H_{downstream} \ge H_{downstream\_critical}$ $\rightarrow$ 拒绝开闸 (`REASON: DOWNSTREAM_CAPACITY_EXCEEDED`)。
4. 只有三项全部通过，才签发 `canDischarge: true` 准许令。

#### 机制 B：排水中毫秒级动态熔断监控 (`monitorActiveDischarge`)
在排水过程中的每一个仿真时钟周期（Step）执行持续监控：
- **瞬时熔断触发**：只要检测到下游河道水位突然上涨使条件破损（例如下游暴雨山洪涌入导致 $H_{downstream} \ge 2.5\text{m}$，或海峡潮汐迅速涌入导致压差小于安全值）：
  - 立即输出：`canDischarge = false`, `activeLockout = true`, `recommendedGateOpening = 0.0`。
  - 触发紧急安全挂起指令 (`EMERGENCY_HALT`)，强制电机关闭闸门至 $0\text{ m}$。
- **迟滞回差恢复（Hysteresis Recovery）**：
  - 为防止闸门在临界水位来回频繁振荡（Hunting Effect），当下游水位回落至安全线下（例如 $H_{downstream} \le H_{downstream\_critical} - 0.15\text{ m}$）且压差恢复稳定，方可解除闭锁，进入平稳恢复评估。

---

## 5. 详细执行步骤 (Step-by-Step Execution Sequence)

Task 1 分为以下 5 个具体实施步骤：

### 步骤 1：初始化工程脚手架与依赖
- 初始化 `package.json`，配置依赖：
  - 基础：`react`, `react-dom`, `lucide-react`, `zustand`
  - 3D 渲染库预埋：`three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`
  - 数据可视化：`recharts`
  - 工具与样式：`tailwindcss`, `postcss`, `autoprefixer`, `clsx`, `tailwind-merge`
  - 开发工具：`vite`, `typescript`, `tsx`（用于直接执行 TS 验证脚本）
- 配置 `vite.config.ts`、`tsconfig.json`、`tailwind.config.js`。

### 步骤 2：创建水文学常量与类型系统
- 编写 `src/constants/hydrologyConstants.ts`：固化经纬度、几何尺寸、水文与闸门常量。
- 编写 `src/types/hydrology.ts`：定义完整的强类型接口（遥测帧、水力参数、闸门动作、安全联锁结果）。

### 步骤 3：编写水文核心计算引擎 (`hydrologyEngine.ts`)
- 编写纯函数式计算单元：
  - `calculateEffectiveRunoffCoefficient`
  - `calculateRunoffInflow`
  - `calculateAvailableStorage`
  - `calculateGateDischarge`
  - `stepWaterBalance`
- 确保所有公式不依赖全局可变状态，数学计算严格精确。

### 步骤 4：编写下游全生命周期安全联锁模块 (`downstreamInterlock.ts`)
- 实现开闸前准入校验函数 `evaluatePreDischargeSafety`。
- 实现排水全过程动态熔断监控函数 `monitorActiveDischarge`。
- 封装高可靠性的状态转换与日志诊断信息输出。

### 步骤 5：构建自动化验证套件 (`scripts/verify-task1.ts`)
- 编写全自动测试脚本，覆盖六大验收用例（入流标准值、库容计算、孔口出流、开闸前拦截、排水中途遭遇下游涌浪瞬时熔断、水位步进积分）。
- 执行测试并输出格式化验证报告。

---

## 6. 验收标准与检查点 (Checkpoint 1 Verification Protocol)

在 Task 1 结束时，必须执行自动化验证脚本，并达到以下严格的量化指标：

| 校验项 | 测试输入边界 | 预期理论值 | 容差要求 |
| :--- | :--- | :--- | :--- |
| **用例 1: 峰值地表径流入流 ($Q_{in}$)** | $i = 50.0\text{ mm/h}$, $A_{cat} = 500\text{ ha}$, $C_{eff} = 0.70$ | $Q_{in} = \frac{0.70 \times 50 \times 500}{360} = \mathbf{48.611\text{ m}^3/\text{s}}$ | 绝对误差 $< 0.01\text{ m}^3/\text{s}$ |
| **用例 2: 湿地可用缓冲库容 ($V_{avail}$)** | $H_{current} = 2.0\text{ m}$, $H_{max} = 3.5\text{ m}$, $A = 505,857\text{ m}^2$ | $V_{avail} = 1.5 \times 505,857 = \mathbf{758,785.50\text{ m}^3}$ | 绝对误差 $< 1.0\text{ m}^3$ |
| **用例 3: 重力孔口出流 ($Q_{out}$)** | $H_{wetland} = 2.0\text{ m}$, $H_{down} = 1.2\text{ m}$, 闸门全开 ($O=2.0\text{ m}$) | $Q_{out} = 0.62 \times 10 \times 2 \times \sqrt{2 \times 9.81 \times 0.8} \approx \mathbf{49.12\text{ m}^3/\text{s}}$ | 相对误差 $< 1\%$ |
| **用例 4: 开闸前准入拦截** | 下游处于超高水位 $H_{down} = 2.6\text{ m} > 2.5\text{ m}$，申请开闸预排 | **系统拒绝开闸** (`canDischarge: false`, 闸门保持 0%) | 状态必须为拒绝，原因码明确 |
| **用例 5: 排水过程动态瞬时熔断** | 水闸以 100% 排水中，下游水位突然从 1.5m 暴涨至 2.55m（或压差 $< 0.1\text{m}$） | **毫秒级触发熔断** (`activeLockout: true`，闸门强制归零 0%) | 闸门必须强制关闭，禁止排泄 |
| **用例 6: 水位平衡步进迭代** | 设定入流大于出流持续 1 小时，观察湿地水位上升计算 | 水位平滑上升且计算结果符合质量守恒公式 | 数值严格守恒 |

---

## 7. 交付物产出

Task 1 实施完毕后，代码库中将包含：
1. 完整的项目基础配置与依赖（`package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js` 等）。
2. 类型定义文件 [src/types/hydrology.ts](file:///C:/Users/Tan%20Zhi%20Wei/Desktop/Sime%20Darby/src/types/hydrology.ts)。
3. 物理常数文件 [src/constants/hydrologyConstants.ts](file:///C:/Users/Tan%20Zhi%20Wei/Desktop/Sime%20Darby/src/constants/hydrologyConstants.ts)。
4. 水文核心引擎 [src/core/hydrologyEngine.ts](file:///C:/Users/Tan%20Zhi%20Wei/Desktop/Sime%20Darby/src/core/hydrologyEngine.ts)。
5. 安全联锁模块 [src/core/downstreamInterlock.ts](file:///C:/Users/Tan%20Zhi%20Wei/Desktop/Sime%20Darby/src/core/downstreamInterlock.ts)。
6. 自动化验收脚本 [scripts/verify-task1.ts](file:///C:/Users/Tan%20Zhi%20Wei/Desktop/Sime%20Darby/scripts/verify-task1.ts) 及其运行成功的测试报告。
