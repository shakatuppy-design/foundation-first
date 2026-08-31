const k=process.env.ANTHROPIC_API_KEY;
console.log("keylen",k?.length, "prefix", k?.slice(0,7));
const m=await fetch("https://api.anthropic.com/v1/models",{headers:{"x-api-key":k,"anthropic-version":"2023-06-01"}});
console.log("models",m.status,(await m.text()).slice(0,800));
