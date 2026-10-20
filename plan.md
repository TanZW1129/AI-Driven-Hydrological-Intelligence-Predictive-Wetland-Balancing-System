# Project Specification: Bandar Bukit Raja (BBR) Smart Flood Mitigation & Wetland Management Prototype

## 1. Role & Objective
You are an expert Full-Stack Developer and Hydrological Systems Architect. Your goal is to build an interactive **Digital Twin & Predictive Flood Mitigation Prototype** for the **125-acre townpark wetland in Bandar Bukit Raja (BBR), Klang, Malaysia**. 

The system acts as an automated "Digital Brain" that combines real-time/forecasted weather APIs, simulated IoT wetland sensors, tidal interlocks, and hydrological runoff formulas to dynamically control motorized sluice gates across three phases: **Pre-Discharge**, **Peak-Shaving (Detention)**, and **Post-Storm Recovery**.

### Execution Rules for AI Agent:
1. **Sequential Execution:** Complete ONE Task Phase at a time.
2. **Stop & Verify:** At the end of each task, run the verification steps, show the output/status to the user, and **WAIT** for user approval before starting the next phase.
3. **Modular Code:** Keep hydrological calculations, API services, IoT simulations, and UI components cleanly separated.

---

## 2. System Architecture & End-to-End Workflow

1. **Data Ingestion Layer:**
   - Fetch hourly precipitation forecasts (`mm/h`) for Bandar Bukit Raja (`lat: 3.085, lon: 101.445`) via the **Open-Meteo API** (or Malaysia `data.gov.my` MET API).
   - Ingest simulated real-time telemetry: Wetland Water Level ($H_{wetland}$), Downstream River/Tidal Level at Klang Strait ($H_{downstream}$), Soil Moisture/Saturation, and Current Gate Status.
2. **Hydrological Engine (The Brain):**
   - Calculate expected stormwater runoff inflow ($Q_{in}$) using the Rational Method.
   - Calculate real-time wetland storage capacity ($V_{avail}$) and sluice gate discharge capability ($Q_{out}$).
   - Check for **Tidal Lock** conditions (preventing backflow when sea/river tide is higher than wetland water level).
3. **Autonomous Decision Matrix (3-Phase Control):**
   - Trigger automated sluice gate commands (`OPEN`, `PARTIAL`, `CLOSE`) based on 6-to-24-hour forecast lookaheads and real-time thresholds.
4. **Visualization & Scenario Simulator (Dashboard):**
   - Display real-time metrics, storage capacity gauges, hydrograph charts (Inflow vs. Outflow vs. Water Level), and a scenario switcher ("Normal Clear Day", "Predicted Heavy Storm in 6h", "1-in-100 Year Flash Flood + High Tide").

---

## 3. Core Parameters, Factors & Mathematical Formulas

Implement these exact formulas and constants in the core calculation module (`hydrologyEngine`):

### A. Geographic & Physical Constants (Bandar Bukit Raja)
- **Coordinates:** `Latitude: 3.0850`, `Longitude: 101.4450`
- **Wetland Area ($A_{wetland}$):** $125\text{ acres} \approx 505,857\text{ m}^2$
- **Upstream Catchment Area ($A_{catchment}$):** Configurable default $500\text{ hectares} = 5,000,000\text{ m}^2$ (represents residential/commercial zones draining into the townpark)
- **Runoff Coefficient ($C$):**
  - Base Urban/Residential: $0.65$
  - Dynamic adjustment based on Soil Saturation ($S \in [0, 1]$):
    $$C_{eff} = C_{base} + (1 - C_{base}) \times S \times 0.3$$
- **Water Level Thresholds ($H_{wetland}$):**
  - $H_{min}$ (Minimum Ecological Level): $1.0\text{ m}$ (must not drain below this to protect wetland biodiversity)
  - $H_{normal}$ (Normal Operating Level): $2.0\text{ m}$
  - $H_{max}$ (Critical Spillover / Flood Level): $3.5\text{ m}$

---

### B. Hydrological Formulas

