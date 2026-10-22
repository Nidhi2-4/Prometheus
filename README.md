# Swasthik (Prometheus Healthcare)

> **AI-Powered Early Health Risk Detection & Healthcare Access Navigation**  
> *"Check early. Reach care faster."*

---

## 📌 Current Status & Agent Notice

> [!IMPORTANT]
> **Active Focus: FRONTEND IMPLEMENTATION**  
> We are currently focused on building the **Frontend interface and client experience** (user intake, multi-lingual flows, icon/voice interactions, red-flag emergency detection, and result/triage screens).

> [!NOTE]
> **Tech Stack is NOT FINAL**:  
> The technologies listed in this document reflect the current baseline specification. The engineering team will review, modify, and finalize the exact stack and libraries as development progresses. Agents should write modular, decoupled code that can easily adapt to framework or dependency changes.

---

## 📑 Core Documentation

For the complete technical specification, screen inventories, ML model specifications, emergency rules, and architecture blueprints, please refer to:

- 📖 **[`PROJECT_SPEC.md`](file:///Users/nidhiii/Prometheus-Healthcare/PROJECT_SPEC.md)** — Comprehensive project specification and system architecture guide.

---

## 🚀 Key Highlights & Architectural Directives

1. **Patient Location Integration**:
   - Geolocation (GPS with manual fallback for district selection) is an integral part of the client state and backend requests.
   - Used for proximity-based ranking of Primary Health Centres (PHCs), Community Health Centres (CHCs), emergency-capable hospitals, and Ayushman Bharat (PM-JAY) empanelled facilities.

2. **Session-Based Authentication (Over JWT)**:
   - System architecture utilizes **session-based authentication** (server-side managed sessions / session IDs / secure cookies) instead of standard stateless JWT verification.
   - Supports anonymous/guest onboarding with session persistence, upgradable to permanent accounts.

3. **Safety-First Principle**:
   - **Deterministic Emergency Red-Flag Engine (RF01–RF10)** runs locally on the device (fully offline, sub-second latency).
   - Compute-heavy ML inferences (chronic disease risk, rPPG heart rate signal gating, cough sound classification) are offloaded to backend services.
   - AI outputs are triage guidance, **never definitive diagnoses**.

4. **Inclusive UX**:
   - Multilingual support: **English, Hindi (हिंदी), and Marathi (मराठी)**.
   - Multimodal inputs: Voice input (STT), Text-to-Speech (TTS), and visual icon cards tailored for low-literacy users.
