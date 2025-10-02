// Data Utilities Module
// Shared data transformation, stats helpers, formatting.
const DataUtils = {
  formatHours(seconds) { return (seconds/3600).toFixed(1) + 'h'; },
  sum(arr, sel = x=>x) { return arr.reduce((a,v)=> a + sel(v), 0); },
  groupBy(arr, keyFn) { return arr.reduce((acc, item)=>{ const k = keyFn(item); (acc[k]||(acc[k]=[])).push(item); return acc; }, {}); },
  clamp(v,min,max){ return Math.min(max, Math.max(min,v)); },
  // Safe deep clone for plain objects
  clone(obj){ try { return JSON.parse(JSON.stringify(obj)); } catch(e){ return null; } },
};

window.DataUtils = DataUtils;