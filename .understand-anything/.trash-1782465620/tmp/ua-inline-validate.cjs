const fs=require('fs');
const graph=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const issues=[],warnings=[];
if(!Array.isArray(graph.nodes)){issues.push('nodes missing');graph.nodes=[];}
if(!Array.isArray(graph.edges)){issues.push('edges missing');graph.edges=[];}
const nodeIds=new Set(),seen=new Map();
graph.nodes.forEach((n,i)=>{if(!n.id){issues.push(`Node[${i}] missing id`);return;}if(!n.type)issues.push(`Node '${n.id}' missing type`);if(!n.name)issues.push(`Node '${n.id}' missing name`);if(!n.summary)issues.push(`Node '${n.id}' missing summary`);if(!n.tags||!n.tags.length)issues.push(`Node '${n.id}' missing tags`);if(seen.has(n.id))issues.push(`Dup node '${n.id}'`);else seen.set(n.id,i);nodeIds.add(n.id);});
graph.edges.forEach((e,i)=>{if(!nodeIds.has(e.source))issues.push(`Edge[${i}] source '${e.source}' missing`);if(!nodeIds.has(e.target))issues.push(`Edge[${i}] target '${e.target}' missing`);});
const fl=new Set(['file','config','document','service','pipeline','table','schema','resource','endpoint']);
const fileNodes=graph.nodes.filter(n=>fl.has(n.type)).map(n=>n.id);
const assigned=new Map();
(graph.layers||[]).forEach(l=>(l.nodeIds||[]).forEach(id=>{if(!nodeIds.has(id))issues.push(`Layer '${l.id}' refs missing '${id}'`);if(assigned.has(id))issues.push(`Node '${id}' in multiple layers`);assigned.set(id,l.id);}));
fileNodes.forEach(id=>{if(!assigned.has(id))issues.push(`File node '${id}' not in any layer`);});
(graph.tour||[]).forEach((st,i)=>(st.nodeIds||[]).forEach(id=>{if(!nodeIds.has(id))issues.push(`Tour[${i}] refs missing '${id}'`);}));
const we=new Set([...graph.edges.map(e=>e.source),...graph.edges.map(e=>e.target)]);
graph.nodes.forEach(n=>{if(!we.has(n.id))warnings.push(`orphan '${n.id}'`);});
const stats={nodes:graph.nodes.length,edges:graph.edges.length,layers:(graph.layers||[]).length,tour:(graph.tour||[]).length};
fs.writeFileSync(process.argv[3],JSON.stringify({issues,warnings,stats},null,2));