#### 1. Peak Surface Runoff Inflow (Rational Method)
Calculates the rate of water entering the wetland from the township during rain:
$$Q_{in} = \frac{C_{eff} \cdot i \cdot A_{cat}}{360}$$
- $Q_{in}$: Peak inflow rate ($\text{m}^3/\text{s}$)
- $C_{eff}$: Effective dimensionless runoff coefficient ($0.65 - 0.85$)
- $i$: Rainfall intensity from Weather API or simulator ($\text{mm/hour}$)
- $A_{cat}$: Catchment area in **hectares** ($\text{ha}$, where $1\text{ ha} = 10,000\text{ m}^2$)

#### 2. Total Expected Storm Inflow Volume ($V_{in}$)
For a forecasted storm over $T$ hours:
$$V_{in} = \sum_{t=1}^{T} Q_{in}(t) \times 3600\text{ seconds}$$

#### 3. Available Wetland Buffer Volume ($V_{avail}$)
How much additional stormwater the 125-acre wetland can absorb before overflowing ($H_{max}$):
$$V_{avail} = (H_{max} - H_{current}) \times A_{wetland}$$

#### 4. Sluice Gate Outflow Rate ($Q_{out}$) & Tidal Interlock
Water can only be discharged by gravity if the wetland level is higher than the downstream river/tidal level ($H_{current} > H_{downstream}$):
- **If $H_{current} \le H_{downstream}$ (Tidal Lock Active):**
  $$Q_{out} = 0 \quad (\text{Force Gate Status} = \text{CLOSED to prevent backflow})$$
- **If $H_{current} > H_{downstream}$:**
  $$Q_{out} = C_d \cdot W \cdot O_{gate} \cdot \sqrt{2 \cdot g \cdot (H_{current} - H_{downstream})}$$
  - $C_d$: Discharge coefficient ($0.62$)
  - $W$: Total width of sluice gates (e.g., $10.0\text{ m}$)
  - $O_{gate}$: Gate opening height in meters ($0.0\text{ m}$ to $2.0\text{ m}$)
  - $g$: Gravitational acceleration ($9.81\text{ m/s}^2$)

#### 5. Discrete Time-Step Water Balance (Simulation Loop)
For each time step $\Delta t$ (in seconds):
$$\Delta V = (Q_{in} - Q_{out}) \times \Delta t$$
$$H_{next} = H_{current} + \frac{\Delta V}{A_{wetland}}$$

---

### C. 3-Phase Smart Control State Machine

| Phase | Trigger Condition | Gate Action | Objective |
| :--- | :--- | :--- | :--- |
| **0. Normal Mode** | Forecast 6h rain $< 10\text{ mm}$ AND $H_{current} \approx H_{normal}$ | `CLOSED` / `MINIMAL` | Maintain $2.0\text{ m}$ depth for recreation, cooling, and wetland ecology. |
| **1. Pre-Discharge (Proactive)** | Forecast 6h cumulative rain $> 30\text{ mm}$ OR $V_{in} > V_{avail}$ | `OPEN (100%)` *(if $H_{current} > H_{downstream}$ and $H_{current} > H_{min}$)* | Lower wetland level from $2.0\text{ m}$ down to $1.0\text{ m}$ BEFORE the storm arrives, creating an extra $+505,857\text{ m}^3$ buffer. |
| **2. Peak-Shaving (Detention)** | Active Heavy Rain ($i > 20\text{ mm/h}$) OR Downstream River High ($H_{downstream} > 2.5\text{ m}$) | `CLOSED (0%)` or `THROTTLED` | Trap stormwater inside the 125-acre wetland so it doesn't add pressure to downstream Klang drains during peak storm/high tide. |
| **3. Recovery (Post-Storm)** | Rain stops ($i < 2\text{ mm/h}$) AND $H_{current} > H_{normal}$ AND $H_{current} > H_{downstream}$ | `MODERATE OPEN (50-80%)` | Safely release detained water once downstream drains recede, returning wetland to $2.0\text{ m}$ baseline. |

---

## 4. Step-by-Step Implementation Tasks & Verification Protocol

Execute the following tasks in order. **Stop after each task to verify with the user.**

