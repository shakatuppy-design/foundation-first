const k=process.env.ANTHROPIC_API_KEY;
const m=await fetch("https://api.anthropic.com/v1/models?limit=100",{headers:{"x-api-key":k,"anthropic-version":"2023-06-01"}});
const j=await m.json();
console.log(j.data.map(d=>d.id).join("\n"));
