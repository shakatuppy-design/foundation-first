import { callAnthropicReasoning } from "./src/lib/llm-anthropic.server";
const r = await callAnthropicReasoning({
  agentKey: "management-intelligence-pilot",
  evidence: "Daily orders were:\nMonday 100\nTuesday 95\nWednesday 70.",
  task: "Analyze this situation for management. Separate facts from inference and hypothesis. Do not assume the cause of the decline.",
});
console.log(JSON.stringify(r, null, 2));