### [Task 1] Project Scaffolding & Core Hydrological Engine
- **Action:**
  1. Set up the project structure (Backend/Frontend or unified Next.js/React/Python stack based on existing workspace).
  2. Create the `hydrologyEngine` module implementing all constants and formulas ($Q_{in}$, $V_{avail}$, $Q_{out}$, Tidal Lock check, and $\Delta H$ step function).
- **Verification (Checkpoint 1):**
  - Run a unit test or CLI script with: $i = 50\text{ mm/h}$, $A_{cat} = 500\text{ ha}$, $C_{eff} = 0.70$, $H_{current} = 2.0\text{ m}$, $H_{downstream} = 1.2\text{ m}$.
  - Verify that calculated $Q_{in} \approx 48.61\text{ m}^3/\text{s}$ and $V_{avail} \approx 758,785\text{ m}^3$.
  - Show output and wait for approval.

### [Task 2] Weather API Integration & Mock Disaster Injector
- **Action:**
  1. Build a service to fetch live hourly weather data from **Open-Meteo API**:
     `https://api.open-meteo.com/v1/forecast?latitude=3.085&longitude=101.445&hourly=precipitation,rain,soil_moisture_0_to_7cm&timezone=Asia%2FSingapore`
  2. Build a **Scenario Override Injector** so the user can toggle between:
     - `LIVE_API`: Real-time Bandar Bukit Raja weather.
     - `SCENARIO_PRE_STORM`: Clear now, $80\text{ mm/h}$ extreme storm arriving in 4 hours.
     - `SCENARIO_FLASH_FLOOD_HIGH_TIDE`: Active $100\text{ mm/h}$ storm + Klang Strait high tide ($H_{downstream} = 2.8\text{ m}$).
- **Verification (Checkpoint 2):**
  - Log a live response from Open-Meteo for BBR coordinates and demonstrate switching to `SCENARIO_PRE_STORM`. Wait for approval.

### [Task 3] Virtual IoT Sensor Simulator & 3-Phase State Machine
- **Action:**
  1. Create the IoT Telemetry generator (Wetland Ultrasonic Level Sensor, Downstream Tidal Gauge, Soil Moisture Sensor, Sluice Gate Actuator).
  2. Implement the **3-Phase Smart Control State Machine** (`NORMAL`, `PRE_DISCHARGE`, `PEAK_SHAVING`, `RECOVERY`) with automatic **Tidal Lock Protection**.
  3. Add a comparator that runs two parallel simulations: **"Static Traditional Wetland (Fixed Spillway)"** vs. **"AI Smart Wetland (Pre-Discharge + Dynamic Gates)"** to prove how much flood volume is prevented.
- **Verification (Checkpoint 3):**
  - Run a 12-hour accelerated simulation of `SCENARIO_PRE_STORM`. Verify the system enters `PRE_DISCHARGE` before rain starts, drops water level toward $1.0\text{ m}$, switches to `PEAK_SHAVING` during peak rain, and prevents overflow ($H < 3.5\text{ m}$) compared to the static baseline. Wait for approval.

### [Task 4] Interactive Digital Twin Dashboard UI
- **Action:**
  1. Build a clean, modern Command Center Dashboard containing:
     - **Top KPI Cards:** Current Operating Phase badge, Wetland Water Level ($\text{m}$ & $\%$ capacity), Inflow ($Q_{in}$) vs. Outflow ($Q_{out}$), and Tidal Lock Status.
     - **Interactive Wetland Visualizer:** Visual cross-section showing Upstream Inflow $\rightarrow$ 125-Acre Wetland Water Level (with $1.0\text{m}/2.0\text{m}/3.5\text{m}$ markers) $\rightarrow$ Motorized Sluice Gate $\rightarrow$ Downstream Tidal Level.
     - **Time-Series Charts:** 24-hour chart comparing Rainfall Forecast ($\text{mm/h}$), Smart Wetland Level ($\text{m}$), and Traditional Unmanaged Level ($\text{m}$) showing avoided spillover.
     - **Simulation Controls:** Scenario selector buttons, Play/Pause/Step time controls, and Manual Gate Override toggle.
- **Verification (Checkpoint 4):**
  - Launch the local dev server, verify all charts and interactive scenario buttons render without console errors, and present the final instructions to the user.