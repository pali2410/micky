import { useEffect, useState } from "react";
import type { ModelCatalogEntry } from "@rakazo/contracts";
import { rpc } from "../lib/rpc";

export function MickyLocalModels() {
  const [models,setModels]=useState<ModelCatalogEntry[]>([]);
  const [error,setError]=useState("");
  useEffect(()=>{void rpc.models.list().then(entries=>setModels(entries.filter(entry=>entry.provider==="local"))).catch(()=>setError("Local models are unavailable"));},[]);
  return <div className="space-y-3"><h2>Local models</h2>{error&&<p role="status">{error}</p>}{models.map(model=><div key={model.id}>{model.id}</div>)}</div>;
}
