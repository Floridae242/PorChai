# PorChai Landing Implementation Plan

> Execute with superpowers:executing-plans in the current session.

**Goal:** Public LINE-first student introduction linked to the existing MINI App.
**Architecture:** Server landing with a small client chat preview and scoped CSS module;
existing authenticated client moves to /miniapp without changing token verification.
**Tech Stack:** Next.js 16, React, TypeScript, CSS modules, Vitest.
**Spec:** docs/superpowers/specs/2026-11-11-porchai-landing.md

- [x] Create /miniapp route; retain verified-token gate and public business demo.
- [x] Build responsive landing, three interactive illustrative chat scenes, FAQ and CTAs.
- [x] Update Console endpoint documentation and current feature status.
- [x] Run tests/lint/typecheck, browser checks on desktop and 390px, and final code review.

Ruling: Set the Developing Console endpoint to HTTPS /miniapp. LIFF initialization
and callbacks share the same route, including plain MINI App launches without URL
parameters. The public landing does not guess whether a visitor came from LINE.

Verification: 60 tests passed; lint, typecheck and diff whitespace check passed.
Browser: desktop 1440px and mobile 390px; no horizontal overflow at 390px,
chat selection updates the example, FAQ expands, CTA reaches the LINE login gate.
Review's callback concern was resolved by using the explicit /miniapp endpoint.
Production build remains unverified: Turbopack fails while spawning the global
CSS loader with port-binding EPERM, including a retry outside the sandbox.
Real LINE authentication and Console verification still require the team's HTTPS
Developing endpoint and credentials; no deployment was performed.

Update on 12 November: the subsequent LINE integration task fixed production
builds and set up a temporary HTTPS endpoint. See `docs/LINE-LIVE-SETUP.md` for
the latest real-check results and tester-role requirement.
