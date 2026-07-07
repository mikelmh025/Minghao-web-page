---
layout: archive
title: "Slides"
permalink: /slides/
author_profile: true
---

{% include base_path %}

Interactive study decks I built while reading through the foundational LLM literature and
the large-scale training/inference systems stack. Both are single-file interactive web apps —
keyboard navigation (`←`/`→`), an overview grid (`G`), full-text search (`/`), dark mode (`D`),
and live ⚡ playgrounds (calculators, animations) embedded in the slides.

LLM Foundations — 39 Papers, Fast-Forward
======

The canonical LLM paper trail (Transformer → BERT/GPT → scaling laws → RLHF → LoRA →
FlashAttention → MoE → test-time scaling → Muon), one slide per paper: what's *actually in the
paper* (the ablations everyone skips) and what's *used in practice today*. Includes live
calculators for Chinchilla-optimal scaling, LoRA parameter counts, GQA KV-cache sizing,
speculative-decoding speedup, and a draggable RoPE rotation demo.

**[▶ Open the deck]({{ base_path }}/decks/llm-foundations.html)**

LLM Infra — Large-Scale Training & Inference
======

The engineering underneath: parallelism axes and the device mesh, collectives, ZeRO/FSDP,
context/tensor/pipeline parallelism, MoE + expert parallelism, and the serving stack
(PagedAttention, continuous batching, KV-cache economics). Sixteen live playgrounds, including
a mesh planner, a per-GPU training-memory calculator, a step-through continuous-batching
simulator, and a ring-attention animation with a causal-bubble toggle.

**[▶ Open the deck]({{ base_path }}/decks/llm-infra.html)**

---

*Best viewed on desktop. Both decks are self-contained HTML — no tracking, no dependencies.*
