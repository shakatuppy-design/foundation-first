import { reasoningOutputSchema, reasoningInputSchema } from "./src/lib/reasoning-contract";
const good={observed:["a"],inferred:[],hypotheses:[],counter_hypotheses:[],missing_information:[],recommendation:[],confidence:0.5,reasoning_status:"COMPLETE"};
const cases: [string,unknown][]=[
["valid",good],
["extra field",{...good,extra:1}],
["missing field",(()=>{const c={...good} as any;delete c.observed;return c;})()],
["bad confidence",{...good,confidence:1.5}],
["bad status",{...good,reasoning_status:"YOLO"}],
["not object","hello"],
];
for(const [n,v] of cases) console.log(n, reasoningOutputSchema.safeParse(v).success);
console.log("wrong agentKey", reasoningInputSchema.safeParse({agentKey:"other-agent",evidence:"x",task:"y"}).success);
console.log("pilot agentKey", reasoningInputSchema.safeParse({agentKey:"management-intelligence-pilot",evidence:"x",task:"y"}).success);
