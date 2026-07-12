---
layout: archive
title: "Slides & Demos"
permalink: /slides/
author_profile: true
---

{% include base_path %}

Interactive things I've built — study decks for the LLM literature, and playable demos.
Everything is self-contained HTML: no tracking, no accounts, no dependencies.

## 📚 Study Decks

### LLM Foundations — 39 Papers, Fast-Forward

*39 slides · live ⚡ calculators · keyboard-driven (`←`/`→`, `G` grid, `/` search, `D` dark mode)*

The canonical LLM paper trail (Transformer → BERT/GPT → scaling laws → RLHF → LoRA →
FlashAttention → MoE → test-time scaling → Muon), one slide per paper.

- What's *actually in the paper* — the ablations everyone skips — and what's *used in practice today*
- Live calculators: Chinchilla-optimal scaling, LoRA parameter counts, GQA KV-cache sizing, speculative-decoding speedup
- A draggable RoPE rotation demo

<a href="{{ base_path }}/decks/llm-foundations.html"><img src="{{ base_path }}/images/slides-llm-foundations.png" alt="LLM Foundations deck" width="600" style="border-radius:8px;border:1px solid #ddd;"></a>

**[▶ LLM Foundations deck]({{ base_path }}/decks/llm-foundations.html)**

### LLM Infra — Large-Scale Training & Inference

*16 live playgrounds*

The engineering underneath: parallelism axes and the device mesh, collectives, ZeRO/FSDP,
context/tensor/pipeline parallelism, MoE + expert parallelism, and the serving stack
(PagedAttention, continuous batching, KV-cache economics).

- Mesh planner and per-GPU training-memory calculator
- Step-through continuous-batching simulator
- Ring-attention animation with a causal-bubble toggle

<a href="{{ base_path }}/decks/llm-infra.html"><img src="{{ base_path }}/images/slides-llm-infra.png" alt="LLM Infra deck" width="600" style="border-radius:8px;border:1px solid #ddd;"></a>

**[▶ LLM Infra deck]({{ base_path }}/decks/llm-infra.html)**

## 🕹 Interactive Projects

### The Arcade — 31 Homemade Web Games

*31 games · canvas/WebGL · works on phones · agent-built, simulation-tested*

A side project: a full web arcade where every game is one self-contained HTML file with
synthesized audio, and all of them share a coin economy, a collectible card gacha, and
daily missions. Progress lives in your browser — no accounts, no real money.

- **Echo Hunter** — you're blind; the world renders only where your sonar ping sweeps it (and the creatures hear your pings)
- **Terrarium & Ant Empire** — zero-player simulations: an ecosystem whose creatures measurably *evolve*, and real pheromone-trail stigmergy
- **Star Forge** — a true-3D n-body gravity sandbox: fling planets, capture moons

<a href="{{ base_path }}/arcade/arcade.html"><img src="{{ base_path }}/images/slides-arcade.png" alt="The Arcade" width="600" style="border-radius:8px;border:1px solid #ddd;"></a>

**[▶ Enter the Arcade]({{ base_path }}/arcade/arcade.html)**

---

*Best viewed on desktop; the arcade also plays great on a phone.*
