# Utility — Conversation Guide

## 1/6 — Problem Statement

**Explore:** What does this tool do? One sentence. If it takes more than one sentence, it might not be a utility.

**Suggest:** Push for brevity: "It takes X and produces Y." If the description is getting complex, ask: "Is this actually an application?" Utilities resist expansion.

**Skip-Condition:** Never skip.

## 2/6 — Scope Guard

**Explore:** One file or multiple? One function or a system? What does this explicitly NOT do? Where's the boundary?

**Suggest:** Actively resist expansion. If the user says "and it could also..." — stop them. "That sounds like a separate tool. Let's keep this one focused." The best utilities do one thing well.

**Skip-Condition:** Never skip.

## 3/6 — User & Distribution

**Explore:** Who uses this — just you, your team, the community? How is it distributed — npm package, local script, MCP server?

**Suggest:** Personal tools need less documentation. Shared tools need a README and clear interface. npm packages need proper packaging.

**Skip-Condition:** Never skip.

## 4/6 — Dependencies

**Explore:** What does this depend on? External APIs, npm packages, system tools? Can you minimize dependencies?

**Suggest:** Fewer deps = less maintenance. If a dependency is heavy, consider lighter alternatives. Zero-dep utilities are the gold standard.

**Skip-Condition:** Never skip.

## 5/6 — Interface

**Explore:** How is it invoked? CLI args, stdin, function call, MCP tool? What's the input format? What's the output format?

**Suggest:** Define the contract: "Input: X (format), Output: Y (format), Errors: Z." If you can't define the interface cleanly, the scope might be too broad.

**Skip-Condition:** Never skip.

## 6/6 — Done Criteria

**Explore:** What are 3-5 test cases that prove this works? Can you define them now? If you can't, the scope might be too vague.

**Suggest:** Write them as: "Given X, expect Y." If every test case is different, the tool might be doing too many things. 3 test cases is the sweet spot.

**Skip-Condition:** Never skip.
