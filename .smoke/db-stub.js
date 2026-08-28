export const fixAssets = [
  { id:'m1', name:'Fidelity MSCI World Index', ticker:'IE00BYX5NX33', platform:'MyInvestor', type:'Fondo', category:'RV', participaciones:201.011, costeMedio:12.29, aportado:3470, valorActual:2839.86, gananciaEur:-630.14, gananciaPct:-18.16, manual:false, planMensual:true },
  { id:'t1', name:'Fidelity MSCI World Index', ticker:'IE00BYX5NX33', platform:'Trade Republic', type:'Fondo', category:'RV', participaciones:22.44, costeMedio:11.1, aportado:250, valorActual:317.05, gananciaEur:67.05, gananciaPct:26.82, manual:false, planMensual:true },
  { id:'a1', name:'Amper S.A.', ticker:'AMP', platform:'MyInvestor', type:'Acción', category:'RV', participaciones:309, costeMedio:3.55, aportado:1097.05, valorActual:1461.57, gananciaEur:364.52, gananciaPct:33.23, manual:false, planMensual:false },
];
const nav = { open:13.8396, close:13.9685 }, nav2 = { open:13.9831, close:13.9495 };
export async function fetchAssets() { return fixAssets }
export async function fetchFundMonthly() { return [] }
export async function fetchSnapshots() { return [] }
export async function fetchContributions() { return [
  { assetId:'m1', month:'2026-06', aportado:320 }, { assetId:'m1', month:'2026-07', aportado:360 },
  { assetId:'t1', month:'2026-06', aportado:50 },  { assetId:'t1', month:'2026-07', aportado:50 },
] }
export async function fetchNavSeries() { return {
  m1: { symbol:'0P0001CLDK.F', currency:'EUR', months:{ '2026-06':nav, '2026-07':nav2 } },
  t1: { symbol:'0P0001CLDK.F', currency:'EUR', months:{ '2026-06':nav, '2026-07':nav2 } },
} }
export function contribSupported() { return true }
export function manualSupported() { return true }
export function planSupported() { return true }
export function snapshotsSupported() { return true }
export async function upsertAsset() { return [{ id:'m1' }] }
export async function deleteAsset() {}
export async function setAssetManual() {}
export async function bulkUpdateAssetValues() {}
export async function saveMonthContributions() {}
export async function deleteMonthContributions() {}
export async function saveSnapshots() { return 0 }
export async function upsertFundMonth() { return [{ id:'x' }] }
export async function deleteFundMonth() {}
export async function bulkUpdateFundValues() {}
